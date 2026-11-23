import * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Stack } from "aws-cdk-lib";

export interface NetworkOutput {
  readonly vpc: ec2.Vpc;
}

/**
 * Two-AZ VPC with no NAT gateway (baseline cost control, ~$32/mo saved).
 * Fargate tasks run in public subnets with public IPs; Postgres lives in
 * isolated subnets and is reachable over VPC-internal routing (no NAT needed).
 * AZs are explicit (`<region>a/b`) so `cdk synth` needs no account lookups.
 */
export function buildNetwork(stack: Stack): NetworkOutput {
  const region = stack.region;
  const vpc = new ec2.Vpc(stack, "Vpc", {
    availabilityZones: [`${region}a`, `${region}b`],
    natGateways: 0,
    subnetConfiguration: [
      { name: "Public", subnetType: ec2.SubnetType.PUBLIC },
      { name: "Db", subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    ],
  });
  return { vpc };
}
