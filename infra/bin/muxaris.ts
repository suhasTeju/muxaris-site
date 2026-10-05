import { App } from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack.js";
import { DataStack } from "../lib/data-stack.js";
import { CicdStack } from "../lib/cicd-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { NotifyStack } from "../lib/notify-stack.js";
import { ObservabilityStack } from "../lib/observability-stack.js";
import { StorageStack } from "../lib/storage-stack.js";
import { ServicesStack } from "../lib/services-stack.js";
import { WorkersStack } from "../lib/workers-stack.js";
import { ACCOUNT, ENV, WEB_ORIGINS } from "../lib/config.js";

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
const storage = new StorageStack(app, "MuxarisStorage", {
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
const data = new DataStack(app, "MuxarisData", {
  env: ENV,
  network,
  description: "Muxaris Postgres, secrets and container registries",
});
const workers = new WorkersStack(app, "MuxarisWorkers", {
  env: ENV,
  network,
  storage,
  data,
  smsEnabled: process.env.SMS_ENABLED === "1",
  notifyFromEmail: process.env.NOTIFY_FROM_EMAIL || undefined,
  description: "Muxaris post-call and notifier Lambdas, queue mapping and schedules",
});

const cognitoUserPoolId = process.env.COGNITO_USER_POOL_ID ?? "";
const cognitoClientId = process.env.COGNITO_CLIENT_ID ?? "";
if (!cognitoUserPoolId || !cognitoClientId) {
  throw new Error(
    "Refusing to synth MuxarisServices: COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set (they live in .env).",
  );
}
const services = new ServicesStack(app, "MuxarisServices", {
  env: ENV,
  network,
  data,
  storage,
  imageTag: process.env.IMAGE_TAG || "latest",
  certArn: process.env.CERT_ARN || undefined,
  cognitoUserPoolId,
  cognitoClientId,
  corsOrigins: WEB_ORIGINS.join(","),
  maxSessions: Number(process.env.MAX_SESSIONS || 15),
  maxCallSeconds: Number(process.env.MAX_CALL_SECONDS || 1200),
  notifyFromEmail: process.env.NOTIFY_FROM_EMAIL || "appointments@muxaris.com",
  billingEnabled: process.env.BILLING_ENABLED === "1",
  publicApiUrl: process.env.PUBLIC_API_URL || "https://api.muxaris.com",
  description: "Muxaris ALB, ECS cluster, API and voice gateway services, migrate task",
});
new ObservabilityStack(app, "MuxarisObservability", {
  env: ENV,
  data,
  workers,
  services,
  alarmEmail: process.env.ALARM_EMAIL || undefined,
  description: "Muxaris alarms (SNS), gateway metric filters and the dashboard",
});
new CicdStack(app, "MuxarisCicd", {
  env: ENV,
  data,
  githubRepo: "suhasTeju/muxaris-site",
  description: "Muxaris GitHub OIDC provider and deploy role",
});
