import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { ENV } from "../lib/config.js";
import { DataStack } from "../lib/data-stack.js";
import { MigrateStack } from "../lib/migrate-stack.js";
import { NetworkStack } from "../lib/network-stack.js";

function build() {
  const app = new App();
  const net = new NetworkStack(app, "N", { env: ENV });
  const data = new DataStack(app, "D", { env: ENV, network: net });
  const stack = new MigrateStack(app, "M", { env: ENV, network: net, data, imageTag: "abc123" });
  return Template.fromStack(stack);
}

type Res = { Properties: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("MigrateStack", () => {
  const t = build();
  const td = Object.values(t.findResources("AWS::ECS::TaskDefinition"))[0] as Res;

  it("one arm64 Fargate task definition with the stable family and the migrate command", () => {
    t.resourceCountIs("AWS::ECS::TaskDefinition", 1);
    expect(td.Properties.Family).toBe("muxaris-migrate");
    expect(td.Properties.Cpu).toBe("256");
    expect(td.Properties.Memory).toBe("512");
    expect(td.Properties.RuntimePlatform).toEqual({
      CpuArchitecture: "ARM64",
      OperatingSystemFamily: "LINUX",
    });
    expect(td.Properties.ContainerDefinitions[0].Command).toEqual([
      "node",
      "packages/db/dist/migrate.js",
    ]);
    expect(JSON.stringify(td)).toContain(":abc123");
  });

  it("stable role names and log group", () => {
    t.hasResourceProperties("AWS::IAM::Role", { RoleName: "muxaris-migrate-task" });
    t.hasResourceProperties("AWS::IAM::Role", { RoleName: "muxaris-migrate-exec" });
    t.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: "/muxaris/migrate",
      RetentionInDays: 30,
    });
  });

  it("environment without secrets", () => {
    const env = Object.fromEntries(
      (td.Properties.ContainerDefinitions[0].Environment as { Name: string; Value: unknown }[]).map(
        (e) => [e.Name, e.Value],
      ),
    );
    expect(env).toMatchObject({ NODE_ENV: "production", DATABASE_SSL: "verify" });
    expect(env.DB_SECRET_ARN).toBeDefined();
  });

  it("the roles can only read secrets and pull/log (no S3, SQS or Bedrock)", () => {
    const policies = Object.values(t.findResources("AWS::IAM::Policy")) as Res[];
    const actions = policies.flatMap((p) =>
      (p.Properties.PolicyDocument.Statement as { Action: string | string[] }[]).flatMap((s) =>
        Array.isArray(s.Action) ? s.Action : [s.Action],
      ),
    );
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(a).toMatch(/^(secretsmanager:|kms:|ecr:|logs:)/);
    }
  });

  it("outputs read by scripts/migrate.sh, no service, no secret material", () => {
    expect(t.toJSON().Outputs).toHaveProperty("PublicSubnetIds");
    expect(t.toJSON().Outputs).toHaveProperty("ServiceSecurityGroupId");
    t.resourceCountIs("AWS::ECS::Service", 0);
    expect(JSON.stringify(t.toJSON())).not.toContain("SecretString");
  });
});
