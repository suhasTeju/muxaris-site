import { App } from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack.js";
import { ENV } from "../lib/config.js";

const app = new App();
new AuthStack(app, "MuxarisAuth", {
  env: ENV,
  googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
  googleSecretName: process.env.GOOGLE_OAUTH_CLIENT_ID ? "muxaris/google-oauth" : undefined,
  description: "Muxaris: Cognito user pool for the web app",
});
