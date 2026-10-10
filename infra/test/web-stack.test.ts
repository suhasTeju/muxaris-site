import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { EDGE_ENV, ENV } from "../lib/config.js";
import { DataStack } from "../lib/data-stack.js";
import { DnsStack } from "../lib/dns-stack.js";
import { EdgeCertStack } from "../lib/edge-cert-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { NotifyStack } from "../lib/notify-stack.js";
import { ServicesStack } from "../lib/services-stack.js";
import { StorageStack } from "../lib/storage-stack.js";
import { WebStack } from "../lib/web-stack.js";

const CERT = "arn:aws:acm:ap-south-1:005533348545:certificate/abc";

function build(opts: { certArn?: string } = { certArn: CERT }) {
  const app = new App();
  const net = new NetworkStack(app, "N", { env: ENV });
  const storage = new StorageStack(app, "S", { env: ENV });
  const data = new DataStack(app, "D", { env: ENV, network: net });
  const notify = new NotifyStack(app, "M", { env: ENV });
  const services = new ServicesStack(app, "V", {
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
    ...(opts.certArn ? { certArn: opts.certArn } : {}),
  });
  const dns = new DnsStack(app, "Z", {
    env: ENV,
    services,
    notify,
    webTarget: "netlify",
    albCertValidation: [["_a.api.muxaris.com", "_a.acm-validations.aws"]],
  });
  const edgeCert = new EdgeCertStack(app, "E", {
    env: EDGE_ENV,
    hostedZoneId: dns.zone.hostedZoneId,
  });
  const stack = new WebStack(app, "W", {
    env: ENV,
    network: net,
    data,
    services,
    dns,
    edgeCert,
    imageTag: "abc123",
  });
  return { stack, t: Template.fromStack(stack), services: Template.fromStack(services) };
}

describe("WebStack", () => {
  const { t } = build();

  it("refuses an HTTP-only ALB", () => {
    expect(() => build({})).toThrow(/HTTPS listener/);
  });

  it("runs one ARM Fargate task on port 3000 with the image tag as GIT_SHA", () => {
    t.hasResourceProperties("AWS::ECS::TaskDefinition", {
      Cpu: "512",
      Memory: "1024",
      RuntimePlatform: Match.objectLike({ CpuArchitecture: "ARM64" }),
      ContainerDefinitions: [
        Match.objectLike({
          Name: "web",
          PortMappings: [Match.objectLike({ ContainerPort: 3000 })],
          Environment: Match.arrayWith([
            { Name: "HOSTNAME", Value: "0.0.0.0" },
            { Name: "GIT_SHA", Value: "abc123" },
          ]),
        }),
      ],
    });
    t.hasResourceProperties("AWS::ECS::Service", { DesiredCount: 1 });
    t.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      Port: 3000,
      HealthCheckPath: "/healthz",
    });
  });

  it("routes the three hosts to the web target group only with the CloudFront header", () => {
    t.hasResourceProperties("AWS::ElasticLoadBalancingV2::ListenerRule", {
      Priority: 5,
      Conditions: Match.arrayWith([
        {
          Field: "host-header",
          HostHeaderConfig: {
            Values: ["muxaris.com", "www.muxaris.com", "web-origin.muxaris.com"],
          },
        },
        Match.objectLike({
          Field: "http-header",
          HttpHeaderConfig: Match.objectLike({ HttpHeaderName: "x-origin-verify" }),
        }),
      ]),
    });
    t.hasResourceProperties("AWS::ElasticLoadBalancingV2::ListenerCertificate", {});
    t.hasResourceProperties("AWS::CertificateManager::Certificate", {
      DomainName: "web-origin.muxaris.com",
      ValidationMethod: "DNS",
    });
  });

  it("serves muxaris.com and www from CloudFront over TLS 1.2+ with India in the price class", () => {
    t.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Aliases: ["muxaris.com", "www.muxaris.com"],
        PriceClass: "PriceClass_200",
        HttpVersion: "http2and3",
        ViewerCertificate: Match.objectLike({ MinimumProtocolVersion: "TLSv1.2_2021" }),
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: "redirect-to-https",
          // CachingDisabled and AllViewer managed policies
          CachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
          OriginRequestPolicyId: "216adef6-5c7f-47e4-b989-5492eafa07d3",
          FunctionAssociations: [Match.objectLike({ EventType: "viewer-request" })],
        }),
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: "/_next/static/*",
            CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
          }),
        ]),
        Origins: [
          Match.objectLike({
            DomainName: "web-origin.muxaris.com",
            CustomOriginConfig: Match.objectLike({ OriginProtocolPolicy: "https-only" }),
            OriginCustomHeaders: [Match.objectLike({ HeaderName: "x-origin-verify" })],
          }),
        ],
      }),
    });
  });

  it("sets the security headers Netlify used to add", () => {
    t.hasResourceProperties("AWS::CloudFront::ResponseHeadersPolicy", {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({
          FrameOptions: { FrameOption: "DENY", Override: true },
          ContentTypeOptions: { Override: true },
        }),
        CustomHeadersConfig: {
          Items: [
            Match.objectLike({
              Header: "Permissions-Policy",
              Value: "microphone=(self), camera=(), geolocation=()",
            }),
          ],
        },
      }),
    });
  });

  it("redirects www to the apex at the edge", () => {
    const fn = Object.values(t.findResources("AWS::CloudFront::Function"))[0] as {
      Properties: { FunctionCode: string };
    };
    expect(fn.Properties.FunctionCode).toContain('"www.muxaris.com"');
    expect(fn.Properties.FunctionCode).toContain("https://muxaris.com");
  });
});
