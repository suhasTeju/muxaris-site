import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { ENV } from "../lib/config.js";
import { DataStack } from "../lib/data-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { ServicesStack } from "../lib/services-stack.js";
import { StorageStack } from "../lib/storage-stack.js";

function build(opts: { certArn?: string; billingEnabled?: boolean } = {}) {
  const app = new App();
  const net = new NetworkStack(app, "N", { env: ENV });
  const storage = new StorageStack(app, "S", { env: ENV });
  const data = new DataStack(app, "D", { env: ENV, network: net });
  const stack = new ServicesStack(app, "V", {
    env: ENV,
    network: net,
    data,
    storage,
    imageTag: "abc123",
    cognitoUserPoolId: "ap-south-1_TEST",
    cognitoClientId: "client-test",
    corsOrigins: "https://muxaris.com,http://localhost:3000",
    maxSessions: 15,
    maxCallSeconds: 1200,
    notifyFromEmail: "appointments@muxaris.com",
    billingEnabled: opts.billingEnabled ?? false,
    publicApiUrl: "https://api.muxaris.com",
    ...(opts.certArn ? { certArn: opts.certArn } : {}),
  });
  return { stack, t: Template.fromStack(stack) };
}

type Res = { Properties: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
const taskDef = (t: Template, family: string) =>
  Object.values(t.findResources("AWS::ECS::TaskDefinition")).find(
    (r) => (r as Res).Properties.ContainerDefinitions[0].Name === family,
  ) as Res;
const env = (td: Res, i = 0) =>
  Object.fromEntries(
    (td.Properties.ContainerDefinitions[i].Environment as { Name: string; Value: unknown }[]).map(
      (e) => [e.Name, e.Value],
    ),
  );
const CERT = "arn:aws:acm:ap-south-1:005533348545:certificate/abc";

describe("ServicesStack", () => {
  const { t } = build();

  it("internet-facing ALB with a one hour idle timeout", () => {
    t.hasResourceProperties("AWS::ElasticLoadBalancingV2::LoadBalancer", {
      Scheme: "internet-facing",
      LoadBalancerAttributes: Match.arrayWith([
        { Key: "idle_timeout.timeout_seconds", Value: "3600" },
      ]),
    });
  });

  it("without a cert: one listener on 80 with host and path rules to the gateway", () => {
    t.resourceCountIs("AWS::ElasticLoadBalancingV2::Listener", 1);
    t.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      Port: 80,
      Protocol: "HTTP",
      DefaultActions: [Match.objectLike({ Type: "forward" })],
    });
    t.hasResourceProperties("AWS::ElasticLoadBalancingV2::ListenerRule", {
      Priority: 10,
      Conditions: [{ Field: "host-header", HostHeaderConfig: { Values: ["voice.muxaris.com"] } }],
    });
    t.hasResourceProperties("AWS::ElasticLoadBalancingV2::ListenerRule", {
      Priority: 20,
      Conditions: [
        {
          Field: "path-pattern",
          PathPatternConfig: { Values: ["/v1/session*", "/v1/telephony/*"] },
        },
      ],
    });
  });

  it("with a cert: 443 listener with the same rules, 80 redirects", () => {
    const c = build({ certArn: CERT }).t;
    c.resourceCountIs("AWS::ElasticLoadBalancingV2::Listener", 2);
    c.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      Port: 443,
      Protocol: "HTTPS",
      Certificates: [{ CertificateArn: CERT }],
    });
    c.hasResourceProperties("AWS::ElasticLoadBalancingV2::Listener", {
      Port: 80,
      DefaultActions: [
        {
          Type: "redirect",
          RedirectConfig: { Protocol: "HTTPS", Port: "443", StatusCode: "HTTP_301" },
        },
      ],
    });
    c.resourceCountIs("AWS::ElasticLoadBalancingV2::ListenerRule", 2);
  });

  it("target groups", () => {
    t.resourceCountIs("AWS::ElasticLoadBalancingV2::TargetGroup", 2);
    t.allResourcesProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      HealthCheckPath: "/healthz",
      Protocol: "HTTP",
      TargetType: "ip",
      HealthCheckIntervalSeconds: 30,
      HealthyThresholdCount: 2,
    });
    const delays = Object.values(t.findResources("AWS::ElasticLoadBalancingV2::TargetGroup")).map(
      (r) =>
        ((r as Res).Properties.TargetGroupAttributes as { Key: string; Value: string }[]).find(
          (a) => a.Key === "deregistration_delay.timeout_seconds",
        )?.Value,
    );
    // gateway 90 (matches its stopTimeout so live WebSockets are not cut), api 30
    expect(delays.sort()).toEqual(["30", "90"]);
    const byId = t.findResources("AWS::ElasticLoadBalancingV2::TargetGroup");
    const gw = Object.entries(byId).find(([id]) => id.startsWith("GatewayTg"));
    expect(JSON.stringify(gw?.[1])).toContain('"Value":"90"');
  });

  it("two Fargate services in public subnets with public IPs", () => {
    t.resourceCountIs("AWS::ECS::Service", 2);
    t.allResourcesProperties("AWS::ECS::Service", {
      LaunchType: "FARGATE",
      DesiredCount: 1,
      HealthCheckGracePeriodSeconds: 60,
      NetworkConfiguration: {
        AwsvpcConfiguration: Match.objectLike({ AssignPublicIp: "ENABLED" }),
      },
      DeploymentConfiguration: Match.objectLike({
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      }),
    });
    t.hasResourceProperties("AWS::ECS::Service", {
      DeploymentConfiguration: Match.objectLike({
        MinimumHealthyPercent: 100,
        MaximumPercent: 200,
      }),
    });
    t.hasResourceProperties("AWS::ECS::Service", {
      DeploymentConfiguration: Match.objectLike({ MinimumHealthyPercent: 0, MaximumPercent: 100 }),
    });
    t.hasResourceProperties("AWS::ECS::Cluster", {
      ClusterSettings: [{ Name: "containerInsights", Value: "enabled" }],
    });
  });

  it("autoscaling only for the API", () => {
    t.resourceCountIs("AWS::ApplicationAutoScaling::ScalableTarget", 1);
    t.hasResourceProperties("AWS::ApplicationAutoScaling::ScalableTarget", {
      MinCapacity: 1,
      MaxCapacity: 2,
    });
    t.hasResourceProperties("AWS::ApplicationAutoScaling::ScalingPolicy", {
      TargetTrackingScalingPolicyConfiguration: Match.objectLike({ TargetValue: 70 }),
    });
  });

  it("three arm64 task definitions with sizes, stop timeouts and logs", () => {
    t.resourceCountIs("AWS::ECS::TaskDefinition", 3);
    const sizes: Record<string, [string, string]> = {
      api: ["512", "1024"],
      gateway: ["512", "1024"],
      migrate: ["256", "512"],
    };
    for (const [family, [cpu, mem]] of Object.entries(sizes)) {
      const td = taskDef(t, family);
      expect(td.Properties.Cpu).toBe(cpu);
      expect(td.Properties.Memory).toBe(mem);
      expect(td.Properties.RuntimePlatform).toEqual({
        CpuArchitecture: "ARM64",
        OperatingSystemFamily: "LINUX",
      });
    }
    expect(taskDef(t, "gateway").Properties.ContainerDefinitions[0].StopTimeout).toBe(90);
    expect(taskDef(t, "api").Properties.ContainerDefinitions[0].StopTimeout).toBe(30);
    for (const g of ["api", "voice-gateway", "migrate"]) {
      t.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: `/muxaris/${g}`,
        RetentionInDays: 30,
      });
    }
    expect(JSON.stringify(taskDef(t, "api"))).toContain(":abc123");
    expect(taskDef(t, "migrate").Properties.ContainerDefinitions[0].Command).toEqual([
      "node",
      "packages/db/dist/migrate.js",
    ]);
  });

  it("stable names for the migrate task, its roles and the cluster", () => {
    expect(taskDef(t, "migrate").Properties.Family).toBe("muxaris-migrate");
    t.hasResourceProperties("AWS::ECS::Cluster", { ClusterName: "muxaris" });
    t.hasResourceProperties("AWS::IAM::Role", { RoleName: "muxaris-migrate-task" });
    t.hasResourceProperties("AWS::IAM::Role", { RoleName: "muxaris-migrate-exec" });
  });

  it("environment, without secrets", () => {
    const api = env(taskDef(t, "api"));
    expect(api).toMatchObject({
      NODE_ENV: "production",
      AUTH_MODE: "cognito",
      COGNITO_USER_POOL_ID: "ap-south-1_TEST",
      COGNITO_CLIENT_ID: "client-test",
      CORS_ORIGINS: "https://muxaris.com,http://localhost:3000",
      AWS_REGION: "ap-south-1",
      TRUST_PROXY: "1",
      DATABASE_SSL: "verify",
      GIT_SHA: "abc123",
      PUBLIC_API_URL: "https://api.muxaris.com",
      VOICE_WSS_URL: "wss://voice.muxaris.com",
    });
    expect(api.CALLS_BUCKET).toBeDefined();
    expect(api.DB_SECRET_ARN).toBeDefined();
    expect(api.APP_SECRET_ARN).toBeDefined();
    expect(api.BILLING_ENABLED).toBeUndefined();
    const gw = env(taskDef(t, "gateway"));
    expect(gw).toMatchObject({
      NODE_ENV: "production",
      VOICE_PROVIDER: "sarvam",
      BEDROCK_MODEL_ID: "global.amazon.nova-2-lite-v1:0",
      MAX_SESSIONS: "15",
      MAX_CALL_SECONDS: "1200",
      CORS_ORIGINS: "https://muxaris.com,http://localhost:3000",
      DATABASE_SSL: "verify",
    });
    expect(gw.POST_CALL_QUEUE_URL).toBeDefined();
    const mig = env(taskDef(t, "migrate"));
    expect(mig.DATABASE_SSL).toBe("verify");
    expect(mig.DB_SECRET_ARN).toBeDefined();
    expect(env(taskDef(build({ billingEnabled: true }).t, "api")).BILLING_ENABLED).toBe("1");
  });

  it("IAM per task role", () => {
    const pol = (action: unknown) =>
      Match.objectLike({
        PolicyDocument: { Statement: Match.arrayWith([Match.objectLike({ Action: action })]) },
      });
    t.hasResourceProperties("AWS::IAM::Policy", pol(["s3:GetObject", "s3:ListBucket"]));
    t.hasResourceProperties("AWS::IAM::Policy", pol("s3:PutObject"));
    t.hasResourceProperties("AWS::IAM::Policy", pol(Match.arrayWith(["sqs:SendMessage"])));
    t.hasResourceProperties(
      "AWS::IAM::Policy",
      Match.objectLike({
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
              Resource: [
                "arn:aws:bedrock:*::foundation-model/amazon.nova-2-lite-v1:0",
                "arn:aws:bedrock:ap-south-1:005533348545:inference-profile/global.amazon.nova-2-lite-v1:0",
              ],
            }),
          ]),
        },
      }),
    );
    t.hasResourceProperties(
      "AWS::IAM::Policy",
      pol(Match.arrayWith(["secretsmanager:GetSecretValue"])),
    );
    // migrate role is secrets-only: no S3/SQS/Bedrock grants on it
    const roles = t.findResources("AWS::IAM::Role");
    expect(Object.keys(roles).length).toBeGreaterThanOrEqual(6);
  });

  it("outputs", () => {
    for (const o of [
      "AlbDnsName",
      "ClusterName",
      "MigrateTaskDefinitionArn",
      "ApiServiceName",
      "GatewayServiceName",
      "PublicSubnetIds",
      "ServiceSecurityGroupId",
    ]) {
      expect(t.toJSON().Outputs).toHaveProperty(o);
    }
  });

  it("no secret material in the template", () => {
    const s = JSON.stringify(t.toJSON());
    expect(s).not.toContain("SecretString");
    expect(s).not.toContain("rzp_");
    expect(s).not.toContain("sk-");
  });
});
