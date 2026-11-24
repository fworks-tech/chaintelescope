import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, test } from "vitest";
import { buildApi } from "../lib/api.js";
import { buildData } from "../lib/data.js";
import { buildNewsJob } from "../lib/jobs.js";
import { buildNetwork } from "../lib/network.js";
import { buildObservability } from "../lib/observability.js";

function synth() {
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
  return Template.fromStack(stack);
}

describe("chaintelescope stack", () => {
  test("provisions VPC, ALB, Fargate, Postgres, and alarms", () => {
    const template = synth();
    template.resourceCountIs("AWS::EC2::VPC", 1);
    template.resourceCountIs(
      "AWS::ElasticLoadBalancingV2::LoadBalancer",
      1,
    );
    template.resourceCountIs("AWS::ECS::Service", 1);
    template.resourceCountIs("AWS::RDS::DBInstance", 1);
    template.resourceCountIs("AWS::SNS::Topic", 1);
    template.resourceCountIs("AWS::CloudWatch::Alarm", 8);
  });

  test("runs the news ingest hourly as a small run-to-complete task", () => {
    const template = synth();
    template.hasResourceProperties("AWS::Events::Rule", {
      ScheduleExpression: "cron(0 * * * ? *)",
    });
    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      Cpu: "256",
      Memory: "512",
    });
  });

  test("uses cheap dev-baseline data settings", () => {
    const template = synth();
    template.hasResourceProperties("AWS::RDS::DBInstance", {
      DBInstanceClass: "db.t4g.micro",
      AllocatedStorage: "20",
      Engine: "postgres",
      MultiAZ: false,
    });
  });

  test("health check hits /healthz", () => {
    const template = synth();
    template.hasResourceProperties(
      "AWS::ElasticLoadBalancingV2::TargetGroup",
      { HealthCheckPath: "/healthz" },
    );
  });
});
