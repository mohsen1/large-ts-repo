# Project Graph

Generated from TypeScript project references in `tsconfig.json` on `2026-02-25T07:05:18.559Z`.

- Projects: **423**

## Reference Tree

```text
root tsconfig.json
├─┬ app/adaptive-ops-console
│ ├─┬ data/incident-command-store
│ │ ├─┬ domain/incident-command-models
│ │ │ ├── shared/core
│ │ │ ├── shared/type-level
│ │ │ └── shared/util
│ │ └── shared/result
│ ├─┬ data/recovery-horizon-store
│ │ ├─┬ domain/recovery-horizon-engine
│ │ │ └── shared/horizon-lab-runtime
│ │ └─┬ domain/recovery-incident-lab-core
│ │   ├── domain/recovery-lab-governance
│ │   ├─┬ domain/recovery-stress-lab
│ │   │ ├── domain/analytics
│ │   │ └─┬ domain/recovery-stress-lab-intelligence
│ │   │   └── shared/stress-lab-runtime
│ │   └── shared/validation
│ ├─┬ data/recovery-readiness-store
│ │ └── domain/recovery-readiness
│ ├─┬ data/recovery-workload-store
│ │ └── domain/recovery-workload-intelligence
│ ├─┬ domain/adaptive-ops-metrics
│ │ └─┬ domain/adaptive-ops
│ │   └── shared/observability-contracts
│ ├── domain/recovery-lattice
│ ├─┬ domain/recovery-operations-control-plane
│ │ └─┬ domain/recovery-operations-models
│ │   ├── domain/recovery-incident-orchestration
│ │   └── domain/recovery-orchestration
│ ├─┬ service/adaptive-ops-orchestrator
│ │ ├─┬ data/adaptive-ops-store
│ │ │ └── data/repositories
│ │ └─┬ service/adaptive-ops-runner
│ │   └── infrastructure/incident-connectors
│ ├─┬ service/recovery-horizon-orchestrator
│ │ └─┬ infrastructure/recovery-scenario-orchestration-adapters
│ │   ├── domain/recovery-scenario-engine
│ │   └── shared/zod-adapters
│ ├─┬ service/recovery-incident-command-orchestrator
│ │ ├── domain/incident-command-core
│ │ ├─┬ platform/messaging
│ │ │ └── shared/protocol
│ │ └── platform/observability
│ ├─┬ service/recovery-incident-intent-orchestrator
│ │ └─┬ data/recovery-incident-intent-store
│ │   └── domain/recovery-incident-intent
│ ├─┬ service/recovery-lattice-orchestrator
│ │ └── data/recovery-lattice-orchestrator-store
│ ├─┬ service/recovery-readiness-orchestrator
│ │ └── domain/recovery-readiness-simulation
│ └── service/recovery-workload-orchestrator
├── app/admin-portal
├── app/api-gateway
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
│     └── domain/telemetry-models
├─┬ app/policy-console
│ ├─┬ data/policy-orchestration-store
│ │ └─┬ domain/policy-orchestration
│ │   ├── domain/contracts
│ │   └── domain/policy-engine
│ ├─┬ platform/security
│ │ └── shared/aws-adapters
│ └── service/policy-orchestration-engine
├─┬ app/recovery-chaos-lab
│ ├─┬ data/recovery-chaos-observability
│ │ └── domain/recovery-chaos-lab
│ └─┬ service/recovery-chaos-intelligence-orchestrator
│   └── service/recovery-chaos-orchestrator
├─┬ app/recovery-chronicle-console
│ ├─┬ data/recovery-chronicle-store
│ │ └── domain/recovery-chronicle-core
│ └── service/recovery-chronicle-orchestrator
├─┬ app/recovery-cockpit-ui
│ ├─┬ data/recovery-cockpit-analytics
│ │ ├─┬ data/recovery-cockpit-store
│ │ │ └── domain/recovery-cockpit-models
│ │ └─┬ domain/recovery-cockpit-intelligence
│ │   └── domain/recovery-cockpit-workloads
│ ├─┬ data/recovery-cockpit-cognitive-store
│ │ └── domain/recovery-cockpit-cognitive-core
│ ├─┬ data/recovery-cockpit-constellation-store
│ │ └── domain/recovery-cockpit-constellation-core
│ ├── data/recovery-cockpit-insights
│ ├─┬ data/recovery-cockpit-intent-store
│ │ └── domain/recovery-cockpit-orchestration-core
│ ├─┬ data/recovery-cockpit-signal-mesh-store
│ │ └── domain/recovery-cockpit-signal-mesh
│ ├─┬ domain/recovery-cockpit-synthetic-lab
│ │ └── shared/recovery-orchestration-runtime
│ ├── domain/recovery-operations-cadence
│ ├── service/recovery-cockpit-cognitive-orchestrator
│ ├── service/recovery-cockpit-constellation-orchestrator
│ ├── service/recovery-cockpit-intent-orchestrator
│ ├─┬ service/recovery-cockpit-orchestrator
│ │ └── shared/typed-orchestration-core
│ ├── service/recovery-cockpit-signal-orchestrator
│ ├─┬ shared/mesh-control-plane
│ │ └── shared/orchestration-lab-core
│ └── shared/ops-orchestration-runtime
├─┬ app/recovery-console
│ ├─┬ data/continuity-readiness-store
│ │ └── domain/recovery-continuity-readiness
│ ├─┬ data/incident-fusion-store
│ │ └── domain/incident-fusion-models
│ ├─┬ data/incident-hub
│ │ └── domain/incident-management
│ ├─┬ data/recovery-atlas-store
│ │ └── domain/recovery-operations-atlas
│ ├─┬ data/recovery-command-control-plane
│ │ └── domain/recovery-command-language
│ ├── data/recovery-operations-store
│ ├─┬ data/recovery-ops-orchestration-lab-store
│ │ └── domain/recovery-ops-orchestration-lab
│ ├─┬ data/recovery-playbook-store
│ │ └── domain/recovery-playbooks
│ ├─┬ data/recovery-simulation-metrics
│ │ └── domain/recovery-simulation-planning
│ ├─┬ data/recovery-simulation-store
│ │ └── domain/recovery-simulation-core
│ ├── data/recovery-stress-lab-orchestration-store
│ ├─┬ data/recovery-synthetic-orchestration-store
│ │ └── domain/recovery-synthetic-orchestration
│ ├─┬ data/recovery-temporal-store
│ │ └─┬ domain/recovery-temporal-orchestration
│ │   └── shared/temporal-ops-runtime
│ ├─┬ domain/recovery-automation-orchestrator
│ │ └── shared/automation-orchestration-runtime
│ ├── domain/recovery-command-forge
│ ├── domain/recovery-command-orchestration
│ ├── domain/recovery-command-studio
│ ├── domain/recovery-continuity-lab-core
│ ├── domain/recovery-drill
│ ├── domain/recovery-fabric-models
│ ├── domain/recovery-fusion-intelligence
│ ├─┬ domain/recovery-incident-graph
│ │ └── domain/risk
│ ├─┬ domain/recovery-incident-saga
│ │ └── shared/incident-saga-core
│ ├── domain/recovery-lab-orchestration-core
│ ├── domain/recovery-lab-stress-lab-core
│ ├── domain/recovery-ops-playbook
│ ├─┬ domain/recovery-orchestration-design
│ │ ├── shared/orchestration-kernel
│ │ └── shared/recovery-lab-kernel
│ ├── domain/recovery-orchestration-planning
│ ├── domain/recovery-scenario-orchestration
│ ├── domain/recovery-simulation-lab-models
│ ├── service/continuity-readiness-orchestrator
│ ├── service/incident-fusion-orchestrator
│ ├─┬ service/incident-orchestration
│ │ └── infrastructure/incident-notifications
│ ├─┬ service/recovery-cadence-coordinator
│ │ └─┬ data/recovery-cadence-event-store
│ │   └── domain/recovery-cadence-orchestration
│ ├─┬ service/recovery-command-control-hub
│ │ └── domain/recovery-command-control-hub
│ ├── service/recovery-command-forge-orchestrator
│ ├── service/recovery-command-intelligence-orchestrator
│ ├─┬ service/recovery-command-surface-orchestrator
│ │ └─┬ data/recovery-command-surface-store
│ │   └── domain/recovery-command-surface-models
│ ├─┬ service/recovery-continuity-lens
│ │ └─┬ data/continuity-lens-store
│ │   └── domain/continuity-lens
│ ├─┬ service/recovery-drill-orchestrator
│ │ └── data/recovery-drill-store
│ ├─┬ service/recovery-fabric-cadence-orchestrator
│ │ └── domain/recovery-fabric-cadence-core
│ ├─┬ service/recovery-fabric-controller
│ │ └── domain/recovery-fabric-orchestration
│ ├─┬ service/recovery-fabric-orchestrator
│ │ └─┬ data/recovery-ops-fabric-store
│ │   └── domain/recovery-ops-fabric
│ ├─┬ service/recovery-fusion-lab-orchestrator
│ │ └── domain/recovery-fusion-lab-core
│ ├─┬ service/recovery-fusion-orchestrator
│ │ ├── data/recovery-command-graph-store
│ │ ├─┬ infrastructure/recovery-operations-intelligence-adapters
│ │ │ └─┬ data/recovery-operations-intelligence-store
│ │ │   └─┬ domain/recovery-operations-intelligence
│ │ │     └── domain/recovery-operations-governance
│ │ └── infrastructure/recovery-operations-queue
│ ├── service/recovery-incident-graph-engine
│ ├── service/recovery-incident-saga-orchestrator
│ ├─┬ service/recovery-operations-engine
│ │ ├── data/recovery-operations-analytics
│ │ ├── data/recovery-operations-control-plane-store
│ │ ├── data/recovery-operations-governance-store
│ │ ├── infrastructure/recovery-operations-cadence-bridge
│ │ ├── infrastructure/recovery-operations-compliance
│ │ └─┬ service/recovery-operations-intelligence-orchestrator
│ │   └── service/recovery-operations-policy-engine
│ ├─┬ service/recovery-ops-graph-orchestrator
│ │ └── domain/recovery-ops-orchestration-graph
│ ├─┬ service/recovery-ops-orchestration-engine
│ │ └─┬ data/recovery-ops-orchestration-store
│ │   └── domain/recovery-ops-orchestration-surface
│ ├── service/recovery-ops-playbook-orchestrator
│ ├── service/recovery-orchestration-atlas
│ ├── service/recovery-orchestration-studio-engine
│ ├── service/recovery-playbook-engine
│ ├─┬ service/recovery-playbook-lab-orchestrator
│ │ └── domain/recovery-playbook-lab
│ ├─┬ service/recovery-playbook-orchestrator
│ │ └─┬ data/recovery-playbook-orchestration-store
│ │   └── domain/recovery-playbook-orchestration
│ ├─┬ service/recovery-runner
│ │ ├── data/recovery-artifacts
│ │ ├── data/recovery-incident-store
│ │ ├── data/recovery-observability
│ │ ├─┬ data/recovery-plan-store
│ │ │ └─┬ domain/recovery-plan
│ │ │   └── domain/recovery-policy
│ │ ├── data/recovery-policy-store
│ │ ├─┬ data/recovery-risk-store
│ │ │ └── domain/recovery-risk-models
│ │ ├─┬ data/recovery-workflow-store
│ │ │ └── domain/recovery-incident-workflows
│ │ ├── infrastructure/recovery-notifications
│ │ └─┬ service/recovery-coordination-orchestrator
│ │   ├─┬ data/recovery-coordination-store
│ │   │ └── domain/recovery-coordination
│ │   ├── infrastructure/recovery-coordination-notifier
│ │   └─┬ service/recovery-plan-orchestrator
│ │     ├── service/recovery-policy-engine
│ │     └─┬ service/recovery-risk-engine
│ │       ├── domain/recovery-risk-strategy
│ │       └─┬ service/recovery-risk-orchestrator
│ │         └── infrastructure/recovery-risk-connectors
│ ├─┬ service/recovery-scenario-orchestrator
│ │ ├─┬ data/recovery-scenario-store
│ │ │ ├─┬ data/recovery-intelligence-store
│ │ │ │ └── domain/recovery-intelligence
│ │ │ └── domain/recovery-scenario-planner
│ │ ├── infrastructure/recovery-scenario-notifier
│ │ └─┬ platform/logging
│ │   └── shared/errors
│ ├─┬ service/recovery-signal-intelligence-orchestrator
│ │ ├─┬ data/recovery-signal-intelligence-store
│ │ │ └── domain/recovery-signal-intelligence
│ │ └─┬ data/recovery-signal-orchestration-store
│ │   └── domain/recovery-signal-orchestration-models
│ ├── service/recovery-simulation-orchestrator
│ ├─┬ service/recovery-stress-lab-orchestrator
│ │ └── data/recovery-incident-lab-store
│ ├── service/recovery-synthetic-orchestrator
│ ├── service/recovery-temporal-orchestrator
│ └── shared/orchestration-runtime
├─┬ app/recovery-drill-observer
│ ├─┬ data/recovery-drill-lab-store
│ │ └── domain/recovery-drill-lab
│ ├── service/recovery-drill-lab-orchestrator
│ ├─┬ service/recovery-drill-observability
│ │ ├─┬ data/recovery-drill-metrics
│ │ │ └── domain/recovery-drill-telemetry
│ │ └── infrastructure/recovery-drill-archive
│ └── service/recovery-drill-surface-orchestrator
├─┬ app/recovery-incident-dashboard
│ ├─┬ data/incident-signal-store
│ │ └── domain/incident-signal-intelligence
│ ├─┬ data/recovery-situational-store
│ │ └── domain/recovery-situational-intelligence
│ ├─┬ data/recovery-stability-store
│ │ └── domain/recovery-stability-models
│ ├── data/recovery-strategy-store
│ ├── domain/recovery-command-network
│ ├── domain/recovery-horizon-studio-core
│ ├── domain/recovery-incident-analytics
│ ├── domain/recovery-lab-console-core
│ ├─┬ domain/recovery-scenario-lens
│ │ └── data/query-models
│ ├── infrastructure/recovery-scenario-gateway
│ ├─┬ service/recovery-chaos-lab-console-orchestrator
│ │ └── shared/chaos-lab-console-kernel
│ ├── service/recovery-command-orchestrator
│ ├─┬ service/recovery-incident-analytics-orchestrator
│ │ └── service/recovery-incident-orchestrator
│ ├── service/recovery-incident-scenario-orchestrator
│ ├─┬ service/recovery-intent-graph-orchestrator
│ │ └── domain/recovery-intent-graph
│ ├── service/recovery-situational-orchestrator
│ ├── service/recovery-stability-orchestrator
│ ├── service/recovery-strategy-orchestrator
│ ├── service/recovery-synthesis-orchestrator
│ └── service/recovery-workflow-orchestrator
├─┬ app/recovery-incident-lab-console
│ ├── domain/recovery-lab-adaptive-orchestration
│ ├── domain/recovery-lab-console-runtime
│ ├── domain/recovery-lab-intelligence-core
│ └── service/recovery-incident-lab-orchestrator
├─┬ app/recovery-lab-dashboard
│ ├─┬ data/recovery-lab-digital-twin-store
│ │ └─┬ domain/recovery-lab-signal-studio
│ │   └── shared/lab-simulation-kernel
│ ├─┬ data/recovery-lab-simulation-store
│ │ └── domain/recovery-simulation-lab-core
│ ├─┬ domain/recovery-lab-synthetic-orchestration
│ │ └── shared/lab-graph-runtime
│ ├── service/recovery-lab-graph-orchestrator
│ ├── service/recovery-lab-orchestration-studio
│ └── service/recovery-lab-orchestrator
├─┬ app/recovery-mesh-console
│ ├── domain/recovery-ops-mesh
│ └── service/recovery-ops-mesh-engine
├── app/recovery-playbook-orchestrator
├─┬ app/recovery-timeline-studio
│ ├─┬ data/recovery-ops-playbook-studio-store
│ │ └── domain/recovery-ops-playbook-studio
│ ├─┬ data/recovery-timeline-store
│ │ └── domain/recovery-timeline
│ ├─┬ domain/recovery-timeline-orchestration
│ │ └── shared/timeline-orchestration-runtime
│ ├── service/recovery-ops-playbook-studio-orchestrator
│ └── service/recovery-timeline-orchestrator
├─┬ app/reporter
│ ├── domain/reporting
│ └── service/reporting
├─┬ app/stream-dashboard
│ ├── data/recovery-lattice-store
│ ├─┬ data/streaming-command-intelligence-store
│ │ └─┬ domain/streaming-command-intelligence
│ │   ├── domain/streaming-engine
│ │   └── domain/streaming-observability
│ ├── data/streaming-dashboard-store
│ └─┬ service/streaming-command-intelligence-orchestrator
│   └─┬ service/streaming-dashboard-orchestrator
│     └── service/streaming-control
├── app/worker
├── data/adapters
├─┬ data/continuity-journal
│ └── domain/continuity-orchestration
├── data/decision-catalog
├─┬ data/failover-plans
│ └── domain/failover-orchestration
├─┬ data/failure-intelligence-store
│ └── domain/failure-intelligence
├─┬ data/fulfillment-telemetry-store
│ ├─┬ domain/fulfillment-orchestration
│ │ ├── domain/billing
│ │ ├── domain/inventory
│ │ ├── domain/orders
│ │ └── domain/pricing
│ └─┬ domain/fulfillment-orchestration-analytics
│   └── domain/fulfillment
├── data/lineage
├─┬ data/operations-control-store
│ └── domain/operations-control
├─┬ data/recovery-continuity-plan-store
│ └── domain/recovery-continuity-planning
├─┬ data/recovery-incident-insights-store
│ └── domain/recovery-incident-insights
├── data/warehouse
├── domain/billing-ledger
├── domain/catalog
├── domain/compliance
├── domain/decision-orchestration
├── domain/enterprise-facts
├── domain/feature-flags
├── domain/identity
├── domain/identity-verification
├── domain/nebula-grid
├── domain/nebula-grid-a
├── domain/nebula-grid-b
├── domain/nebula-grid-c
├── domain/nebula-grid-d
├── domain/nebula-orchestration
├── domain/notification
├── domain/observability-core
├── domain/operations-orchestration
├── domain/search-suite
├── domain/temporal
├── domain/workflow
├── infrastructure/aws-ops
├── infrastructure/recovery-continuity-adapters
├── infrastructure/recovery-incident-notifier
├── infrastructure/transformers
├── platform/config
├── platform/http
├── platform/ingress
├── platform/integrations
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
├─┬ service/fulfillment-intelligence-orchestrator
│ └─┬ service/fulfillment-planner
│   └── data/fulfillment-hub
├── service/ingestion
├─┬ service/operations
│ └── service/quality
├── service/orchestrations
├── service/orchestrators
├── service/recommendation
├── service/recovery-continuity-orchestrator
├── service/recovery-incident-insight-orchestrator
├── service/recovery-intelligence-orchestrator
├── service/recovery-operations-observability
├── service/reputation
├── service/workflow
├── shared/codec
└── shared/monads
```
