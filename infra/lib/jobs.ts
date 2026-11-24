import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Stack } from "aws-cdk-lib";
import { DB_NAME } from "./data.js";
import type { DataOutput } from "./data.js";
import type { NetworkOutput } from "./network.js";

export interface JobsOutput {
  /** Hourly RSS ingest rule; observability alarms on its failed invocations. */
  readonly newsRule: events.Rule;
  /** Writer logs; observability counts Python tracebacks in it. */
  readonly logGroup: logs.LogGroup;
}

/**
 * Hourly Python news ingest as a run-to-complete Fargate task, triggered by
 * EventBridge. Same out-of-stack image pattern as the API: pre-create
 * `chaintelescope/news-job` and push `:latest` by hand (infra/README.md) —
 * the task needs the image before its first run, which an in-stack repo
 * cannot provide.
 *
 * No NAT gateway in this VPC, so the task runs in public subnets with a
 * public IP (ECR pulls + RSS fetches need internet); Postgres stays in
 * isolated subnets and only opens 5432 to the job security group.
 * Writes are idempotent (`ON CONFLICT (content_hash) DO NOTHING`), so an
 * at-least-once rerun after a failed invocation is safe.
 */
export function buildNewsJob(
  stack: Stack,
  network: NetworkOutput,
  data: DataOutput,
  cluster: ecs.Cluster,
): JobsOutput {
  const repo = ecr.Repository.fromRepositoryName(
    stack,
    "NewsJobRepo",
    "chaintelescope/news-job",
  );

  const logGroup = new logs.LogGroup(stack, "NewsJobLogGroup", {
    // Explicit name: the runbook tails this group, and the failure alarm
    // filters it. A CFN-generated name would break both.
    logGroupName: "/aws/ecs/news-job",
    retention: logs.RetentionDays.ONE_WEEK,
  });

  const taskDef = new ecs.FargateTaskDefinition(stack, "NewsJobTask", {
    cpu: 256,
    memoryLimitMiB: 512,
  });

  taskDef.addContainer("writer", {
    image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
    command: ["python", "-m", "src.data.news.writer"],
    environment: {
      PGHOST: data.db.dbInstanceEndpointAddress,
      PGPORT: data.db.dbInstanceEndpointPort,
      PGDATABASE: DB_NAME,
    },
    secrets: {
      PGUSER: ecs.Secret.fromSecretsManager(
        // Set by fromGeneratedSecret in data.ts, so always present.
        // oxlint-disable-next-line no-non-null-assertion
        data.db.secret!,
        "username",
      ),
      PGPASSWORD: ecs.Secret.fromSecretsManager(
        // oxlint-disable-next-line no-non-null-assertion
        data.db.secret!,
        "password",
      ),
    },
    logging: ecs.LogDrivers.awsLogs({
      logGroup,
      streamPrefix: "news-job",
    }),
  });

  const jobSg = new ec2.SecurityGroup(stack, "NewsJobSg", {
    vpc: network.vpc,
    description: "News ingest task: egress only, RDS opens 5432 to it",
  });
  data.db.connections.allowFrom(
    jobSg,
    ec2.Port.tcp(5432),
    "News job to Postgres",
  );

  const newsRule = new events.Rule(stack, "NewsJobSchedule", {
    description: "Hourly news ingest (RSS feeds into news_items)",
    schedule: events.Schedule.cron({ minute: "0" }),
  });
  newsRule.addTarget(
    new targets.EcsTask({
      cluster,
      taskDefinition: taskDef,
      taskCount: 1,
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
      assignPublicIp: true,
      securityGroups: [jobSg],
    }),
  );

  return { newsRule, logGroup };
}
