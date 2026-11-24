# infra — AWS baseline (CDK TypeScript)

Dev baseline for the Node API: ECS Fargate + RDS Postgres behind an ALB, with
SNS-paged CloudWatch alarms. Synth-only in CI; deploys are manual.

## Layout

- `bin/app.ts` — app entry, one `Chaintelescope` stack (account/region from
  `CDK_DEFAULT_ACCOUNT`/`CDK_DEFAULT_REGION`, `WEB_ORIGIN` for CORS)
- `lib/network.ts` — 2-AZ VPC, no NAT gateway; public subnets for Fargate,
  isolated subnets for RDS
- `lib/data.ts` — Postgres 16, `db.t4g.micro`, 20 GB gp3, single-AZ, generated
  secret, 1-day backups
- `lib/api.ts` — out-of-stack ECR repo + `ApplicationLoadBalancedFargateService`
  (0.5 vCPU / 1 GB, 1 task, `/healthz` checks), PG\* secrets wiring
- `lib/jobs.ts` — scheduled Python news ingest: EventBridge hourly rule →
  run-to-complete Fargate task (0.25 vCPU / 0.5 GB), out-of-stack ECR repo
  `chaintelescope/news-job`, own log group + SG (RDS opens 5432 to it)
- `lib/observability.ts` — 9 alarms (ALB 5xx, target 5xx, ECS CPU/mem, RDS
  CPU/connections/free storage, news-job failed launch + writer crash) → one SNS topic
- `test/stack.test.ts` — synth assertions (no credentials needed)

## Gates

```bash
pnpm --filter @chaintelescope/infra typecheck
pnpm --filter @chaintelescope/infra lint
pnpm --filter @chaintelescope/infra test
pnpm --filter @chaintelescope/infra build
pnpm --filter @chaintelescope/infra exec cdk synth --strict
```

## First deploy (manual, in order)

1. `cdk bootstrap aws://ACCOUNT/REGION`
2. Create the app secrets (names must match `lib/api.ts`):
   `aws secretsmanager create-secret --name chaintelescope/app-secrets
   --secret-string '{"jwtAccessSecret":"<32+ chars>","argon2Pepper":"<64 hex>"}'`
   (strip `\r` from generated values — a stray carriage return breaks JSON
   parsing at task startup; the ECS error reads `invalid character '\r'`)
3. Pre-create the out-of-stack image repo once, then build and push; the URI
   is deterministic (`ACCOUNT.dkr.ecr.REGION.amazonaws.com/chaintelescope/api`):
   `aws ecr create-repository --repository-name chaintelescope/api`
   `docker build -f apps/api/Dockerfile -t <uri>:latest .`
   `aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com`
   `docker push <uri>:latest`
   (The repo lives outside the stack on purpose: the service needs `:latest`
   to exist before its first deploy, which an in-stack repo cannot provide.
   Builder note: the Dockerfile installs `python3/make/g++` for the argon2
   native build — the slim base image has no toolchain.)
3b. Same hand-push for the news job image (`apps/python/Dockerfile`,
   `python -m src.data.news.writer`, runs as non-root `job`):
   `aws ecr create-repository --repository-name chaintelescope/news-job`
   `docker build -f apps/python/Dockerfile -t <uri>:latest .`
   `docker push <uri>:latest`
   (Verify the schedule after deploy: `aws events list-rules
   --query 'Rules[?contains(Name,\`NewsJobSchedule\`)]'` and tail
   `/aws/ecs/news-job` in CloudWatch Logs after the hour.)
   The rule has no retry/DLQ by design (hourly cadence, idempotent rerun):
   redrive a failed run by hand with `aws ecs run-task` using the same task
   definition and subnets (see step 6 for the network flags).
4. `WEB_ORIGIN=https://<vercel-web-url> cdk deploy --strict` (diff first)
5. Subscribe to alarms: `aws sns subscribe --topic-arn <Alarms ARN>
   --protocol email --notification-endpoint you@example.com`
6. Migrations run as ECS one-off tasks — RDS sits in isolated subnets, so no
   shell reaches it directly (the old "any shell with PG* parts" line only
   works locally). Same task definition, command override, public subnets +
   the service SG so the task can reach RDS on 5432:
   `aws ecs run-task --cluster <clusterArn> --task-definition <taskDefArn>
   --launch-type FARGATE --network-configuration
   "awsvpcConfiguration={subnets=[...],securityGroups=[<serviceSg>],assignPublicIp=ENABLED}"
   --overrides '{"containerOverrides":[{"name":"web","command":["dist/db/migrate-cli.js"]}]}'`
   The container inherits the PG\* env/secrets from the task definition
   (`env-db.ts` composes `DATABASE_URL`; `resolvePgSsl` turns TLS on for
   non-loopback hosts — RDS enforces it).

## Cost (~$40/mo us-east-1, dev baseline)

Fargate 0.5/1 GB (~$18) + ALB (~$17 + LCU) + db.t4g.micro single-AZ (~$13) +
20 GB gp3 (~$2) + secret (~$0.40). No NAT gateway (~$32 saved). Single-AZ RDS
has no failover — that is the accepted dev trade-off.

## Production hardening (not this baseline)

- `removalPolicy: RETAIN`, `multiAz: true`, 7-day backups, deletion protection
- `desiredCount` + autoscaling on CPU/memory, min 2 tasks across AZs
- Redis-backed rate limiter + login throttle (per-process today)
- `cdk-nag` (`AwsSolutionsChecks`) + `cdk drift` in CI
- WAF on the ALB, Shield Advanced if DDoS is in scope
- Private subnets + NAT for Fargate once outbound allowlisting matters

## Well-Architected notes

- **Reliability:** health-checked target group, single AZ by default (documented
  above); alarms on 5xx/CPU/memory/connections/storage/news-job-failures page
  SNS; idempotent ingest (`ON CONFLICT DO NOTHING`) makes reruns safe.
- **Security:** RDS secret generated, app secrets by reference (never in the
  template), no `DATABASE_URL` string assembled at synth time, isolated DB
  subnets, least-privilege SG (Fargate → 5432 only).
- **Cost:** smallest Fargate/RDS sizes, gp3, no NAT, 1-day backups.
- **Operations:** one stack, `cdk diff` before every deploy, synth assertions
  pin the baseline shape.
- **Sustainability:** Graviton (`t4g`) for the database; Fargate Fargate-Spot
  is a one-line `capacityProviderStrategies` change when uptime allows.
