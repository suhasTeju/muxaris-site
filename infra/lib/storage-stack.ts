import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sqs from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";
import { PROJECT, WEB_ORIGINS } from "./config.js";

export class StorageStack extends Stack {
  readonly callsBucket: s3.Bucket;
  readonly postCallQueue: sqs.Queue;
  readonly postCallDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.callsBucket = new s3.Bucket(this, "CallsBucket", {
      bucketName: `${PROJECT}-calls-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          prefix: "clinics/",
          expiration: Duration.days(90),
          abortIncompleteMultipartUploadAfter: Duration.days(2),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: [...WEB_ORIGINS],
          allowedHeaders: ["*"],
          maxAge: 3600,
        },
      ],
    });

    this.postCallDlq = new sqs.Queue(this, "PostCallDlq", {
      queueName: `${PROJECT}-post-call-dlq`,
      retentionPeriod: Duration.days(14),
    });
    this.postCallQueue = new sqs.Queue(this, "PostCallQueue", {
      queueName: `${PROJECT}-post-call`,
      visibilityTimeout: Duration.minutes(6),
      retentionPeriod: Duration.days(4),
      deadLetterQueue: { queue: this.postCallDlq, maxReceiveCount: 5 },
    });

    new CfnOutput(this, "CallsBucketName", { value: this.callsBucket.bucketName });
    new CfnOutput(this, "PostCallQueueUrl", { value: this.postCallQueue.queueUrl });
  }
}
