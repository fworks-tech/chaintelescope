import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { RemovalPolicy, type Stack } from "aws-cdk-lib";
import { DB_NAME } from "./data.js";
import type { DataOutput } from "./data.js";
import type { NetworkOutput } from "./network.js";

export interface ApiProps {
  /** Public origin of the Vercel web app, echoed by CORS. No default wildcard. */
  readonly webOrigin: string;
}

export interface ApiOutput {
  readonly service: ecsPatterns.ApplicationLoadBalancedFargateService;
}

/**
 * Fargate API behind an ALB (0.5 vCPU / 1 GB, 1 task). The image comes from
 * the in-stack ECR repo — build and push it by hand before the first deploy
 * (see infra/README.md); the stack never builds Docker at synth time.
 * DB access uses the PG* parts pattern (Secret values cannot be concatenated
 * at synth time; apps/api/src/env-db.ts composes them at boot).
 */
export function buildApi(
  stack: Stack,
  network: NetworkOutput,
  data: DataOutput,
  props: ApiProps,
): ApiOutput {
  const repo = new ecr.Repository(stack, "ApiRepo", {
    removalPolicy: RemovalPolicy.DESTROY,
    emptyOnDelete: true,
  });

  // Created by hand before the first deploy (infra/README.md).
  const appSecrets = secretsmanager.Secret.fromSecretNameV2(
    stack,
    "AppSecrets",
    "chaintelescope/app-secrets",
  );

  const cluster = new ecs.Cluster(stack, "Cluster", {
    vpc: network.vpc,
  });

  const service = new ecsPatterns.ApplicationLoadBalancedFargateService(
    stack,
    "Api",
    {
      cluster,
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      assignPublicIp: true,
      taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
        containerPort: 3000,
        environment: {
          NODE_ENV: "production",
          HOST: "0.0.0.0",
          PORT: "3000",
          PGHOST: data.db.dbInstanceEndpointAddress,
          PGPORT: data.db.dbInstanceEndpointPort,
          PGDATABASE: DB_NAME,
          CORS_ORIGINS: props.webOrigin,
          SCAN_DAEMON_ENABLED: "true",
        },
        secrets: {
          PGUSER: ecs.Secret.fromSecretsManager(
            // Set by fromGeneratedSecret above, so always present.
            // oxlint-disable-next-line no-non-null-assertion
            data.db.secret!,
            "username",
          ),
          PGPASSWORD: ecs.Secret.fromSecretsManager(
            // oxlint-disable-next-line no-non-null-assertion
            data.db.secret!,
            "password",
          ),
          JWT_ACCESS_SECRET: ecs.Secret.fromSecretsManager(
            appSecrets,
            "jwtAccessSecret",
          ),
          ARGON2_PEPPER: ecs.Secret.fromSecretsManager(
            appSecrets,
            "argon2Pepper",
          ),
        },
      },
    },
  );

  service.targetGroup.configureHealthCheck({
    path: "/healthz",
    healthyThresholdCount: 2,
  });

  data.db.connections.allowFrom(
    service.service,
    ec2.Port.tcp(5432),
    "Fargate API to Postgres",
  );

  return { service };
}
