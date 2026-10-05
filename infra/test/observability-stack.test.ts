import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { ENV } from "../lib/config.js";
import { DataStack } from "../lib/data-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { ObservabilityStack } from "../lib/observability-stack.js";
import { ServicesStack } from "../lib/services-stack.js";
import { StorageStack } from "../lib/storage-stack.js";
import { WorkersStack } from "../lib/workers-stack.js";

function build(alarmEmail?: string) {
  const app = new App();
  const net = new NetworkStack(app, "N", { env: ENV });
  const storage = new StorageStack(app, "S", { env: ENV });
  const data = new DataStack(app, "D", { env: ENV, network: net });
  const workers = new WorkersStack(app, "W", {
    env: ENV,
    network: net,
    storage,
    data,
    smsEnabled: false,
  });
  const services = new ServicesStack(app, "V", {
    env: ENV,
    network: net,
    data,
    storage,
    imageTag: "abc123",
    cognitoUserPoolId: "ap-south-1_TEST",
    cognitoClientId: "client-test",
    corsOrigins: "https://muxaris.com",
    maxSessions: 15,
    maxCallSeconds: 1200,
    notifyFromEmail: "appointments@muxaris.com",
    billingEnabled: false,
  });
  const stack = new ObservabilityStack(app, "O", {
    env: ENV,
    data,
    workers,
    services,
    ...(alarmEmail ? { alarmEmail } : {}),
  });
  return { t: Template.fromStack(stack), workers: Template.fromStack(workers) };
}

describe("ObservabilityStack", () => {
  const { t, workers } = build("ops@example.com");

  it("SNS topic, email subscription only when configured", () => {
    t.hasResourceProperties("AWS::SNS::Topic", { TopicName: "muxaris-alarms" });
    t.resourceCountIs("AWS::SNS::Subscription", 1);
    t.hasResourceProperties("AWS::SNS::Subscription", {
      Protocol: "email",
      Endpoint: "ops@example.com",
    });
    build().t.resourceCountIs("AWS::SNS::Subscription", 0);
  });

  it("metric filters on the gateway log group", () => {
    const f = (pattern: string, name: string, value: string) =>
      t.hasResourceProperties("AWS::Logs::MetricFilter", {
        FilterPattern: pattern,
        MetricTransformations: [
          Match.objectLike({ MetricNamespace: "Muxaris", MetricName: name, MetricValue: value }),
        ],
      });
    f('{ $.msg = "turn" }', "SttMs", "$.sttMs");
    f('{ $.msg = "turn" }', "LlmFirstTokenMs", "$.llmFirstTokenMs");
    f('{ $.msg = "turn" }', "TtsFirstAudioMs", "$.ttsFirstAudioMs");
    f('{ $.msg = "session accepted" }', "CallsStarted", "1");
    f('{ $.msg = "call settled" }', "CallsSettled", "1");
    f('{ $.msg = "quota exhausted" }', "QuotaRejected", "1");
    f('{ $.msg = "busy" }', "BusyRejected", "1");
    t.hasResourceProperties("AWS::Logs::MetricFilter", {
      FilterPattern: '{ ($.msg = "provider error") || ($.msg = "llm error") }',
    });
  });

  it("alarms, each with the SNS action", () => {
    const alarm = (props: Record<string, unknown>) =>
      t.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmActions: [{ Ref: Match.stringLikeRegexp("Alarms") }],
        ...props,
      });
    alarm({ MetricName: "HTTPCode_Target_5XX_Count", Threshold: 5, Period: 300 });
    alarm({
      MetricName: "HTTPCode_ELB_5XX_Count",
      Namespace: "AWS/ApplicationELB",
      Statistic: "Sum",
      Threshold: 5,
      Period: 300,
      ComparisonOperator: "GreaterThanOrEqualToThreshold",
    });
    const unhealthy = Object.values(t.findResources("AWS::CloudWatch::Alarm")).filter(
      (a) =>
        (a as { Properties: { MetricName?: string } }).Properties.MetricName ===
        "UnHealthyHostCount",
    );
    expect(unhealthy).toHaveLength(2);
    for (const a of unhealthy) {
      const props = (a as { Properties: Record<string, unknown> }).Properties;
      expect(props).toMatchObject({
        Threshold: 1,
        EvaluationPeriods: 2,
        ComparisonOperator: "GreaterThanOrEqualToThreshold",
      });
      expect(JSON.stringify(props.AlarmActions)).toContain("Alarms");
    }
    alarm({
      MetricName: "CPUUtilization",
      Namespace: "AWS/ECS",
      Threshold: 85,
      EvaluationPeriods: 2,
    });
    alarm({ MetricName: "CPUUtilization", Namespace: "AWS/RDS", Threshold: 80 });
    alarm({ MetricName: "ApproximateNumberOfMessagesVisible", Threshold: 1 });
    alarm({
      MetricName: "FreeStorageSpace",
      Threshold: 2_000_000_000,
      ComparisonOperator: "LessThanThreshold",
    });
    const errs = Object.values(t.findResources("AWS::CloudWatch::Alarm")).filter(
      (a) => (a as { Properties: { MetricName?: string } }).Properties.MetricName === "Errors",
    );
    expect(errs).toHaveLength(4);
    for (const a of errs) {
      expect((a as { Properties: { Threshold: number } }).Properties.Threshold).toBe(1);
    }
  });

  it("the Workers DLQ alarm is wired to the topic from this stack", () => {
    // the action lives in the Observability stack's view of the alarm: Workers template stays clean
    const w = Object.values(workers.findResources("AWS::CloudWatch::Alarm"));
    expect(JSON.stringify(w)).not.toContain("AlarmActions");
  });

  it("dashboard mentions the key metrics", () => {
    const d = Object.values(t.findResources("AWS::CloudWatch::Dashboard"));
    expect(d).toHaveLength(1);
    const body = JSON.stringify(d[0]);
    for (const m of [
      "CallsStarted",
      "SttMs",
      "HTTPCode_Target_5XX_Count",
      "HTTPCode_ELB_5XX_Count",
      "UnHealthyHostCount",
      "p95",
    ]) {
      expect(body).toContain(m);
    }
    t.hasResourceProperties("AWS::CloudWatch::Dashboard", { DashboardName: "muxaris" });
  });

  it("outputs", () => {
    expect(t.toJSON().Outputs).toHaveProperty("AlarmTopicArn");
    expect(t.toJSON().Outputs).toHaveProperty("DashboardUrl");
  });
});
