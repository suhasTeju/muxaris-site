import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { CicdStack } from "../lib/cicd-stack.js";
import { ENV } from "../lib/config.js";
import { DataStack } from "../lib/data-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { ServicesStack } from "../lib/services-stack.js";
import { StorageStack } from "../lib/storage-stack.js";

function build() {
  const app = new App();
  const net = new NetworkStack(app, "N", { env: ENV });
  const storage = new StorageStack(app, "S", { env: ENV });
  const data = new DataStack(app, "D", { env: ENV, network: net });
  new ServicesStack(app, "V", {
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
  const stack = new CicdStack(app, "C", {
    env: ENV,
    data,
    githubRepo: "suhasTeju@60204441/muxaris-site@1336095316",
  });
  return Template.fromStack(stack);
}

const statements = (t: Template): Record<string, unknown>[] =>
  Object.values(t.findResources("AWS::IAM::Policy")).flatMap(
    (p) =>
      (p as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }).Properties
        .PolicyDocument.Statement,
  );
const withAction = (t: Template, a: string) =>
  statements(t).filter((s) => [s.Action].flat().includes(a));

describe("CicdStack", () => {
  const t = build();

  it("GitHub OIDC provider", () => {
    t.hasResourceProperties("Custom::AWSCDKOpenIdConnectProvider", {
      Url: "https://token.actions.githubusercontent.com",
      ClientIDList: ["sts.amazonaws.com"],
    });
  });

  it("role trusted only from main of the repo", () => {
    t.hasResourceProperties("AWS::IAM::Role", {
      RoleName: "MuxarisGithubDeploy",
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
              StringLike: {
                "token.actions.githubusercontent.com:sub":
                  "repo:suhasTeju@60204441/muxaris-site@1336095316:ref:refs/heads/main",
              },
            },
          }),
        ],
      },
    });
  });

  it("permissions", () => {
    expect(withAction(t, "ecr:GetAuthorizationToken")[0]?.Resource).toBe("*");
    expect(
      JSON.stringify(statements(t).filter((s) => [s.Action].flat().includes("ecr:PutImage"))),
    ).toContain("Repo");
    expect(withAction(t, "sts:AssumeRole")[0]?.Resource).toEqual([
      "arn:aws:iam::005533348545:role/cdk-hnb659fds-*-005533348545-ap-south-1",
      "arn:aws:iam::005533348545:role/cdk-hnb659fds-*-005533348545-us-east-1",
    ]);
    const run = withAction(t, "ecs:RunTask")[0];
    expect(run?.Resource).toBe(
      "arn:aws:ecs:ap-south-1:005533348545:task-definition/muxaris-migrate:*",
    );
    expect(run?.Condition).toEqual({
      ArnEquals: { "ecs:cluster": "arn:aws:ecs:ap-south-1:005533348545:cluster/muxaris" },
    });
    expect(withAction(t, "ecs:DescribeServices")[0]?.Resource).toEqual([
      "arn:aws:ecs:ap-south-1:005533348545:cluster/muxaris",
      "arn:aws:ecs:ap-south-1:005533348545:service/muxaris/*",
    ]);
    expect(withAction(t, "ecs:DescribeTaskDefinition")[0]?.Resource).toBe("*");
    expect(withAction(t, "ecs:DescribeTasks")[0]?.Resource).toBe(
      "arn:aws:ecs:ap-south-1:005533348545:task/muxaris/*",
    );
    expect(withAction(t, "iam:PassRole")[0]?.Resource).toEqual([
      "arn:aws:iam::005533348545:role/muxaris-migrate-task",
      "arn:aws:iam::005533348545:role/muxaris-migrate-exec",
    ]);
    expect(
      JSON.stringify(statements(t).filter((s) => [s.Action].flat().includes("logs:GetLogEvents"))),
    ).toContain("log-group:/muxaris/migrate");
    expect(statements(t).some((s) => [s.Action].flat().includes("logs:GetLogEvents"))).toBe(true);
    expect(withAction(t, "cloudformation:DescribeStacks")[0]?.Resource).toBe("*");
  });

  it("imports nothing from the Services stack (no revision-specific task definition Ref)", () => {
    const json = JSON.stringify(t.toJSON());
    expect(json).not.toContain("MigrateTask");
    // The only cross-stack imports are the ECR repo ARNs from the Data stack ("D:" in this app).
    const imports = [...json.matchAll(/"Fn::ImportValue":"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((i) => i?.startsWith("D:"))).toBe(true);
  });

  it("output", () => {
    expect(t.toJSON().Outputs).toHaveProperty("DeployRoleArn");
  });
});
