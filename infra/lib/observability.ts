import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import { Duration, type Stack } from "aws-cdk-lib";
import {
  HttpCodeElb,
  HttpCodeTarget,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import type { ApiOutput } from "./api.js";
import type { DataOutput } from "./data.js";

/**
 * One SNS topic; every alarm pages it. Subscribe an operator e-mail after
 * the first deploy (`aws sns subscribe`). Thresholds are dev-baseline
 * guesses — tune from a week of traffic before calling them SLOs.
 */
export function buildObservability(
  stack: Stack,
  api: ApiOutput,
  data: DataOutput,
): void {
  const topic = new sns.Topic(stack, "Alarms", {
    displayName: "chaintelescope-alarms",
  });
  const alarmAction = new actions.SnsAction(topic);
  const period = Duration.minutes(5);

  const alarms: cloudwatch.Alarm[] = [
    new cloudwatch.Alarm(stack, "Alb5xx", {
      metric: api.service.loadBalancer.metricHttpCodeElb(
        HttpCodeElb.ELB_5XX_COUNT,
        { period, statistic: "Sum" },
      ),
      threshold: 1,
      evaluationPeriods: 1,
    }),
    new cloudwatch.Alarm(stack, "Target5xx", {
      metric: api.service.targetGroup.metricHttpCodeTarget(
        HttpCodeTarget.TARGET_5XX_COUNT,
        { period, statistic: "Sum" },
      ),
      threshold: 1,
      evaluationPeriods: 1,
    }),
    new cloudwatch.Alarm(stack, "EcsCpu", {
      metric: api.service.service.metricCpuUtilization({ period }),
      threshold: 80,
      evaluationPeriods: 2,
    }),
    new cloudwatch.Alarm(stack, "EcsMemory", {
      metric: api.service.service.metricMemoryUtilization({ period }),
      threshold: 80,
      evaluationPeriods: 2,
    }),
    new cloudwatch.Alarm(stack, "RdsCpu", {
      metric: data.db.metricCPUUtilization({ period }),
      threshold: 80,
      evaluationPeriods: 2,
    }),
    new cloudwatch.Alarm(stack, "RdsConnections", {
      metric: data.db.metricDatabaseConnections({ period }),
      threshold: 80,
      evaluationPeriods: 2,
    }),
    new cloudwatch.Alarm(stack, "RdsStorage", {
      metric: data.db.metricFreeStorageSpace({ period }),
      threshold: 2_000_000_000,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
    }),
  ];

  for (const alarm of alarms) {
    alarm.addAlarmAction(alarmAction);
  }
}
