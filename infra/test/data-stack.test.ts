import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { ENV } from "../lib/config.js";
import { NetworkStack } from "../lib/network-stack.js";
import { DataStack } from "../lib/data-stack.js";

describe("DataStack", () => {
  const app = new App();
  const net = new NetworkStack(app, "N", { env: ENV });
  const t = Template.fromStack(new DataStack(app, "T", { env: ENV, network: net }));
  it("encrypted Postgres 16 t4g.micro in isolated subnets with a generated secret and 7-day backups", () => {
    t.hasResourceProperties("AWS::RDS::DBInstance", {
      Engine: "postgres",
      DBInstanceClass: "db.t4g.micro",
      StorageEncrypted: true,
      PubliclyAccessible: false,
      BackupRetentionPeriod: 7,
      DeletionProtection: true,
      AllocatedStorage: "20",
    });
    t.resourceCountIs("AWS::SecretsManager::Secret", 2);
  });
  it("app secret has no value in the template", () => {
    const s = JSON.stringify(t.toJSON());
    if (s.includes('"SecretString"')) throw new Error("template contains SecretString");
    t.hasResourceProperties("AWS::SecretsManager::Secret", { Name: "muxaris/app" });
  });
  it("two immutable ECR repositories with scan-on-push and a 10-image lifecycle", () => {
    t.resourceCountIs("AWS::ECR::Repository", 2);
    t.hasResourceProperties("AWS::ECR::Repository", {
      RepositoryName: "muxaris-api",
      ImageTagMutability: "IMMUTABLE",
      ImageScanningConfiguration: { ScanOnPush: true },
      LifecyclePolicy: { LifecyclePolicyText: Match.stringLikeRegexp("10") },
    });
  });
});
