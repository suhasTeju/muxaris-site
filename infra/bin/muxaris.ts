import { Annotations, App, type Stack } from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack.js";
import { DataStack } from "../lib/data-stack.js";
import { DnsStack } from "../lib/dns-stack.js";
import { EdgeCertStack } from "../lib/edge-cert-stack.js";
import { CicdStack } from "../lib/cicd-stack.js";
import { MigrateStack } from "../lib/migrate-stack.js";
import { NetworkStack } from "../lib/network-stack.js";
import { NotifyStack } from "../lib/notify-stack.js";
import { ObservabilityStack } from "../lib/observability-stack.js";
import { StorageStack } from "../lib/storage-stack.js";
import { ServicesStack } from "../lib/services-stack.js";
import { WebStack } from "../lib/web-stack.js";
import { WorkersStack } from "../lib/workers-stack.js";
import {
  ACCOUNT,
  EDGE_ENV,
  ENV,
  PUBLIC_API_URL,
  WEB_ORIGINS,
  validateConfig,
} from "../lib/config.js";

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
const notify = new NotifyStack(app, "MuxarisNotify", {
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

// Config problems are errors on the stacks that need the values, so `cdk deploy MuxarisAuth`
// works on an empty account while Services, Migrate and Cicd refuse to deploy without them.
const problems = validateConfig(process.env);
const refuse = (stack: Stack, reasons: string[]) => {
  for (const r of reasons)
    Annotations.of(stack).addError(`Refusing to deploy ${stack.stackName}: ${r}`);
};
const imageTag = process.env.IMAGE_TAG || "unset";
const migrate = new MigrateStack(app, "MuxarisMigrate", {
  env: ENV,
  network,
  data,
  imageTag,
  description: "Muxaris migrate task definition, deployed before Services so migrations run first",
});
refuse(migrate, problems.migrate);
const services = new ServicesStack(app, "MuxarisServices", {
  env: ENV,
  network,
  data,
  storage,
  imageTag,
  certArn: process.env.CERT_ARN || undefined,
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || "unset",
  cognitoClientId: process.env.COGNITO_CLIENT_ID || "unset",
  corsOrigins: WEB_ORIGINS.join(","),
  maxSessions: Number(process.env.MAX_SESSIONS || 15),
  maxCallSeconds: Number(process.env.MAX_CALL_SECONDS || 1200),
  notifyFromEmail: process.env.NOTIFY_FROM_EMAIL || "appointments@muxaris.com",
  billingEnabled: process.env.BILLING_ENABLED === "1",
  publicApiUrl: PUBLIC_API_URL,
  telephonyProvider: process.env.TELEPHONY_PROVIDER || "",
  description: "Muxaris ALB, ECS cluster, API and voice gateway services",
});
refuse(services, problems.services);
// The ALB certificate's validation CNAMEs, as they stood at GoDaddy (renewal needs them).
const ALB_CERT_VALIDATION = [
  [
    "_19235f4cd571a280b6c5cf3f0ebe2c34.api.muxaris.com",
    "_cee6bff133ec7374ead45caea2bf2adc.wzccmgtwzk.acm-validations.aws",
  ],
  [
    "_4f8ca59969c9b5732de9d0d6a42d9bf0.voice.muxaris.com",
    "_99ff50b95d57add975173611876ae600.wzccmgtwzk.acm-validations.aws",
  ],
] as const;
const webTarget = process.env.WEB_TARGET === "cloudfront" ? "cloudfront" : "netlify";
const dns = new DnsStack(app, "MuxarisDns", {
  env: ENV,
  services,
  notify,
  webTarget,
  cloudfrontDomain: process.env.CLOUDFRONT_DOMAIN || undefined,
  albCertValidation: ALB_CERT_VALIDATION,
  description: "Muxaris: the muxaris.com hosted zone and every record in it",
});
refuse(dns, problems.dns);
const edgeCert = new EdgeCertStack(app, "MuxarisEdgeCert", {
  env: EDGE_ENV,
  hostedZoneId: dns.zone.hostedZoneId,
  description: "Muxaris: CloudFront certificate for muxaris.com (us-east-1)",
});
const web = new WebStack(app, "MuxarisWeb", {
  env: ENV,
  network,
  data,
  services,
  dns,
  edgeCert,
  imageTag,
  description: "Muxaris web app: Fargate service, ALB origin and the CloudFront distribution",
});
refuse(web, problems.web);
new ObservabilityStack(app, "MuxarisObservability", {
  env: ENV,
  data,
  workers,
  services,
  alarmEmail: process.env.ALARM_EMAIL || undefined,
  description: "Muxaris alarms (SNS), gateway metric filters and the dashboard",
});
const cicd = new CicdStack(app, "MuxarisCicd", {
  env: ENV,
  data,
  // OIDC subject prefix. Repositories created after 2026-07-15 use GitHub's immutable subject
  // format "OWNER@OWNER-ID/REPO@REPO-ID" (older ones use "OWNER/REPO"); read it with
  // `gh api repos/suhasTeju/muxaris-site/actions/oidc/customization/sub` (sub_claim_prefix).
  githubRepo: "suhasTeju@60204441/muxaris-site@1336095316",
  description: "Muxaris GitHub OIDC provider and deploy role",
});
refuse(cicd, problems.cicd);
