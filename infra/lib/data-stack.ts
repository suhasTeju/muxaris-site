import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import type { NetworkStack } from "./network-stack.js";

export interface DataStackProps extends StackProps {
  network: NetworkStack;
}

/** RDS Postgres 16, the two secrets processes read at start (R3), and the ECR repositories (R7). */
export class DataStack extends Stack {
  readonly db: rds.DatabaseInstance;
  readonly dbSecret: secretsmanager.ISecret;
  readonly appSecret: secretsmanager.ISecret;
  readonly apiRepo: ecr.Repository;
  readonly gatewayRepo: ecr.Repository;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { vpc, dbSg } = props.network;
    this.db = new rds.DatabaseInstance(this, "Postgres", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16_9 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials: rds.Credentials.fromGeneratedSecret("muxaris", { secretName: "muxaris/db" }),
      databaseName: "muxaris",
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      multiAz: false,
      publiclyAccessible: false,
      backupRetention: Duration.days(7),
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
      cloudwatchLogsExports: ["postgresql"],
      enablePerformanceInsights: false,
    });
    // fromGeneratedSecret always attaches a secret.
    this.dbSecret = this.db.secret as secretsmanager.ISecret;
    // Values are written by scripts/bootstrap-aws.sh --secrets, never by CDK.
    this.appSecret = new secretsmanager.Secret(this, "AppSecret", {
      secretName: "muxaris/app",
      description: "Muxaris app secrets as JSON key→value (Sarvam, Razorpay, WhatsApp)",
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const repo = (repoId: string, name: string) =>
      new ecr.Repository(this, repoId, {
        repositoryName: name,
        imageTagMutability: ecr.TagMutability.IMMUTABLE,
        imageScanOnPush: true,
        removalPolicy: RemovalPolicy.RETAIN,
        lifecycleRules: [{ description: "keep the last 10 images", maxImageCount: 10 }],
      });
    this.apiRepo = repo("ApiRepo", "muxaris-api");
    this.gatewayRepo = repo("GatewayRepo", "muxaris-voice-gateway");
    new CfnOutput(this, "DbEndpoint", { value: this.db.dbInstanceEndpointAddress });
    new CfnOutput(this, "DbSecretArn", { value: this.dbSecret.secretArn });
    new CfnOutput(this, "AppSecretArn", { value: this.appSecret.secretArn });
    new CfnOutput(this, "ApiRepoUri", { value: this.apiRepo.repositoryUri });
    new CfnOutput(this, "GatewayRepoUri", { value: this.gatewayRepo.repositoryUri });
  }
}
