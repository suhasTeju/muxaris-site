import { App } from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack.js";
import { DataStack } from "../lib/data-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { NotifyStack } from "../lib/notify-stack.js";
import { StorageStack } from "../lib/storage-stack.js";
import { ACCOUNT, ENV } from "../lib/config.js";

if (process.env.CDK_DEFAULT_ACCOUNT !== ACCOUNT) {
  throw new Error(
    `Refusing to synth/deploy: CDK_DEFAULT_ACCOUNT is '${process.env.CDK_DEFAULT_ACCOUNT ?? "unset"}', expected ${ACCOUNT}. Run via 'npm run synth -w @muxaris/infra' (infra/scripts/cdk.sh applies the AWS guard).`,
  );
}

const app = new App();
new AuthStack(app, "MuxarisAuth", {
  env: ENV,
  googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || undefined,
  googleSecretName: process.env.GOOGLE_OAUTH_CLIENT_ID ? "muxaris/google-oauth" : undefined,
  description: "Muxaris: Cognito user pool for the web app",
});
new StorageStack(app, "MuxarisStorage", {
  env: ENV,
  description: "Muxaris call recordings bucket and post-call queue",
});
new NotifyStack(app, "MuxarisNotify", {
  env: ENV,
  description: "Muxaris: SES domain identity for appointment email",
});
const network = new NetworkStack(app, "MuxarisNetwork", {
  env: ENV,
  description: "Muxaris VPC, subnets and security groups",
});
new DataStack(app, "MuxarisData", {
  env: ENV,
  network,
  description: "Muxaris Postgres, secrets and container registries",
});
