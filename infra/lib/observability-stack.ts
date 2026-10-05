import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";
import { REGION } from "./config.js";
import type { DataStack } from "./data-stack.js";
import type { ServicesStack } from "./services-stack.js";
import type { WorkersStack } from "./workers-stack.js";

export interface ObservabilityStackProps extends StackProps {
  data: DataStack;
  workers: WorkersStack;
  services: ServicesStack;
  /** Email that receives alarm notifications; no subscription is created when unset. */
  alarmEmail?: string | undefined;
}

const NS = "Muxaris";

/** Gateway log metric filters, alarms (all to one SNS topic) and the `muxaris` dashboard. */
export class ObservabilityStack extends Stack {
  readonly topic: sns.Topic;
  readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);
    const { data, workers, services } = props;

    this.topic = new sns.Topic(this, "Alarms", { topicName: "muxaris-alarms" });
    if (props.alarmEmail) {
      this.topic.addSubscription(new subs.EmailSubscription(props.alarmEmail));
    }
    const action = new cwActions.SnsAction(this.topic);

    // ---- gateway log metric filters (JSON lines with a `msg` field)
    const lg = services.gatewayLogGroup;
    const msg = (m: string) => logs.FilterPattern.stringValue("$.msg", "=", m);
    const latency = (fid: string, name: string, field: string) =>
      new logs.MetricFilter(this, fid, {
        logGroup: lg,
        metricNamespace: NS,
        metricName: name,
        filterPattern: msg("turn"),
        metricValue: `$.${field}`,
      });
    latency("SttMsFilter", "SttMs", "sttMs");
    latency("LlmFirstTokenMsFilter", "LlmFirstTokenMs", "llmFirstTokenMs");
    latency("TtsFirstAudioMsFilter", "TtsFirstAudioMs", "ttsFirstAudioMs");
    const count = (fid: string, name: string, pattern: logs.IFilterPattern) =>
      new logs.MetricFilter(this, fid, {
        logGroup: lg,
        metricNamespace: NS,
        metricName: name,
        filterPattern: pattern,
        metricValue: "1",
        defaultValue: 0,
      });
    count("CallsStartedFilter", "CallsStarted", msg("session accepted"));
    count("CallsSettledFilter", "CallsSettled", msg("call settled"));
    count("QuotaRejectedFilter", "QuotaRejected", msg("quota exhausted"));
    count("BusyRejectedFilter", "BusyRejected", msg("busy"));
    count(
      "ProviderErrorsFilter",
      "ProviderErrors",
      logs.FilterPattern.any(msg("provider error"), msg("llm error")),
    );

    // ---- alarms
    const alarm = (
      aid: string,
      metric: cloudwatch.IMetric,
      opts: {
        threshold: number;
        evaluationPeriods?: number;
        op?: cloudwatch.ComparisonOperator;
        description: string;
      },
    ) => {
      const a = new cloudwatch.Alarm(this, aid, {
        metric,
        threshold: opts.threshold,
        evaluationPeriods: opts.evaluationPeriods ?? 1,
        comparisonOperator:
          opts.op ?? cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: opts.description,
      });
      a.addAlarmAction(action);
      return a;
    };
    const five = Duration.minutes(5);
    const alb5xx = services.alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
      period: five,
      statistic: "Sum",
    });
    alarm("Alb5xxAlarm", alb5xx, { threshold: 5, description: "ALB targets returning 5xx" });
    alarm("GatewayCpuAlarm", services.gatewayService.metricCpuUtilization({ period: five }), {
      threshold: 85,
      evaluationPeriods: 2,
      description: "Voice gateway CPU is high",
    });
    const fns = {
      PostCall: workers.postCallFn,
      Sweep: workers.sweepFn,
      Deliver: workers.deliverFn,
      Reminders: workers.remindersFn,
    };
    for (const [name, fn] of Object.entries(fns)) {
      alarm(`${name}ErrorsAlarm`, fn.metricErrors({ period: five }), {
        threshold: 1,
        description: `${name} Lambda errored`,
      });
    }
    alarm("RdsCpuAlarm", data.db.metricCPUUtilization({ period: five }), {
      threshold: 80,
      description: "RDS CPU is high",
    });
    alarm("RdsFreeStorageAlarm", data.db.metricFreeStorageSpace({ period: five }), {
      threshold: 2_000_000_000,
      op: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      description: "RDS free storage below 2 GB",
    });
    // The Workers stack owns the DLQ alarm; adding its action there would make the two stacks
    // depend on each other (this stack already reads the Lambdas), so the same metric is alarmed here.
    alarm("PostCallDlqDepthAlarm", workers.dlqAlarm.metric, {
      threshold: 1,
      description: "Post-call jobs are landing in the dead-letter queue",
    });

    // ---- dashboard
    const m = (name: string, statistic: string) =>
      new cloudwatch.Metric({
        namespace: NS,
        metricName: name,
        statistic,
        period: Duration.minutes(1),
      });
    const lat = (title: string, name: string) =>
      new cloudwatch.GraphWidget({
        title,
        width: 8,
        left: [m(name, "p50"), m(name, "p95")],
      });
    const svcMem = (svc: ServicesStack["apiService"]) => svc.metricMemoryUtilization();
    this.dashboard = new cloudwatch.Dashboard(this, "Dashboard", { dashboardName: "muxaris" });
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Calls per minute",
        width: 12,
        left: [m("CallsStarted", "Sum"), m("CallsSettled", "Sum")],
        right: [m("QuotaRejected", "Sum"), m("BusyRejected", "Sum"), m("ProviderErrors", "Sum")],
      }),
      new cloudwatch.GraphWidget({
        title: "ALB 5xx and requests",
        width: 12,
        left: [alb5xx],
        right: [services.alb.metrics.requestCount({ period: five })],
      }),
    );
    this.dashboard.addWidgets(
      lat("STT latency (ms)", "SttMs"),
      lat("LLM first token (ms)", "LlmFirstTokenMs"),
      lat("TTS first audio (ms)", "TtsFirstAudioMs"),
    );
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Service CPU",
        width: 12,
        left: [
          services.apiService.metricCpuUtilization(),
          services.gatewayService.metricCpuUtilization(),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: "Service memory",
        width: 12,
        left: [svcMem(services.apiService), svcMem(services.gatewayService)],
      }),
    );
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Lambda errors",
        width: 12,
        left: Object.values(fns).map((f) => f.metricErrors()),
      }),
      new cloudwatch.GraphWidget({
        title: "Lambda duration",
        width: 12,
        left: Object.values(fns).map((f) => f.metricDuration()),
      }),
    );
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "RDS CPU",
        width: 8,
        left: [data.db.metricCPUUtilization()],
      }),
      new cloudwatch.GraphWidget({
        title: "RDS connections",
        width: 8,
        left: [data.db.metricDatabaseConnections()],
      }),
      new cloudwatch.GraphWidget({
        title: "RDS free storage",
        width: 8,
        left: [data.db.metricFreeStorageSpace()],
      }),
    );

    new CfnOutput(this, "AlarmTopicArn", { value: this.topic.topicArn });
    new CfnOutput(this, "DashboardUrl", {
      value: `https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#dashboards:name=muxaris`,
    });
  }
}
