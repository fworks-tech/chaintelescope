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
- `lib/api.ts` — in-stack ECR repo + `ApplicationLoadBalancedFargateService`
  (0.5 vCPU / 1 GB, 1 task, `/healthz` checks), PG\* secrets wiring
- `lib/observability.ts` — 7 alarms (ALB 5xx, target 5xx, ECS CPU/mem, RDS
  CPU/connections/free storage) → one SNS topic
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
3. Build and push the image; the repo URI is printed by synth:
   `docker build -f apps/api/Dockerfile -t <repo>:latest .`
   `aws ecr get-login-password | docker login --username AWS --password-stdin <repo>`
   `docker push <repo>:latest`
4. `WEB_ORIGIN=https://<vercel-web-url> cdk deploy --strict` (diff first)
5. Subscribe to alarms: `aws sns subscribe --topic-arn <Alarms ARN>
   --protocol email --notification-endpoint you@example.com`
6. Migrations/seed against RDS from any shell with the PG\* parts or a full
   `DATABASE_URL` (see `apps/api/.env.example`):
   `DATABASE_URL=postgresql://... pnpm db:migrate`
   ECS one-off tasks work too — the task already injects the same PG\* parts
   that `apps/api/src/env-db.ts` composes at boot.

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
  above); alarms on 5xx/CPU/memory/connections/storage page SNS.
- **Security:** RDS secret generated, app secrets by reference (never in the
  template), no `DATABASE_URL` string assembled at synth time, isolated DB
  subnets, least-privilege SG (Fargate → 5432 only).
- **Cost:** smallest Fargate/RDS sizes, gp3, no NAT, 1-day backups.
- **Operations:** one stack, `cdk diff` before every deploy, synth assertions
  pin the baseline shape.
- **Sustainability:** Graviton (`t4g`) for the database; Fargate Fargate-Spot
  is a one-line `capacityProviderStrategies` change when uptime allows.
