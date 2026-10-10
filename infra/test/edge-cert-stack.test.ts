import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { EDGE_ENV } from "../lib/config.js";
import { EdgeCertStack } from "../lib/edge-cert-stack.js";

describe("EdgeCertStack", () => {
  it("requests a DNS-validated certificate for the apex and www in us-east-1", () => {
    const app = new App();
    const stack = new EdgeCertStack(app, "E", { env: EDGE_ENV, hostedZoneId: "Z123" });
    const t = Template.fromStack(stack);
    t.hasResourceProperties("AWS::CertificateManager::Certificate", {
      DomainName: "muxaris.com",
      SubjectAlternativeNames: ["www.muxaris.com"],
      ValidationMethod: "DNS",
      DomainValidationOptions: [
        { DomainName: "muxaris.com", HostedZoneId: "Z123" },
        { DomainName: "www.muxaris.com", HostedZoneId: "Z123" },
      ],
    });
  });
});
