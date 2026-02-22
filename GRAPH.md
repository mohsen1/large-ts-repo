# Project Graph

Generated from TypeScript project references in `tsconfig.json` on `2026-02-22T18:05:45.369Z`.

- Projects: **192**

## Reference Tree

```text
root tsconfig.json
├─┬ app/adaptive-ops-console
│ └─┬ service/adaptive-ops-runner
│   ├─┬ data/adaptive-ops-store
│   │ ├── data/repositories
│   │ └─┬ domain/adaptive-ops
│   │   ├── shared/core
│   │   ├─┬ shared/observability-contracts
│   │   │ └── shared/result
│   │   └── shared/type-level
│   ├── infrastructure/incident-connectors
│   └── shared/util
├─┬ app/admin-portal
│ └── shared/protocol
├─┬ app/api-gateway
│ └── platform/messaging
├── app/cli
├─┬ app/fuzzy-console
│ └─┬ service/fuzzy-router
│   └── domain/fuzzy
├─┬ app/incident-forecast-operator
│ ├─┬ data/incident-forecast-store
│ │ └── domain/incident-forecasting
│ └─┬ service/incident-forecast-engine
│   └── infrastructure/incident-forecasting-connectors
├─┬ app/insights
│ ├── domain/knowledge-graph
│ ├── service/graph-intelligence
│ └─┬ service/telemetry
│   └─┬ data/telemetry-store
│     └─┬ domain/telemetry-models
│       └── shared/validation
├─┬ app/policy-console
│ ├── domain/policy-engine
│ └─┬ platform/security
│   └── shared/aws-adapters
├─┬ app/recovery-console
│ ├── domain/recovery-orchestration
│ └─┬ service/recovery-runner
│   ├── data/recovery-artifacts
│   ├── data/recovery-observability
│   ├─┬ data/recovery-plan-store
│   │ └─┬ domain/recovery-plan
│   │   └── domain/recovery-policy
│   ├── data/recovery-policy-store
│   ├─┬ data/recovery-risk-store
│   │ └── domain/recovery-risk-models
│   ├── infrastructure/recovery-notifications
│   └─┬ service/recovery-coordination-orchestrator
│     ├─┬ data/recovery-coordination-store
│     │ └── domain/recovery-coordination
│     ├── infrastructure/recovery-coordination-notifier
│     └─┬ service/recovery-plan-orchestrator
│       ├── service/recovery-policy-engine
│       └─┬ service/recovery-risk-engine
│         ├── domain/recovery-risk-strategy
│         └─┬ service/recovery-risk-orchestrator
│           └── infrastructure/recovery-risk-connectors
├─┬ app/recovery-drill-observer
│ └─┬ service/recovery-drill-observability
│   ├─┬ data/recovery-drill-metrics
│   │ └── domain/recovery-drill-telemetry
│   └── infrastructure/recovery-drill-archive
├─┬ app/recovery-playbook-orchestrator
│ ├─┬ data/recovery-playbook-store
│ │ └── domain/recovery-playbooks
│ └── service/recovery-playbook-engine
├─┬ app/reporter
│ ├── domain/reporting
│ └── service/reporting
├─┬ app/stream-dashboard
│ └── domain/streaming-engine
├── app/worker
├── data/adapters
├─┬ data/continuity-journal
│ └── domain/continuity-orchestration
├── data/decision-catalog
├─┬ data/failover-plans
│ └── domain/failover-orchestration
├─┬ data/failure-intelligence-store
│ └─┬ domain/failure-intelligence
│   └── domain/incident-management
├── data/incident-hub
├── data/lineage
├─┬ data/operations-control-store
│ ├── data/query-models
│ └── domain/operations-control
├─┬ data/recovery-continuity-plan-store
│ └── domain/recovery-continuity-planning
├─┬ data/recovery-drill-store
│ └── domain/recovery-drill
├─┬ data/recovery-incident-insights-store
│ └── domain/recovery-incident-insights
├─┬ data/recovery-intelligence-store
│ └── domain/recovery-intelligence
├─┬ data/recovery-operations-analytics
│ └─┬ data/recovery-operations-intelligence-store
│   ├─┬ data/recovery-operations-store
│   │ └─┬ domain/recovery-operations-models
│   │   └── domain/recovery-readiness
│   └─┬ domain/recovery-operations-intelligence
│     └── domain/recovery-operations-governance
├─┬ data/recovery-operations-control-plane-store
│ └── domain/recovery-operations-control-plane
├── data/recovery-operations-governance-store
├── data/recovery-readiness-store
├─┬ data/recovery-scenario-store
│ └── domain/recovery-scenario-engine
├── data/warehouse
├── domain/analytics
├── domain/billing
├── domain/billing-ledger
├── domain/catalog
├── domain/compliance
├── domain/contracts
├─┬ domain/decision-orchestration
│ └── domain/risk
├── domain/enterprise-facts
├── domain/feature-flags
├── domain/fulfillment
├── domain/identity
├── domain/identity-verification
├── domain/inventory
├── domain/nebula-grid
├── domain/nebula-grid-a
├── domain/nebula-grid-b
├── domain/nebula-grid-c
├── domain/nebula-grid-d
├── domain/nebula-orchestration
├── domain/notification
├── domain/observability-core
├── domain/operations-orchestration
├── domain/orders
├── domain/pricing
├── domain/recovery-operations-cadence
├── domain/recovery-scenario-planner
├── domain/search-suite
├── domain/temporal
├── domain/workflow
├── infrastructure/aws-ops
├── infrastructure/incident-notifications
├── infrastructure/recovery-continuity-adapters
├── infrastructure/recovery-incident-notifier
├── infrastructure/recovery-operations-cadence-bridge
├── infrastructure/recovery-operations-compliance
├── infrastructure/recovery-operations-intelligence-adapters
├── infrastructure/recovery-operations-queue
├── infrastructure/recovery-scenario-notifier
├─┬ infrastructure/recovery-scenario-orchestration-adapters
│ └── shared/zod-adapters
├── infrastructure/transformers
├── platform/config
├── platform/http
├── platform/ingress
├── platform/integrations
├─┬ platform/logging
│ └── shared/errors
├── platform/observability
├── platform/policy
├── platform/queue
├── platform/storage
├── service/analytics
├── service/checkout
├── service/continuity-runtime
├─┬ service/decision-mesh
│ └── service/decision-runtime
├── service/execution-engine
├── service/failover-runtime
├── service/failure-intelligence-runner
├── service/finance
├── service/incident-orchestration
├── service/ingestion
├─┬ service/operations
│ └── service/quality
├── service/orchestrations
├── service/orchestrators
├── service/recommendation
├── service/recovery-continuity-orchestrator
├── service/recovery-drill-orchestrator
├── service/recovery-incident-insight-orchestrator
├── service/recovery-intelligence-orchestrator
├─┬ service/recovery-operations-engine
│ └─┬ service/recovery-operations-intelligence-orchestrator
│   └── service/recovery-operations-policy-engine
├── service/recovery-operations-observability
├── service/recovery-readiness-orchestrator
├── service/recovery-scenario-orchestrator
├── service/reputation
├── service/streaming-control
├── service/workflow
├── shared/codec
└── shared/monads
```
