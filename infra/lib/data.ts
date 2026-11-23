import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import { Duration, RemovalPolicy, type Stack } from "aws-cdk-lib";
import type { NetworkOutput } from "./network.js";

export interface DataOutput {
  readonly db: rds.DatabaseInstance;
}

export const DB_NAME = "chaintelescope";
export const DB_USERNAME = "ct";

/**
 * Single-AZ Postgres 16 on db.t4g.micro with a generated RDS secret.
 * Dev baseline: destroy on stack delete, 1-day backups. For production,
 * set removalPolicy to SNAPSHOT/RETAIN, multiAz to true, and raise retention.
 */
export function buildData(stack: Stack, network: NetworkOutput): DataOutput {
  const db = new rds.DatabaseInstance(stack, "Db", {
    engine: rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.VER_16,
    }),
    instanceType: ec2.InstanceType.of(
      ec2.InstanceClass.BURSTABLE4_GRAVITON,
      ec2.InstanceSize.MICRO,
    ),
    vpc: network.vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    credentials: rds.Credentials.fromGeneratedSecret(DB_USERNAME, {
      secretName: "chaintelescope/db-credentials",
    }),
    databaseName: DB_NAME,
    allocatedStorage: 20,
    storageType: rds.StorageType.GP3,
    multiAz: false,
    backupRetention: Duration.days(1),
    deletionProtection: false,
    removalPolicy: RemovalPolicy.DESTROY,
  });
  return { db };
}
