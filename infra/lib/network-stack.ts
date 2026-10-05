import { Stack, type StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Construct } from "constructs";

/** One VPC: public subnets for the ALB and Fargate tasks (public IPs, no NAT needed), private
 *  subnets with one NAT gateway for the Lambdas, isolated subnets for RDS. Ruling R1. */
export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly albSg: ec2.SecurityGroup;
  readonly serviceSg: ec2.SecurityGroup;
  readonly lambdaSg: ec2.SecurityGroup;
  readonly dbSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    this.vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: "muxaris",
      ipAddresses: ec2.IpAddresses.cidr("10.42.0.0/16"),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: "isolated", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
    this.albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc: this.vpc,
      description: "ALB: 80/443 from anywhere",
      allowAllOutbound: true,
    });
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
    this.serviceSg = new ec2.SecurityGroup(this, "ServiceSg", {
      vpc: this.vpc,
      description: "Fargate services: from the ALB only",
      allowAllOutbound: true,
    });
    this.serviceSg.addIngressRule(this.albSg, ec2.Port.tcp(4000));
    this.serviceSg.addIngressRule(this.albSg, ec2.Port.tcp(4100));
    this.lambdaSg = new ec2.SecurityGroup(this, "LambdaSg", {
      vpc: this.vpc,
      description: "Workers (Lambda)",
      allowAllOutbound: true,
    });
    this.dbSg = new ec2.SecurityGroup(this, "DbSg", {
      vpc: this.vpc,
      description: "RDS: 5432 from services and lambdas",
      allowAllOutbound: false,
    });
    this.dbSg.addIngressRule(this.serviceSg, ec2.Port.tcp(5432));
    this.dbSg.addIngressRule(this.lambdaSg, ec2.Port.tcp(5432));
  }
}
