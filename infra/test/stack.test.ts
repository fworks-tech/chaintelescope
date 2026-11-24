import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApi } from "../lib/api.js";
import { buildData } from "../lib/data.js";
import { buildNewsJob } from "../lib/jobs.js";
import { buildNetwork } from "../lib/network.js";
import { buildObservability } from "../lib/observability.js";

let template: Template;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "Test", {
    env: { account: "123456789012", region: "us-east-1" },
  });
  const network = buildNetwork(stack);
  const data = buildData(stack, network);
  const api = buildApi(stack, network, data, {
    webOrigin: "https://app.example.com",
  });
  const jobs = buildNewsJob(stack, network, data, api.cluster);
  buildObservability(stack, api, data, jobs);
  template = Template.fromStack(stack);
});

describe("chaintelescope stack", () => {
  test("provisions VPC, ALB, Fargate, Postgres, and alarms", () => {
    template.resourceCountIs("AWS::EC2::VPC", 1);
    template.resourceCountIs(
      "AWS::ElasticLoadBalancingV2::LoadBalancer",
      1,
    );
    template.resourceCountIs("AWS::ECS::Service", 1);
    template.resourceCountIs("AWS::RDS::DBInstance", 1);
    template.resourceCountIs("AWS::SNS::Topic", 1);
    template.resourceCountIs("AWS::CloudWatch::Alarm", 9);
  });

  test("runs the news ingest hourly as a small run-to-complete task", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      ScheduleExpression: "cron(0 * * * ? *)",
    });

    // Pin the writer task itself (not just any task definition): image,
    // command, size, and the rule wired to it.
    const tasks = template.findResources("AWS::ECS::TaskDefinition");
    const writerId = Object.keys(tasks).find((id) => {
      const containers =
        tasks[id]?.Properties?.ContainerDefinitions ?? [];
      return containers.some(
        (container: { Name?: string }) => container.Name === "writer",
      );
    });
    expect(writerId).toBeDefined();
    const writer = tasks[writerId ?? ""]?.Properties;
    expect(writer?.Cpu).toBe("256");
    expect(writer?.Memory).toBe("512");
    expect(writer?.ContainerDefinitions?.[0]?.Image?.["Fn::Join"]).toBeDefined();
    expect(writer?.ContainerDefinitions?.[0]?.Command).toEqual([
      "python",
      "-m",
      "src.data.news.writer",
    ]);
    const env = Object.fromEntries(
      (
        writer?.ContainerDefinitions?.[0]?.Environment ?? []
      ).map((entry: { Name?: string; Value?: string }) => [
        entry.Name,
        entry.Value,
      ]),
    );
    expect(env["PGDATABASE"]).toBe("chaintelescope");

    const rules = template.findResources("AWS::Events::Rule");
    const ruleTargets = Object.values(rules)
      .filter(
        (rule) =>
          rule?.Properties?.ScheduleExpression === "cron(0 * * * ? *)",
      )
      .flatMap((rule) => rule?.Properties?.Targets ?? []);
    expect(
      ruleTargets.some(
        (target: { EcsParameters?: { TaskDefinitionArn?: unknown } }) =>
          JSON.stringify(target.EcsParameters?.TaskDefinitionArn).includes(
            writerId ?? "no-such-task",
          ),
      ),
    ).toBe(true);
  });

  test("uses cheap dev-baseline data settings", () => {
    template.hasResourceProperties("AWS::RDS::DBInstance", {
      DBInstanceClass: "db.t4g.micro",
      AllocatedStorage: "20",
      Engine: "postgres",
      MultiAZ: false,
    });
  });

  test("health check hits /healthz", () => {
    template.hasResourceProperties(
      "AWS::ElasticLoadBalancingV2::TargetGroup",
      { HealthCheckPath: "/healthz" },
    );
  });
});
