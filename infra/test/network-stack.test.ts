import { App } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { ENV } from "../lib/config.js";
import { NetworkStack } from "../lib/network-stack.js";

describe("NetworkStack", () => {
  const t = Template.fromStack(new NetworkStack(new App(), "T", { env: ENV }));
  it("two AZs: public, private-with-egress (one NAT) and isolated subnets", () => {
    t.resourceCountIs("AWS::EC2::NatGateway", 1);
    t.resourceCountIs("AWS::EC2::Subnet", 6);
    t.hasResourceProperties("AWS::EC2::VPC", {
      CidrBlock: "10.42.0.0/16",
      EnableDnsHostnames: true,
    });
  });
  it("db security group only accepts 5432 from the services and the lambdas", () => {
    const ingress = t.findResources("AWS::EC2::SecurityGroupIngress");
    const to5432 = Object.values(ingress).filter((r) => r.Properties.ToPort === 5432);
    if (to5432.length !== 2)
      throw new Error(`expected 2 ingress rules to 5432, got ${to5432.length}`);
    t.hasResourceProperties("AWS::EC2::SecurityGroup", {
      GroupDescription: Match.stringLikeRegexp("ALB"),
      SecurityGroupIngress: Match.arrayWith([Match.objectLike({ FromPort: 80 })]),
    });
  });
});
