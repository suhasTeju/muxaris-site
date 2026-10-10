import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { ENV } from "../lib/config.js";
import { DataStack } from "../lib/data-stack.js";
import { DnsStack, type DnsStackProps } from "../lib/dns-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { NotifyStack } from "../lib/notify-stack.js";
import { ServicesStack } from "../lib/services-stack.js";
import { StorageStack } from "../lib/storage-stack.js";

function build(opts: Partial<Pick<DnsStackProps, "webTarget" | "cloudfrontDomain">> = {}) {
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
    certArn: "arn:aws:acm:ap-south-1:005533348545:certificate/abc",
  });
  const stack = new DnsStack(app, "Z", {
    env: ENV,
    services,
    notify,
    webTarget: opts.webTarget ?? "netlify",
    cloudfrontDomain: opts.cloudfrontDomain,
    albCertValidation: [
      ["_a.api.muxaris.com", "_a.acm-validations.aws"],
      ["_b.voice.muxaris.com", "_b.acm-validations.aws"],
    ],
  });
  return { stack, t: Template.fromStack(stack) };
}

const record = (t: Template, name: string, type: string) =>
  Object.values(t.findResources("AWS::Route53::RecordSet")).find(
    (r) => r.Properties.Name === name && r.Properties.Type === type,
  )?.Properties as Record<string, unknown> | undefined;

describe("DnsStack", () => {
  it("creates the muxaris.com zone", () => {
    build().t.hasResourceProperties("AWS::Route53::HostedZone", { Name: "muxaris.com." });
  });

  it("before the cutover, the apex and www point at Netlify", () => {
    const { t } = build();
    expect(record(t, "muxaris.com.", "A")).toMatchObject({ ResourceRecords: ["75.2.60.5"] });
    expect(record(t, "www.muxaris.com.", "CNAME")).toMatchObject({
      ResourceRecords: ["luxury-sunflower-1cb07b.netlify.app"],
    });
  });

  it("after the cutover, the apex and www alias the distribution (A and AAAA)", () => {
    const { t } = build({ webTarget: "cloudfront", cloudfrontDomain: "d123.cloudfront.net" });
    for (const name of ["muxaris.com.", "www.muxaris.com."]) {
      for (const type of ["A", "AAAA"]) {
        const alias = record(t, name, type)?.AliasTarget as {
          DNSName: unknown;
          HostedZoneId: unknown;
        };
        expect(alias.DNSName).toBe("d123.cloudfront.net");
        // CloudFront's fixed hosted zone id, looked up per partition
        expect(JSON.stringify(alias.HostedZoneId)).toContain(
          "AWSCloudFrontPartitionHostedZoneIdMap",
        );
      }
    }
    expect(record(t, "www.muxaris.com.", "CNAME")).toBeUndefined();
  });

  it("refuses cloudfront without the distribution domain", () => {
    expect(() => build({ webTarget: "cloudfront" })).toThrow(/cloudfrontDomain/);
  });

  it("api, voice and the CloudFront origin host alias the ALB", () => {
    const { t } = build();
    for (const name of ["api.muxaris.com.", "voice.muxaris.com.", "web-origin.muxaris.com."]) {
      const alias = record(t, name, "A")?.AliasTarget as { DNSName: unknown } | undefined;
      expect(JSON.stringify(alias?.DNSName)).toContain("dualstack.");
    }
  });

  it("keeps the ALB certificate's validation CNAMEs", () => {
    const { t } = build();
    expect(record(t, "_a.api.muxaris.com.", "CNAME")).toMatchObject({
      ResourceRecords: ["_a.acm-validations.aws"],
    });
    expect(record(t, "_b.voice.muxaris.com.", "CNAME")).toBeDefined();
  });

  it("copies the GoDaddy mail records and adds the SES ones", () => {
    const { t } = build();
    expect(record(t, "muxaris.com.", "MX")).toMatchObject({
      ResourceRecords: ["0 smtp.secureserver.net", "10 mailstore1.secureserver.net"],
    });
    expect(record(t, "muxaris.com.", "TXT")).toMatchObject({
      ResourceRecords: ['"v=spf1 include:secureserver.net -all"'],
    });
    expect(record(t, "_dmarc.muxaris.com.", "TXT")).toBeDefined();
    expect(record(t, "email.muxaris.com.", "CNAME")).toMatchObject({
      ResourceRecords: ["email.secureserver.net"],
    });
    expect(record(t, "_autodiscover._tcp.muxaris.com.", "SRV")).toMatchObject({
      ResourceRecords: ["0 0 443 autodiscover.secureserver.net"],
    });
    expect(record(t, "mail.muxaris.com.", "MX")).toMatchObject({
      ResourceRecords: ["10 feedback-smtp.ap-south-1.amazonses.com"],
    });
    expect(record(t, "mail.muxaris.com.", "TXT")).toMatchObject({
      ResourceRecords: ['"v=spf1 include:amazonses.com ~all"'],
    });
    // The DKIM names and values are attributes of the SES identity (tokens, not strings).
    const dkim = Object.values(t.findResources("AWS::Route53::RecordSet")).filter(
      (r) => r.Properties.Type === "CNAME" && typeof r.Properties.Name !== "string",
    );
    expect(dkim).toHaveLength(3);
  });
});
