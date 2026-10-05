import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { ACCOUNT, REGION } from "./config.js";
import type { DataStack } from "./data-stack.js";
import type { ServicesStack } from "./services-stack.js";

export interface CicdStackProps extends StackProps {
  data: DataStack;
  services: ServicesStack;
  /** `owner/name` of the GitHub repository whose main branch may deploy. */
  githubRepo: string;
}

const ISSUER = "token.actions.githubusercontent.com";

/** GitHub OIDC provider and the role the deploy workflow assumes (main branch only). */
export class CicdStack extends Stack {
  readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);
    const { data, services } = props;

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
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${ACCOUNT}:role/cdk-hnb659fds-*-${ACCOUNT}-${REGION}`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ecs:RunTask", "ecs:DescribeTasks"],
        resources: [
          services.migrateTaskDef.taskDefinitionArn,
          `arn:aws:ecs:${REGION}:${ACCOUNT}:task/${services.cluster.clusterName}/*`,
        ],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [
          services.migrateTaskDef.taskRole.roleArn,
          services.migrateTaskDef.obtainExecutionRole().roleArn,
        ],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["logs:GetLogEvents", "logs:FilterLogEvents"],
        resources: [
          services.migrateLogGroup.logGroupArn,
          `${services.migrateLogGroup.logGroupArn}:*`,
        ],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({ actions: ["cloudformation:DescribeStacks"], resources: ["*"] }),
    );

    new CfnOutput(this, "DeployRoleArn", { value: role.roleArn });
  }
}
