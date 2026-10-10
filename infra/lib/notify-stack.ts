import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as ses from "aws-cdk-lib/aws-ses";
import type { Construct } from "constructs";
import { DOMAIN } from "./config.js";

/**
 * SES domain identity for appointment email. MuxarisDns writes the DKIM and MAIL FROM records into
 * the hosted zone; the outputs remain for a registrar-hosted zone.
 */
export class NotifyStack extends Stack {
  readonly identity: ses.EmailIdentity;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const identity = new ses.EmailIdentity(this, "Domain", {
      identity: ses.Identity.domain(DOMAIN),
      dkimSigning: true,
      mailFromDomain: `mail.${DOMAIN}`,
    });
    this.identity = identity;
    identity.dkimRecords.forEach((r, i) => {
      new CfnOutput(this, `DkimName${i + 1}`, { value: r.name });
      new CfnOutput(this, `DkimValue${i + 1}`, { value: r.value });
    });
    new CfnOutput(this, "MailFromMx", { value: `10 feedback-smtp.${this.region}.amazonses.com` });
    new CfnOutput(this, "MailFromTxt", { value: "v=spf1 include:amazonses.com ~all" });
  }
}
