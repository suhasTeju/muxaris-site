import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { ENV } from "../lib/config.js";
import { DataStack } from "../lib/data-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { StorageStack } from "../lib/storage-stack.js";
import { WorkersStack } from "../lib/workers-stack.js";

function build(smsEnabled?: boolean) {
  const app = new App();
  const net = new NetworkStack(app, "N", { env: ENV });
  const storage = new StorageStack(app, "S", { env: ENV });
  const data = new DataStack(app, "D", { env: ENV, network: net });
  const stack = new WorkersStack(app, "W", {
    env: ENV,
    network: net,
    storage,
    data,
    ...(smsEnabled === undefined ? {} : { smsEnabled }),
  });
  return { stack, t: Template.fromStack(stack), tData: Template.fromStack(data) };
}

const fnProps = (t: Template, handler: string) =>
  Object.values(t.findResources("AWS::Lambda::Function")).find((r) =>
    (r as { Properties: { Handler: string } }).Properties.Handler.endsWith(handler),
  ) as { Properties: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("WorkersStack", () => {
  const { t, stack } = build();

  it("four arm64 nodejs22 functions in the VPC with the right sizes", () => {
    const fns = t.findResources("AWS::Lambda::Function", { Properties: { Runtime: "nodejs22.x" } });
    expect(Object.keys(fns)).toHaveLength(4);
    const expected: Record<string, [number, number]> = {
      "index.handler": [1024, 300],
      "index.sweepHandler": [512, 120],
      "index.deliverHandler": [512, 120],
      "index.remindersHandler": [512, 120],
    };
    for (const [h, [mem, to]] of Object.entries(expected)) {
      const p = fnProps(t, h).Properties;
      expect(p.MemorySize).toBe(mem);
      expect(p.Timeout).toBe(to);
      expect(p.Architectures).toEqual(["arm64"]);
      expect(p.VpcConfig.SecurityGroupIds).toHaveLength(1);
      expect(p.VpcConfig.SubnetIds.length).toBeGreaterThan(0);
    }
  });

  it("SQS mapping with partial batch failures", () => {
    t.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
      BatchSize: 5,
      MaximumBatchingWindowInSeconds: 5,
      FunctionResponseTypes: ["ReportBatchItemFailures"],
    });
  });

  it("schedules", () => {
    t.resourceCountIs("AWS::Events::Rule", 3);
    t.resourcePropertiesCountIs("AWS::Events::Rule", { ScheduleExpression: "rate(1 minute)" }, 1);
    t.resourcePropertiesCountIs("AWS::Events::Rule", { ScheduleExpression: "rate(15 minutes)" }, 2);
  });

  it("bedrock, ses and secrets IAM", () => {
    t.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "bedrock:InvokeModel",
            Resource: [
              "arn:aws:bedrock:ap-south-1:005533348545:inference-profile/apac.amazon.nova-pro-v1:0",
              "arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0",
            ],
          }),
        ]),
      },
    });
    t.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ["ses:SendEmail", "ses:SendRawEmail"],
            Resource: "arn:aws:ses:ap-south-1:005533348545:identity/muxaris.com",
          }),
        ]),
      },
    });
    t.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: Match.arrayWith(["secretsmanager:GetSecretValue"]) }),
        ]),
      },
    });
    expect(JSON.stringify(t.toJSON())).not.toContain("s3:GetObject");
  });

  it("no sns:Publish by default, granted when smsEnabled", () => {
    expect(JSON.stringify(t.toJSON())).not.toContain("sns:Publish");
    const sms = build(true).t;
    sms.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([Match.objectLike({ Action: "sns:Publish", Resource: "*" })]),
      },
    });
    const env = fnProps(sms, "index.deliverHandler").Properties.Environment.Variables;
    expect(env.SMS_ENABLED).toBe("1");
    expect(
      fnProps(t, "index.deliverHandler").Properties.Environment.Variables.SMS_ENABLED,
    ).toBeUndefined();
  });

  it("DLQ alarm", () => {
    t.hasResourceProperties("AWS::CloudWatch::Alarm", {
      MetricName: "ApproximateNumberOfMessagesVisible",
      Threshold: 1,
      EvaluationPeriods: 1,
      Period: 300,
    });
    expect(stack.dlqAlarm).toBeDefined();
  });

  it("environment", () => {
    const post = fnProps(t, "index.handler").Properties.Environment.Variables;
    expect(post).toMatchObject({
      NODE_ENV: "production",
      DATABASE_SSL: "verify",
      POST_CALL_MODEL_ID: "apac.amazon.nova-pro-v1:0",
    });
    expect(post.AWS_REGION).toBeUndefined();
    expect(post.DB_SECRET_ARN).toHaveProperty("Fn::ImportValue");
    const sweep = fnProps(t, "index.sweepHandler").Properties.Environment.Variables;
    expect(sweep.POST_CALL_MODEL_ID).toBe("apac.amazon.nova-pro-v1:0");
    for (const h of ["index.deliverHandler", "index.remindersHandler"]) {
      const env = fnProps(t, h).Properties.Environment.Variables;
      expect(env.NOTIFY_PROVIDER).toBe("aws");
      expect(env.NOTIFY_FROM_EMAIL).toBe("appointments@muxaris.com");
      expect(env.POST_CALL_MODEL_ID).toBeUndefined();
    }
  });

  it("no SecretString in the template", () => {
    expect(JSON.stringify(t.toJSON())).not.toContain('"SecretString"');
  });

  it("data stack retains the db secret and keeps 30 days of RDS logs", () => {
    const { tData } = build();
    tData.hasResource("AWS::SecretsManager::Secret", { DeletionPolicy: "Retain" });
    tData.hasResourceProperties("Custom::LogRetention", { RetentionInDays: 30 });
  });
});
