import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";
import { DOMAIN, WEB_HOST, WWW_HOST } from "./config.js";

export interface EdgeCertStackProps extends StackProps {
  /** The muxaris.com hosted zone id (from MuxarisDns, another region: crossRegionReferences). */
  hostedZoneId: string;
}

/**
 * The CloudFront certificate for muxaris.com and www. CloudFront accepts certificates from
 * us-east-1 only, so this is the one stack outside ap-south-1. DNS validation writes to the zone,
 * which must be authoritative (nameservers moved to Route 53) before this stack can finish.
 */
export class EdgeCertStack extends Stack {
  readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: EdgeCertStackProps) {
    super(scope, id, { ...props, crossRegionReferences: true });
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
      hostedZoneId: props.hostedZoneId,
      zoneName: DOMAIN,
    });
    this.certificate = new acm.Certificate(this, "Cert", {
      domainName: WEB_HOST,
      subjectAlternativeNames: [WWW_HOST],
      validation: acm.CertificateValidation.fromDns(zone),
    });
    new CfnOutput(this, "CertificateArn", { value: this.certificate.certificateArn });
  }
}
