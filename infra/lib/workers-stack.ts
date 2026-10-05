import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";
import { ACCOUNT, DOMAIN, REGION } from "./config.js";
import type { DataStack } from "./data-stack.js";
import type { NetworkStack } from "./network-stack.js";
import type { StorageStack } from "./storage-stack.js";

export interface WorkersStackProps extends StackProps {
  network: NetworkStack;
  storage: StorageStack;
  data: DataStack;
  /** Grants sns:Publish and sets SMS_ENABLED=1 on the notifier delivery function. */
  smsEnabled?: boolean | undefined;
  notifyFromEmail?: string | undefined;
}

const MODEL_ID = "apac.amazon.nova-pro-v1:0";
const repoPath = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));

/** Post-call and notifier workers as VPC Lambdas, the queue mapping, schedules, IAM and DLQ alarm. */
export class WorkersStack extends Stack {
  readonly postCallFn: lambda.Function;
  readonly sweepFn: lambda.Function;
  readonly deliverFn: lambda.Function;
  readonly remindersFn: lambda.Function;
  readonly dlqAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: WorkersStackProps) {
    super(scope, id, props);
    const { vpc, lambdaSg } = props.network;
    const { dbSecret, appSecret } = props.data;
    const { postCallQueue, postCallDlq } = props.storage;
    const smsEnabled = props.smsEnabled === true;
    const fromEmail = props.notifyFromEmail ?? "appointments@muxaris.com";

    const fn = (
      fnId: string,
      entry: string,
      handler: string,
      memory: number,
      timeoutS: number,
      extra: Record<string, string>,
    ) =>
      new nodejs.NodejsFunction(this, fnId, {
        entry: repoPath(entry),
        handler,
        projectRoot: repoPath(""),
        depsLockFilePath: repoPath("package-lock.json"),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: memory,
        timeout: Duration.seconds(timeoutS),
        vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [lambdaSg],
        logRetention: logs.RetentionDays.ONE_MONTH,
        bundling: {
          format: nodejs.OutputFormat.ESM,
          target: "node22",
          minify: false,
          sourceMap: true,
          externalModules: ["pg-native"],
          banner:
            "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
          mainFields: ["module", "main"],
        },
        environment: {
          NODE_ENV: "production",
          DATABASE_SSL: "verify",
          DB_SECRET_ARN: dbSecret.secretArn,
          APP_SECRET_ARN: appSecret.secretArn,
          ...extra,
        },
      });

    const postCall = "workers/post-call/src/lambda.ts";
    const notifier = "workers/notifier/src/lambda.ts";
    const model = { POST_CALL_MODEL_ID: MODEL_ID };
    const notify = {
      NOTIFY_PROVIDER: "aws",
      NOTIFY_FROM_EMAIL: fromEmail,
      ...(smsEnabled ? { SMS_ENABLED: "1" } : {}),
    };
    this.postCallFn = fn("PostCallFn", postCall, "handler", 1024, 300, model);
    this.sweepFn = fn("SweepFn", postCall, "sweepHandler", 512, 120, model);
    this.deliverFn = fn("DeliverFn", notifier, "deliverHandler", 512, 120, notify);
    this.remindersFn = fn("RemindersFn", notifier, "remindersHandler", 512, 120, notify);

    for (const f of [this.postCallFn, this.sweepFn, this.deliverFn, this.remindersFn]) {
      dbSecret.grantRead(f);
      appSecret.grantRead(f);
    }

    this.postCallFn.addEventSource(
      new SqsEventSource(postCallQueue, {
        batchSize: 5,
        maxBatchingWindow: Duration.seconds(5),
        reportBatchItemFailures: true,
      }),
    );
    postCallQueue.grantConsumeMessages(this.postCallFn);

    const bedrock = new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel"],
      resources: [
        `arn:aws:bedrock:${REGION}:${ACCOUNT}:inference-profile/${MODEL_ID}`,
        "arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0",
      ],
    });
    this.postCallFn.addToRolePolicy(bedrock);
    this.sweepFn.addToRolePolicy(bedrock);

    const ses = new iam.PolicyStatement({
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: [`arn:aws:ses:${REGION}:${ACCOUNT}:identity/${DOMAIN}`],
    });
    this.deliverFn.addToRolePolicy(ses);
    this.remindersFn.addToRolePolicy(ses);
    if (smsEnabled) {
      this.deliverFn.addToRolePolicy(
        new iam.PolicyStatement({ actions: ["sns:Publish"], resources: ["*"] }),
      );
    }

    const schedule = (ruleId: string, rate: Duration, target: lambda.Function) =>
      new events.Rule(this, ruleId, {
        schedule: events.Schedule.rate(rate),
        targets: [new targets.LambdaFunction(target)],
      });
    schedule("DeliverSchedule", Duration.minutes(1), this.deliverFn);
    schedule("RemindersSchedule", Duration.minutes(15), this.remindersFn);
    schedule("SweepSchedule", Duration.minutes(15), this.sweepFn);

    this.dlqAlarm = new cloudwatch.Alarm(this, "PostCallDlqAlarm", {
      metric: postCallDlq.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: "Post-call jobs are landing in the dead-letter queue",
    });
  }
}
