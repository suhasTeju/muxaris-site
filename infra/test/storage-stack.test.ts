import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { ENV } from "../lib/config.js";
import { StorageStack } from "../lib/storage-stack.js";

describe("StorageStack", () => {
  const t = Template.fromStack(new StorageStack(new App(), "T", { env: ENV }));

  it("private, encrypted, versioned-off bucket with 90-day expiry on clinics/", () => {
    t.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
        ],
      },
      LifecycleConfiguration: {
        Rules: [
          {
            Prefix: "clinics/",
            ExpirationInDays: 90,
            Status: "Enabled",
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 2 },
          },
        ],
      },
    });
  });
  it("post-call queue with a DLQ after 5 receives and 6-minute visibility", () => {
    t.resourceCountIs("AWS::SQS::Queue", 2);
    t.hasResourceProperties("AWS::SQS::Queue", {
      VisibilityTimeout: 360,
      RedrivePolicy: { maxReceiveCount: 5 },
    });
  });
  it("exports bucket name and queue url", () => {
    t.hasOutput("CallsBucketName", {});
    t.hasOutput("PostCallQueueUrl", {});
  });
});
