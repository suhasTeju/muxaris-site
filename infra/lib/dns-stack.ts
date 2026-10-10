import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import type { Construct } from "constructs";
import {
  API_HOST,
  DOMAIN,
  NETLIFY_APEX_IP,
  NETLIFY_SITE_HOST,
  VOICE_HOST,
  WEB_ORIGIN_HOST,
  WWW_HOST,
} from "./config.js";
import type { NotifyStack } from "./notify-stack.js";
import type { ServicesStack } from "./services-stack.js";

export interface DnsStackProps extends StackProps {
  services: ServicesStack;
  notify: NotifyStack;
  /** Where the apex and www records point: Netlify until the cutover, then the distribution. */
  webTarget: "netlify" | "cloudfront";
  /** The CloudFront distribution's domain name (`d….cloudfront.net`); required for "cloudfront". */
  cloudfrontDomain?: string | undefined;
  /**
   * The ACM validation CNAMEs of the ALB certificate (api + voice), copied from GoDaddy so renewal
   * keeps working after the zone moves. Each entry is `[name, value]`.
   */
  albCertValidation: ReadonlyArray<readonly [string, string]>;
}

/** GoDaddy's mail records for the domain's mailboxes, copied as published on 2026-10-10. */
const GODADDY_MX = [
  { priority: 0, host: "smtp.secureserver.net" },
  { priority: 10, host: "mailstore1.secureserver.net" },
];
const GODADDY_SPF = "v=spf1 include:secureserver.net -all";
const GODADDY_DMARC =
  "v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;";

/**
 * The muxaris.com hosted zone and every record in it. Route 53 holds the zone because the apex
 * must alias a CloudFront distribution, which GoDaddy's DNS cannot do. This stack is the single
 * owner of the records, so the Netlify→CloudFront cutover is an in-place update (no deletion gap).
 */
export class DnsStack extends Stack {
  readonly zone: route53.PublicHostedZone;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    // MuxarisEdgeCert (us-east-1) reads the zone id from here.
    super(scope, id, { ...props, crossRegionReferences: true });
    const { alb } = props.services;
    const ttl = Duration.minutes(5);
    const short = Duration.minutes(1);

    this.zone = new route53.PublicHostedZone(this, "Zone", {
      zoneName: DOMAIN,
      comment: "Muxaris: managed by CDK (MuxarisDns); the registrar stays GoDaddy",
    });
    const zone = this.zone;

    // ---- web app (apex + www)
    if (props.webTarget === "cloudfront") {
      if (!props.cloudfrontDomain) throw new Error("cloudfrontDomain is required for cloudfront");
      const dist = cloudfront.Distribution.fromDistributionAttributes(this, "Dist", {
        domainName: props.cloudfrontDomain,
        distributionId: "unused",
      });
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(dist));
      new route53.ARecord(this, "ApexA", { zone, target });
      new route53.AaaaRecord(this, "ApexAaaa", { zone, target });
      new route53.ARecord(this, "WwwA", { zone, recordName: WWW_HOST, target });
      new route53.AaaaRecord(this, "WwwAaaa", { zone, recordName: WWW_HOST, target });
    } else {
      new route53.ARecord(this, "ApexA", {
        zone,
        target: route53.RecordTarget.fromIpAddresses(NETLIFY_APEX_IP),
        ttl: short,
      });
      new route53.CnameRecord(this, "WwwCname", {
        zone,
        recordName: WWW_HOST,
        domainName: NETLIFY_SITE_HOST,
        ttl: short,
      });
    }

    // ---- API, voice gateway and the CloudFront origin: aliases to the ALB
    const albTarget = route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb));
    for (const [rid, host] of [
      ["Api", API_HOST],
      ["Voice", VOICE_HOST],
      ["WebOrigin", WEB_ORIGIN_HOST],
    ] as const) {
      new route53.ARecord(this, `${rid}A`, { zone, recordName: host, target: albTarget });
    }
    props.albCertValidation.forEach(([name, value], i) => {
      new route53.CnameRecord(this, `AlbCertValidation${i + 1}`, {
        zone,
        recordName: name,
        domainName: value,
        ttl,
      });
    });

    // ---- mail: GoDaddy mailboxes on the apex, SES on mail.muxaris.com
    new route53.MxRecord(this, "ApexMx", {
      zone,
      values: GODADDY_MX.map((m) => ({ priority: m.priority, hostName: m.host })),
      ttl,
    });
    new route53.TxtRecord(this, "ApexSpf", { zone, values: [GODADDY_SPF], ttl });
    new route53.TxtRecord(this, "Dmarc", {
      zone,
      recordName: `_dmarc.${DOMAIN}`,
      values: [GODADDY_DMARC],
      ttl,
    });
    new route53.CnameRecord(this, "EmailCname", {
      zone,
      recordName: `email.${DOMAIN}`,
      domainName: "email.secureserver.net",
      ttl,
    });
    new route53.SrvRecord(this, "Autodiscover", {
      zone,
      recordName: `_autodiscover._tcp.${DOMAIN}`,
      values: [{ priority: 0, weight: 0, port: 443, hostName: "autodiscover.secureserver.net" }],
      ttl,
    });
    props.notify.identity.dkimRecords.forEach((r, i) => {
      new route53.CnameRecord(this, `SesDkim${i + 1}`, {
        zone,
        recordName: r.name,
        domainName: r.value,
        ttl,
      });
    });
    new route53.MxRecord(this, "MailFromMx", {
      zone,
      recordName: `mail.${DOMAIN}`,
      values: [{ priority: 10, hostName: `feedback-smtp.${this.region}.amazonses.com` }],
      ttl,
    });
    new route53.TxtRecord(this, "MailFromSpf", {
      zone,
      recordName: `mail.${DOMAIN}`,
      values: ["v=spf1 include:amazonses.com ~all"],
      ttl,
    });

    new CfnOutput(this, "HostedZoneId", { value: zone.hostedZoneId });
    new CfnOutput(this, "NameServers", {
      value: zone.hostedZoneNameServers ? this.toJsonString(zone.hostedZoneNameServers) : "unknown",
    });
  }
}
