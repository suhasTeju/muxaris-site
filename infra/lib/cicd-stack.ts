import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { ACCOUNT, REGION } from "./config.js";
import type { DataStack } from "./data-stack.js";

export interface CicdStackProps extends StackProps {
  data: DataStack;
  /** `owner/name` of the GitHub repository whose main branch may deploy. */
  githubRepo: string;
}

const ISSUER = "token.actions.githubusercontent.com";

/** GitHub OIDC provider and the role the deploy workflow assumes (main branch only). */
export class CicdStack extends Stack {
  readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);
    const { data } = props;

    const provider = new iam.OpenIdConnectProvider(this, "GithubOidc", {
      url: `https://${ISSUER}`,
      clientIds: ["sts.amazonaws.com"],
    });

    this.deployRole = new iam.Role(this, "DeployRole", {
      roleName: "MuxarisGithubDeploy",
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: { [`${ISSUER}:aud`]: "sts.amazonaws.com" },
        StringLike: { [`${ISSUER}:sub`]: `repo:${props.githubRepo}:ref:refs/heads/main` },
      }),
    });
    const role = this.deployRole;

    role.addToPolicy(
      new iam.PolicyStatement({ actions: ["ecr:GetAuthorizationToken"], resources: ["*"] }),
    );
    data.apiRepo.grantPullPush(role);
    data.gatewayRepo.grantPullPush(role);

    // CDK deploys through the bootstrap roles (default qualifier hnb659fds).
    // CDK deploys through the bootstrap roles (default qualifier hnb659fds).
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${ACCOUNT}:role/cdk-hnb659fds-*-${ACCOUNT}-${REGION}`],
      }),
    );
    // Everything below is scoped by stable names (family, cluster, role and log group names set in
    // ServicesStack), so nothing revision-specific is imported across stacks.
    const clusterArn = `arn:aws:ecs:${REGION}:${ACCOUNT}:cluster/muxaris`;
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ecs:RunTask"],
        resources: [`arn:aws:ecs:${REGION}:${ACCOUNT}:task-definition/muxaris-migrate:*`],
        conditions: { ArnEquals: { "ecs:cluster": clusterArn } },
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ecs:DescribeTasks"],
        resources: [`arn:aws:ecs:${REGION}:${ACCOUNT}:task/muxaris/*`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: ["muxaris-migrate-task", "muxaris-migrate-exec"].map(
          (n) => `arn:aws:iam::${ACCOUNT}:role/${n}`,
        ),
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["logs:GetLogEvents", "logs:FilterLogEvents"],
        resources: [
          `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/muxaris/migrate`,
          `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/muxaris/migrate:*`,
        ],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({ actions: ["cloudformation:DescribeStacks"], resources: ["*"] }),
    );

    new CfnOutput(this, "DeployRoleArn", { value: role.roleArn });
  }
}
