# AWS services

Everything runs in one account (secondary account `005533348545`, region `ap-south-1`, Mumbai) and
is defined as CDK stacks under `infra/lib`. The website is on Netlify and DNS is at GoDaddy; neither
is AWS.

## Services in use

| Service                                | Role in Muxaris                                                                                                                                                                                              | Why this service                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amazon Cognito                         | Sign-in for clinic staff (user pool and app client, optional Google federation). The API and the voice gateway verify its access tokens. Stack `MuxarisAuth`.                                                 | Managed auth with no password handling in our code; verified tokens work on both HTTP and the first WebSocket frame.                                      |
| ECS on Fargate (ARM64)                 | Runs the API (port 4000) and the voice gateway (port 4100) as two services in the `muxaris` cluster, plus (in its own stack, `MuxarisMigrate`, deployed first) the one-off `muxaris-migrate` task. Stack `MuxarisServices`.                                         | The gateway holds long WebSocket calls, so it needs a long-running process, not Lambda. Fargate has no servers to patch and Graviton is cheaper per vCPU. |
| Amazon ECR                             | Two repositories, `muxaris-api` and `muxaris-voice-gateway`, immutable tags, scan on push, last 10 images kept. Stack `MuxarisData`.                                                                          | Native to ECS, so no pull credentials to manage; immutable tags make a rollback a known image.                                                            |
| Application Load Balancer              | One internet-facing ALB. `voice.muxaris.com` and the paths `/v1/session*` and `/v1/telephony/*` go to the gateway, everything else to the API. Idle timeout 3600 s. HTTPS once an ACM certificate is attached. | Host and path routing on one address, WebSocket support, health checks and an `HTTPCode_Target_5XX` metric for alarms.                                    |
| VPC, subnets and one NAT gateway       | `10.42.0.0/16`, 2 AZs: public subnets (ALB and Fargate tasks), private subnets with egress through one NAT (Lambdas), isolated subnets (RDS). Stack `MuxarisNetwork`.                                          | RDS has no route to the internet. Lambdas in a VPC need a NAT to reach Bedrock, Secrets Manager and SES. Fargate in public subnets avoids a second NAT.   |
| Amazon RDS for PostgreSQL 16           | The system of record: `db.t4g.micro`, single AZ, 20 GB gp3 (autoscaling to 50 GB), `storageEncrypted: true`, 7-day backups, deletion protection, retained on stack deletion. Stack `MuxarisData`.             | The schema is relational (clinics, slots, appointments, usage ledger) and uses transactions and `FOR UPDATE SKIP LOCKED`; Postgres is the fit.            |
| Amazon S3                              | Call recordings and transcripts, `clinics/{clinicId}/calls/{callId}/...`. Private, SSE-S3, SSL enforced, 90-day lifecycle expiry. Browsers play recordings through short-lived presigned URLs. `MuxarisStorage`. | Cheap durable object storage with expiry built in, which is how the 90-day retention promise is enforced for recordings.                                  |
| Amazon SQS (with a dead-letter queue)  | `muxaris-post-call`: the gateway sends `call.completed`, the post-call Lambda consumes it. After 5 failed receives a message moves to `muxaris-post-call-dlq` (14 days). `MuxarisStorage`.                    | Decouples the live call from summarising it; retries and the DLQ come free, and the DLQ depth drives an alarm.                                            |
| AWS Lambda (Node 22, ARM64)            | Four functions from two workers: post-call `handler` (SQS) and `sweepHandler`, notifier `deliverHandler` and `remindersHandler`. They run in the private subnets. Stack `MuxarisWorkers`.                       | Bursty, short jobs that are idle most of the time. Paying per invocation is far cheaper than a worker task running all day.                               |
| Amazon EventBridge                     | Three schedules: deliver notifications every minute, queue reminders every 15 minutes, stale-call sweep and 90-day purge every 15 minutes. `MuxarisWorkers`.                                                  | The simplest cron for Lambda, with no extra service to run.                                                                                               |
| Amazon Bedrock (Amazon Nova)           | Nova 2 Lite (`global.amazon.nova-2-lite-v1:0`) runs the live conversation with tool use. Nova Pro (`apac.amazon.nova-pro-v1:0`, APAC inference profile) writes post-call summaries, sentiment and entities. | Amazon Nova models only. Nova 2 Lite is fast and cheap enough for a spoken turn; Nova Pro writes better summaries and stays in the APAC region.           |
| Amazon SES                             | Appointment confirmation, reschedule, cancellation and reminder email from `appointments@muxaris.com`. The domain identity (DKIM, custom MAIL FROM) is in stack `MuxarisNotify`.                              | Email is the live notification channel for India, and SES is the cheapest sender with DKIM on our own domain.                                             |
| Amazon SNS                             | (1) The `muxaris-alarms` topic that carries every CloudWatch alarm to email. (2) SMS to patients, **implemented but flagged off** (`SMS_ENABLED`): Indian SMS needs TRAI DLT registration.                      | Alarms need a fan-out that CloudWatch can call natively. SMS stays behind a flag until DLT is done.                                                       |
| AWS Secrets Manager                    | `muxaris/db` (RDS-generated credentials) and `muxaris/app` (Sarvam, Razorpay and WhatsApp values, plus the telephony values when enabled). Processes read them at start. Optional `muxaris/google-oauth`.     | Keeps secrets out of images, task definitions and CloudFormation templates; the task and Lambda roles are granted read on exactly these two secrets.      |
| Amazon CloudWatch                      | Log groups `/muxaris/api`, `/muxaris/voice-gateway`, `/muxaris/migrate`; metric filters on the gateway's JSON logs; the `muxaris` dashboard; alarms to the SNS topic (see the runbook). `MuxarisObservability`.  | Zero setup next to ECS and Lambda; log-derived metrics give per-turn latency without a metrics SDK.                                                       |
| IAM, with the GitHub OIDC provider     | The role `MuxarisGithubDeploy` is assumed by GitHub Actions on `main` only. No long-lived AWS keys exist in GitHub. Task roles are least-privilege per process. Stack `MuxarisCicd`.                          | OIDC removes stored credentials; the role is limited to ECR push, CDK's own bootstrap roles and the migrate task.                                         |
| AWS Certificate Manager                | One DNS-validated certificate for `api.muxaris.com` and `voice.muxaris.com`, attached to the ALB HTTPS listener. Requested by `scripts/request-cert.sh`.                                                       | Free public certificates that renew themselves once the validation CNAMEs stay in DNS.                                                                    |
| AWS CDK and CloudFormation             | All of the above as TypeScript stacks: Auth, Storage, Notify, Network, Data, Workers, Services, Observability, Cicd. The CDK bootstrap stack provides the asset bucket and deploy roles.                       | Reviewable, repeatable infrastructure; the same code deploys from a laptop and from CI.                                                                   |

## Monthly cost estimate

US dollars at ap-south-1 list prices, before model and speech usage.

| Item                                                                | Approx. US$ / month |
| ------------------------------------------------------------------- | ------------------: |
| RDS `db.t4g.micro`, single AZ, 20 GB                                |                  16 |
| Two Fargate ARM tasks, 0.5 vCPU / 1 GB each                         |                  23 |
| Application Load Balancer (plus LCU charges)                        |                  20 |
| One NAT gateway (plus data processing)                              |                  33 |
| Secrets Manager, CloudWatch, S3, SQS, Lambda, ECR, Cognito          |                   8 |
| **Total**                                                           |       **100 to 115** |

Container Insights and public IPv4 address charges add a few dollars. Bedrock (Nova) tokens and Sarvam speech-to-text and text-to-speech are billed by use and are not in
this total. The API service can scale from one to two tasks on CPU, so a busy month can add one more
0.5 vCPU / 1 GB task. The gateway never scales out (see the runbook).

## Cheaper alternatives considered

- **Lambdas in public subnets, no NAT.** Rejected: a Lambda in a VPC never gets a public IP, so it
  could not reach Bedrock, Secrets Manager or SES without a NAT or VPC endpoints. The NAT is the
  largest single line (about US$33) and is the first thing to revisit if the bill matters more than
  simplicity.
- **RDS Proxy.** Not needed at this scale: two small services and four Lambdas open few connections.
- **CloudFront in front of the ALB** for a temporary HTTPS URL before the domain is ready.
  Rejected: WebSocket configuration and extra cost for a state that lasts only until the
  certificate is issued. The ALB's own hostname serves plain HTTP until then.
- **Fargate Spot** for the gateway. Rejected: Spot tasks can be reclaimed with two minutes' notice,
  which would drop live calls.
