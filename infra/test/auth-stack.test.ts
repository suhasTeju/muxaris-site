import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { AuthStack } from "../lib/auth-stack.js";
import { ENV } from "../lib/config.js";

describe("MuxarisAuth", () => {
  const app = new App();
  const stack = new AuthStack(app, "MuxarisAuth", { env: ENV });
  const t = Template.fromStack(stack);

  it("pins the secondary account", () => {
    expect(stack.account).toBe("005533348545");
    expect(stack.region).toBe("ap-south-1");
  });
  it("creates a user pool with email sign-in and verification", () => {
    t.hasResourceProperties("AWS::Cognito::UserPool", {
      UsernameAttributes: ["email"],
      AutoVerifiedAttributes: ["email"],
      Policies: { PasswordPolicy: { MinimumLength: 10 } },
    });
  });
  it("creates a public PKCE client with localhost and production callbacks", () => {
    t.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      GenerateSecret: false,
      AllowedOAuthFlows: ["code"],
      CallbackURLs: [
        "https://muxaris.com/auth/callback",
        "https://www.muxaris.com/auth/callback",
        "http://localhost:3000/auth/callback",
      ],
    });
  });
  it("exports the ids", () => {
    t.hasOutput("UserPoolId", {});
    t.hasOutput("UserPoolClientId", {});
    t.hasOutput("UserPoolDomain", {});
  });
});
