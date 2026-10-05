import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";
import { ACCOUNT, PUBLIC_API_URL, REGION, VOICE_HOST } from "./config.js";
import type { DataStack } from "./data-stack.js";
import type { NetworkStack } from "./network-stack.js";
import type { StorageStack } from "./storage-stack.js";

export interface ServicesStackProps extends StackProps {
  network: NetworkStack;
  data: DataStack;
  storage: StorageStack;
  imageTag: string;
  certArn?: string | undefined;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  /** Comma-joined web origins: the API CORS list and the gateway WebSocket origin allow-list. */
  corsOrigins: string;
  maxSessions: number;
  maxCallSeconds: number;
  notifyFromEmail: string;
  billingEnabled: boolean;
  /** Public API URL, used later for Twilio signature verification. */
  publicApiUrl?: string;
  /** "twilio" or "exotel" turns phone calls on; empty omits TELEPHONY_PROVIDER (off). */
  telephonyProvider?: string;
}

const MODEL_ID = "global.amazon.nova-2-lite-v1:0";
const BEDROCK_ARNS = [
  "arn:aws:bedrock:*::foundation-model/amazon.nova-2-lite-v1:0",
  `arn:aws:bedrock:${REGION}:${ACCOUNT}:inference-profile/${MODEL_ID}`,
];

/** ALB with host and path routing, an ECS cluster, two ARM Fargate services. */
export class ServicesStack extends Stack {
  readonly alb: elbv2.ApplicationLoadBalancer;
  readonly cluster: ecs.Cluster;
  readonly apiService: ecs.FargateService;
  readonly gatewayService: ecs.FargateService;
  readonly gatewayLogGroup: logs.ILogGroup;
  readonly gatewayTargetGroup: elbv2.ApplicationTargetGroup;
  readonly apiTargetGroup: elbv2.ApplicationTargetGroup;

  constructor(scope: Construct, id: string, props: ServicesStackProps) {
    super(scope, id, props);
    const { vpc, albSg, serviceSg } = props.network;
    const { dbSecret, appSecret, apiRepo, gatewayRepo } = props.data;
    const { callsBucket, postCallQueue } = props.storage;
    const publicSubnets = { subnetType: ec2.SubnetType.PUBLIC };
    const publicApiUrl = props.publicApiUrl ?? PUBLIC_API_URL;
    // The secrets (TWILIO_AUTH_TOKEN, TELEPHONY_STREAM_SECRET) arrive via muxaris/app.
    const telephonyEnv: Record<string, string> = props.telephonyProvider
      ? { TELEPHONY_PROVIDER: props.telephonyProvider }
      : {};

    this.cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: "muxaris",
      containerInsights: true,
    });

    const logGroup = (name: string) =>
      new logs.LogGroup(this, `Logs-${name}`, {
        logGroupName: `/muxaris/${name}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });
    this.gatewayLogGroup = logGroup("voice-gateway");
    const taskDef = (tid: string, cpu: number, mem: number) =>
      new ecs.FargateTaskDefinition(this, tid, {
        cpu,
        memoryLimitMiB: mem,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
      });

    const dbEnv = {
      NODE_ENV: "production",
      AWS_REGION: REGION,
      DATABASE_SSL: "verify",
      DB_SECRET_ARN: dbSecret.secretArn,
      APP_SECRET_ARN: appSecret.secretArn,
    };

    // API
    const apiTd = taskDef("ApiTask", 512, 1024);
    apiTd.addContainer("api", {
      image: ecs.ContainerImage.fromEcrRepository(apiRepo, props.imageTag),
      stopTimeout: Duration.seconds(30),
      portMappings: [{ containerPort: 4000 }],
      logging: ecs.LogDrivers.awsLogs({ logGroup: logGroup("api"), streamPrefix: "api" }),
      environment: {
        ...dbEnv,
        AUTH_MODE: "cognito",
        COGNITO_USER_POOL_ID: props.cognitoUserPoolId,
        COGNITO_CLIENT_ID: props.cognitoClientId,
        CORS_ORIGINS: props.corsOrigins,
        CALLS_BUCKET: callsBucket.bucketName,
        TRUST_PROXY: "1",
        GIT_SHA: props.imageTag,
        PUBLIC_API_URL: publicApiUrl,
        VOICE_WSS_URL: `wss://${VOICE_HOST}`,
        ...(props.billingEnabled ? { BILLING_ENABLED: "1" } : {}),
        ...telephonyEnv,
      },
    });
    apiTd.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:ListBucket"],
        resources: [callsBucket.bucketArn, callsBucket.arnForObjects("*")],
      }),
    );
    dbSecret.grantRead(apiTd.taskRole);
    appSecret.grantRead(apiTd.taskRole);

    // Voice gateway
    const gwTd = taskDef("GatewayTask", 512, 1024);
    gwTd.addContainer("gateway", {
      image: ecs.ContainerImage.fromEcrRepository(gatewayRepo, props.imageTag),
      // SIGTERM ends live calls at once; this headroom lets their recording uploads finish. The
      // gateway's drain deadline (SHUTDOWN_GRACE_MS, 80 s) must stay under it.
      stopTimeout: Duration.seconds(90),
      portMappings: [{ containerPort: 4100 }],
      logging: ecs.LogDrivers.awsLogs({
        logGroup: this.gatewayLogGroup,
        streamPrefix: "gateway",
      }),
      environment: {
        ...dbEnv,
        AUTH_MODE: "cognito",
        COGNITO_USER_POOL_ID: props.cognitoUserPoolId,
        COGNITO_CLIENT_ID: props.cognitoClientId,
        VOICE_PROVIDER: "sarvam",
        BEDROCK_MODEL_ID: MODEL_ID,
        MAX_SESSIONS: String(props.maxSessions),
        MAX_CALL_SECONDS: String(props.maxCallSeconds),
        POST_CALL_QUEUE_URL: postCallQueue.queueUrl,
        CALLS_BUCKET: callsBucket.bucketName,
        CORS_ORIGINS: props.corsOrigins,
        TRUST_PROXY: "1",
        GIT_SHA: props.imageTag,
        ...telephonyEnv,
      },
    });
    gwTd.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObject"],
        resources: [callsBucket.arnForObjects("*")],
      }),
    );
    postCallQueue.grantSendMessages(gwTd.taskRole);
    gwTd.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: BEDROCK_ARNS,
      }),
    );
    dbSecret.grantRead(gwTd.taskRole);
    appSecret.grantRead(gwTd.taskRole);

    // Services
    const common = {
      cluster: this.cluster,
      assignPublicIp: true,
      vpcSubnets: publicSubnets,
      securityGroups: [serviceSg],
      circuitBreaker: { rollback: true },
      enableExecuteCommand: false,
      healthCheckGracePeriod: Duration.seconds(60),
      desiredCount: 1,
    };
    this.apiService = new ecs.FargateService(this, "ApiService", {
      ...common,
      taskDefinition: apiTd,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });
    // One gateway task: stop the old one before starting the new one (min 0 / max 100), so a
    // deploy never runs two. No autoscaling (ruling R4): scaling in would drop live calls.
    this.gatewayService = new ecs.FargateService(this, "GatewayService", {
      ...common,
      taskDefinition: gwTd,
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
    });
    this.apiService
      .autoScaleTaskCount({ minCapacity: 1, maxCapacity: 2 })
      .scaleOnCpuUtilization("Cpu", { targetUtilizationPercent: 70 });

    // Load balancer
    this.alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      vpcSubnets: publicSubnets,
      securityGroup: albSg,
      idleTimeout: Duration.seconds(3600),
    });
    const tg = (tid: string, svc: ecs.FargateService, deregistrationDelay: Duration) =>
      new elbv2.ApplicationTargetGroup(this, tid, {
        vpc,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        targets: [svc],
        deregistrationDelay,
        healthCheck: {
          path: "/healthz",
          interval: Duration.seconds(30),
          healthyThresholdCount: 2,
        },
      });
    // The gateway's delay matches its 90 s stopTimeout so the ALB does not close live
    // WebSockets before the container has finished its calls.
    const apiTg = tg("ApiTg", this.apiService, Duration.seconds(30));
    const gatewayTg = tg("GatewayTg", this.gatewayService, Duration.seconds(90));
    this.apiTargetGroup = apiTg;
    this.gatewayTargetGroup = gatewayTg;

    const routed = (l: elbv2.ApplicationListener) => {
      l.addTargetGroups("VoiceHost", {
        priority: 10,
        conditions: [elbv2.ListenerCondition.hostHeaders([VOICE_HOST])],
        targetGroups: [gatewayTg],
      });
      l.addTargetGroups("VoicePaths", {
        priority: 20,
        conditions: [elbv2.ListenerCondition.pathPatterns(["/v1/session*", "/v1/telephony/*"])],
        targetGroups: [gatewayTg],
      });
    };
    if (props.certArn) {
      const https = this.alb.addListener("Https", {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [elbv2.ListenerCertificate.fromArn(props.certArn)],
        open: false,
        defaultTargetGroups: [apiTg],
      });
      routed(https);
      this.alb.addListener("Http", {
        port: 80,
        open: false,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: "HTTPS",
          port: "443",
          permanent: true,
        }),
      });
    } else {
      const http = this.alb.addListener("Http", {
        port: 80,
        open: false,
        defaultTargetGroups: [apiTg],
      });
      routed(http);
    }

    new CfnOutput(this, "AlbDnsName", { value: this.alb.loadBalancerDnsName });
    new CfnOutput(this, "ClusterName", { value: this.cluster.clusterName });
    new CfnOutput(this, "ApiServiceName", { value: this.apiService.serviceName });
    new CfnOutput(this, "GatewayServiceName", { value: this.gatewayService.serviceName });
  }
}
