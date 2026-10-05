import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import { REGION } from "./config.js";
import type { DataStack } from "./data-stack.js";
import type { NetworkStack } from "./network-stack.js";

export interface MigrateStackProps extends StackProps {
  network: NetworkStack;
  data: DataStack;
  imageTag: string;
}

/**
 * The one-off migrate task (run with `scripts/migrate.sh`, never a service). It has its own
 * stack so it deploys with the new image tag BEFORE MuxarisServices: migrations run first, then
 * the new API and gateway start against the migrated schema.
 */
export class MigrateStack extends Stack {
  readonly taskDef: ecs.FargateTaskDefinition;
  readonly logGroup: logs.ILogGroup;

  constructor(scope: Construct, id: string, props: MigrateStackProps) {
    super(scope, id, props);
    const { vpc, serviceSg } = props.network;
    const { dbSecret, appSecret, apiRepo } = props.data;

    this.logGroup = new logs.LogGroup(this, "Logs-migrate", {
      logGroupName: "/muxaris/migrate",
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Fixed names: the deploy role (CicdStack) is scoped to them, so no task-definition revision
    // or role ARN has to cross stacks.
    const ecsTasks = new iam.ServicePrincipal("ecs-tasks.amazonaws.com");
    this.taskDef = new ecs.FargateTaskDefinition(this, "MigrateTask", {
      family: "muxaris-migrate",
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskRole: new iam.Role(this, "MigrateTaskRole", {
        roleName: "muxaris-migrate-task",
        assumedBy: ecsTasks,
      }),
      executionRole: new iam.Role(this, "MigrateExecRole", {
        roleName: "muxaris-migrate-exec",
        assumedBy: ecsTasks,
      }),
    });
    this.taskDef.addContainer("migrate", {
      image: ecs.ContainerImage.fromEcrRepository(apiRepo, props.imageTag),
      command: ["node", "packages/db/dist/migrate.js"],
      logging: ecs.LogDrivers.awsLogs({ logGroup: this.logGroup, streamPrefix: "migrate" }),
      environment: {
        NODE_ENV: "production",
        AWS_REGION: REGION,
        DATABASE_SSL: "verify",
        DB_SECRET_ARN: dbSecret.secretArn,
        APP_SECRET_ARN: appSecret.secretArn,
      },
    });
    dbSecret.grantRead(this.taskDef.taskRole);
    appSecret.grantRead(this.taskDef.taskRole);

    // Read by scripts/migrate.sh.
    new CfnOutput(this, "PublicSubnetIds", {
      value: vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }).subnetIds.join(","),
    });
    new CfnOutput(this, "ServiceSecurityGroupId", { value: serviceSg.securityGroupId });
  }
}
