# AWS Deployment Baseline (Wave-2)

## Objective
Define an AWS-first deployment baseline so the platform can scale from day-1 scaffolding
to production-ready global broker operations without major architecture rewrites.

## Target Runtime Baseline
- **Kubernetes**: EKS cluster for backend and web workloads.
- **Database**: Amazon RDS PostgreSQL (Multi-AZ in production).
- **Cache**: Amazon ElastiCache Redis for caching and realtime coordination.
- **Messaging**: Amazon MSK/Kafka for asynchronous domain events.
- **Object storage**: S3 for static artifacts, reports, and operational exports.
- **Secrets**: AWS Secrets Manager / SSM Parameter Store.
- **Observability**: CloudWatch + Prometheus/Grafana-compatible exporters.

## Environment Tiers
- **dev**: single AZ, low-cost instances, reduced retention.
- **staging**: production-like topology with lower scale.
- **prod**: Multi-AZ, autoscaling enabled, strict backup and retention.

## Baseline Terraform Layout
- `infra/aws/terraform/main.tf` orchestrates module composition.
- `infra/aws/terraform/modules/vpc` network boundaries.
- `infra/aws/terraform/modules/eks` compute and node groups.
- `infra/aws/terraform/modules/rds` PostgreSQL baseline.
- `infra/aws/terraform/modules/redis` Redis baseline.
- `infra/aws/terraform/modules/kafka` Kafka/MSK baseline.

## Baseline Helm Layout
- `deploy/helm/backend` chart skeleton for backend service.
- `deploy/helm/web` chart skeleton for frontend surfaces.

## Hardening Backlog
- Add IAM roles for service accounts (IRSA).
- Add WAF + API edge ingress controls.
- Add blue/green rollout strategy.
- Add disaster recovery runbook and regional failover strategy.
