import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { ENV } from "../lib/config.js";
import { NotifyStack } from "../lib/notify-stack.js";

describe("NotifyStack", () => {
  const t = Template.fromStack(new NotifyStack(new App(), "T", { env: ENV }));
  it("verifies muxaris.com with DKIM and a custom MAIL FROM", () => {
    t.hasResourceProperties("AWS::SES::EmailIdentity", {
      EmailIdentity: "muxaris.com",
      DkimAttributes: { SigningEnabled: true },
      MailFromAttributes: { MailFromDomain: "mail.muxaris.com" },
    });
  });
  it("outputs the three DKIM CNAMEs for GoDaddy", () => {
    const outputs = t.findOutputs("*");
    const names = Object.keys(outputs);
    for (const n of [
      "DkimName1",
      "DkimValue1",
      "DkimName2",
      "DkimValue2",
      "DkimName3",
      "DkimValue3",
    ])
      if (!names.includes(n)) throw new Error(`missing output ${n}`);
  });
});
