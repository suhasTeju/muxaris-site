import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import { WEB_HOST, WEB_ORIGIN_HOST, WWW_HOST } from "./config.js";
import type { DataStack } from "./data-stack.js";
import type { DnsStack } from "./dns-stack.js";
import type { EdgeCertStack } from "./edge-cert-stack.js";
import type { NetworkStack } from "./network-stack.js";
import type { ServicesStack } from "./services-stack.js";

export interface WebStackProps extends StackProps {
  network: NetworkStack;
  data: DataStack;
  services: ServicesStack;
  dns: DnsStack;
  edgeCert: EdgeCertStack;
  imageTag: string;
}

/** The header CloudFront adds so the ALB only serves the web app to CloudFront, never directly. */
export const ORIGIN_VERIFY_HEADER = "x-origin-verify";
/** Listener rule priority for the web hosts (the gateway rules are 10 and 20). */
const WEB_RULE_PRIORITY = 5;

/**
 * The Next.js web app: one ARM Fargate task behind the existing ALB (host rule for muxaris.com,
 * www and the CloudFront origin host), its own ALB certificate for the origin host, and the
 * CloudFront distribution in front. Separate from MuxarisServices so a web-only deploy never
 * restarts the voice gateway.
 */
export class WebStack extends Stack {
  readonly service: ecs.FargateService;
  readonly targetGroup: elbv2.ApplicationTargetGroup;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, { ...props, crossRegionReferences: true });
    const { vpc, serviceSg } = props.network;
    const { webRepo } = props.data;
    const { cluster, webListener, https } = props.services;
    if (!https) {
      throw new Error(
        "MuxarisWeb needs the ALB HTTPS listener (CERT_ARN): CloudFront connects to the origin over TLS.",
      );
    }

    // ---- Fargate service
    const logGroup = new logs.LogGroup(this, "Logs", {
      logGroupName: "/muxaris/web",
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const taskDef = new ecs.FargateTaskDefinition(this, "WebTask", {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    taskDef.addContainer("web", {
      image: ecs.ContainerImage.fromEcrRepository(webRepo, props.imageTag),
      stopTimeout: Duration.seconds(30),
      portMappings: [{ containerPort: 3000 }],
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: "web" }),
      environment: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0",
        GIT_SHA: props.imageTag,
      },
    });
    this.service = new ecs.FargateService(this, "WebService", {
      cluster,
      taskDefinition: taskDef,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [serviceSg],
      circuitBreaker: { rollback: true },
      enableExecuteCommand: false,
      healthCheckGracePeriod: Duration.seconds(60),
      desiredCount: 1,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });
    this.service
      .autoScaleTaskCount({ minCapacity: 1, maxCapacity: 3 })
      .scaleOnCpuUtilization("Cpu", { targetUtilizationPercent: 70 });

    this.targetGroup = new elbv2.ApplicationTargetGroup(this, "WebTg", {
      vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      targets: [this.service],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        path: "/healthz",
        interval: Duration.seconds(30),
        healthyThresholdCount: 2,
      },
    });

    // ---- ALB: origin certificate and the host rule, gated on the CloudFront header
    const originCert = new acm.Certificate(this, "OriginCert", {
      domainName: WEB_ORIGIN_HOST,
      validation: acm.CertificateValidation.fromDns(props.dns.zone),
    });
    // Built here, not through listener.addCertificates / addTargetGroups: those would place the
    // rule and certificate in MuxarisServices, which already depends on this stack (a cycle).
    new elbv2.ApplicationListenerCertificate(this, "WebOriginCert", {
      listener: webListener,
      certificates: [elbv2.ListenerCertificate.fromCertificateManager(originCert)],
    });
    const originSecret = new secretsmanager.Secret(this, "OriginSecret", {
      secretName: "muxaris/web-origin-verify",
      description: "Header value CloudFront sends to the ALB; the web listener rule requires it",
      generateSecretString: { excludePunctuation: true, passwordLength: 40 },
    });
    const originSecretValue = originSecret.secretValue.unsafeUnwrap();
    new elbv2.ApplicationListenerRule(this, "WebHosts", {
      listener: webListener,
      priority: WEB_RULE_PRIORITY,
      conditions: [
        elbv2.ListenerCondition.hostHeaders([WEB_HOST, WWW_HOST, WEB_ORIGIN_HOST]),
        elbv2.ListenerCondition.httpHeader(ORIGIN_VERIFY_HEADER, [originSecretValue]),
      ],
      targetGroups: [this.targetGroup],
    });

    // ---- CloudFront
    const origin = new origins.HttpOrigin(WEB_ORIGIN_HOST, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
      readTimeout: Duration.seconds(60),
      keepaliveTimeout: Duration.seconds(60),
      customHeaders: { [ORIGIN_VERIFY_HEADER]: originSecretValue },
    });
    // www → apex, as Netlify did; done at the edge so the app only ever sees one host.
    const wwwRedirect = new cloudfront.Function(this, "WwwRedirect", {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        `function handler(event) {
  var r = event.request;
  var host = r.headers.host && r.headers.host.value;
  if (host === "${WWW_HOST}") {
    var qs = Object.keys(r.querystring).length
      ? "?" + Object.keys(r.querystring).map(function (k) { return k + "=" + r.querystring[k].value; }).join("&")
      : "";
    return { statusCode: 301, statusDescription: "Moved Permanently",
      headers: { location: { value: "https://${WEB_HOST}" + r.uri + qs } } };
  }
  return r;
}`,
      ),
    });
    // The same headers netlify.toml set; Next sets them too, this keeps them on cached assets.
    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, "SecurityHeaders", {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: false,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: "Permissions-Policy",
            value: "microphone=(self), camera=(), geolocation=()",
            override: true,
          },
        ],
      },
    });
    // Dynamic pages: nothing cached, every header (Host included, so Next's redirects keep the
    // public hostname), cookie and query string reaches the origin.
    const dynamic: cloudfront.AddBehaviorOptions = {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      responseHeadersPolicy: securityHeaders,
      compress: true,
      functionAssociations: [
        { function: wwwRedirect, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
      ],
    };
    // Hashed build assets: immutable, cached at the edge.
    const immutable: cloudfront.AddBehaviorOptions = {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: securityHeaders,
      compress: true,
    };
    // Files under apps/web/public and the image optimizer: cached by full URL (query included).
    const assetsCache = new cloudfront.CachePolicy(this, "AssetsCache", {
      defaultTtl: Duration.hours(1),
      maxTtl: Duration.days(1),
      minTtl: Duration.seconds(0),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList("Accept"),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
    const assets: cloudfront.AddBehaviorOptions = { ...immutable, cachePolicy: assetsCache };

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "Muxaris web app",
      domainNames: [WEB_HOST, WWW_HOST],
      certificate: props.edgeCert.certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      // Includes the Indian edge locations (PRICE_CLASS_100 does not).
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      defaultBehavior: { origin, ...dynamic },
      additionalBehaviors: {
        "/_next/static/*": { origin, ...immutable },
        "/_next/image*": { origin, ...assets },
        "/audio/*": { origin, ...assets },
        "/brand/*": { origin, ...assets },
        "/img/*": { origin, ...assets },
        "/favicon.ico": { origin, ...assets },
      },
    });

    new CfnOutput(this, "DistributionDomainName", { value: this.distribution.domainName });
    new CfnOutput(this, "DistributionId", { value: this.distribution.distributionId });
    new CfnOutput(this, "WebServiceName", { value: this.service.serviceName });
  }
}
