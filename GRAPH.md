# Project Graph

Generated from TypeScript project references in `tsconfig.json` on `2026-03-08T14:32:15.504Z`.

- Projects: **615**

## Reference Tree

```text
root tsconfig.json
├─┬ app/adaptive-ops-console
│ ├─┬ data/incident-command-store
│ │ └─┬ domain/incident-command-models
│ │   ├── shared/core
│ │   └─┬ shared/type-level
│ │     ├── shared/result
│ │     └─┬ shared/type-level-fabric
│ │       └── shared/util
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
│ ├── domain/recovery-horizon-observability
│ ├─┬ domain/recovery-lab-stress-lab-core
│ │ ├─┬ domain/recovery-lab-synthetic-orchestration
│ │ │ ├── shared/lab-graph-runtime
│ │ │ └─┬ shared/type-level-hub
│ │ │   └── shared/type-level-composition
│ │ └── shared/orchestration-lab-core
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
│ ├─┬ service/recovery-horizon-observability-orchestrator
│ │ └─┬ service/recovery-horizon-orchestrator
│ │   └─┬ infrastructure/recovery-scenario-orchestration-adapters
│ │     ├── domain/recovery-scenario-engine
│ │     └── shared/zod-adapters
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
├─┬ app/chain0-0-data-flow-g12
│ ├─┬ service/chain0-0-cache-hub-g10
│ │ ├─┬ data/chain0-0-compute-hub-g6
│ │ │ ├─┬ domain/chain0-0-compute-bridge-g4
│ │ │ │ ├── shared/chain0-0-compute-flow-g1
│ │ │ │ ├── shared/chain0-0-edge-nexus-g2
│ │ │ │ └── shared/timeline-orchestration-runtime
│ │ │ ├─┬ domain/chain0-0-index-flow-g3
│ │ │ │ └── shared/codec
│ │ │ ├─┬ domain/fulfillment-orchestration-analytics
│ │ │ │ ├── domain/fulfillment
│ │ │ │ └─┬ domain/fulfillment-orchestration
│ │ │ │   ├── domain/billing
│ │ │ │   ├── domain/inventory
│ │ │ │   ├── domain/orders
│ │ │ │   └── domain/pricing
│ │ │ └─┬ domain/recovery-workbench-models
│ │ │   └── shared/recovery-workbench-runtime
│ │ ├─┬ data/chain0-0-event-fabric-g7
│ │ │ ├── domain/recovery-intelligence
│ │ │ └── domain/recovery-lab-console-runtime
│ │ ├─┬ data/recovery-cockpit-signal-mesh-store
│ │ │ └── domain/recovery-cockpit-signal-mesh
│ │ └─┬ data/recovery-operations-governance-store
│ │   ├── data/recovery-operations-store
│ │   └── domain/recovery-operations-governance
│ ├─┬ service/chain0-0-route-mesh-g9
│ │ ├─┬ data/recovery-risk-store
│ │ │ ├── domain/recovery-policy
│ │ │ └── domain/recovery-risk-models
│ │ └─┬ data/recovery-signal-intelligence-store
│ │   └── domain/recovery-signal-intelligence
│ └─┬ service/fault-intel-orchestrator
│   └─┬ data/fault-intel-store
│     └─┬ domain/fault-intel-orchestration
│       └── shared/fault-intel-runtime
├─┬ app/chain0-0-data-nexus-g14
│ ├─┬ service/recovery-ops-orchestration-engine
│ │ ├─┬ data/recovery-ops-orchestration-lab-store
│ │ │ └─┬ domain/recovery-ops-orchestration-lab
│ │ │   └── shared/typed-orchestration-core
│ │ └─┬ data/recovery-ops-orchestration-store
│ │   └── domain/recovery-ops-orchestration-surface
│ └─┬ service/recovery-synthesis-orchestrator
│   ├── data/query-models
│   └─┬ domain/recovery-scenario-lens
│     └── shared/recovery-synthesis-runtime
├─┬ app/chain0-0-state-flow-g13
│ ├─┬ service/execution-engine
│ │ └── domain/knowledge-graph
│ └─┬ service/recovery-incident-scenario-orchestrator
│   ├── domain/recovery-scenario-orchestration
│   └── infrastructure/recovery-scenario-gateway
├─┬ app/chain0-1-cache-fabric-g28
│ ├─┬ service/chain0-1-queue-bridge-g24
│ │ ├─┬ data/chain0-1-signal-lens-g21
│ │ │ ├─┬ domain/chain0-1-compute-fabric-g18
│ │ │ │ ├── shared/chain0-1-policy-engine-g15
│ │ │ │ ├── shared/chain0-1-queue-flow-g16
│ │ │ │ └── shared/cockpit-studio-core
│ │ │ └─┬ domain/chain0-1-stream-bridge-g17
│ │ │   ├── shared/mesh-control-plane
│ │ │   └── shared/recovery-ops-runtime
│ │ ├── data/chain0-1-state-flow-g20
│ │ ├─┬ data/recovery-playbook-store
│ │ │ └── domain/recovery-playbooks
│ │ └─┬ data/recovery-temporal-store
│ │   └─┬ domain/recovery-temporal-orchestration
│ │     └── shared/temporal-ops-runtime
│ ├─┬ service/chain0-1-queue-mesh-g23
│ │ └─┬ data/recovery-lab-digital-twin-store
│ │   └─┬ domain/recovery-lab-signal-studio
│ │     └── shared/lab-simulation-kernel
│ ├─┬ service/checkout
│ │ └── shared/errors
│ └── service/quality
├── app/chain0-1-model-nexus-g27
├─┬ app/chain0-1-signal-nexus-g26
│ ├── service/finance
│ └─┬ service/fuzzy-router
│   └── domain/fuzzy
├─┬ app/chain0-2-data-core-g42
│ ├─┬ service/chain0-2-model-flow-g37
│ │ ├─┬ data/chain0-2-queue-nexus-g34
│ │ │ ├── domain/billing-ledger
│ │ │ ├─┬ domain/chain0-2-compute-hub-g32
│ │ │ │ ├── shared/chain0-2-rule-fabric-g29
│ │ │ │ ├── shared/chain0-2-stream-core-g30
│ │ │ │ └── shared/recovery-intent-graph-runtime
│ │ │ ├─┬ domain/chain0-2-event-hub-g31
│ │ │ │ └── shared/quantum-studio-core
│ │ │ └─┬ domain/streaming-observability
│ │ │   └── domain/streaming-engine
│ │ ├─┬ data/chain0-2-rule-mesh-g35
│ │ │ ├── domain/nebula-hyper
│ │ │ └─┬ domain/recovery-lab-intelligence-core
│ │ │   └─┬ domain/recovery-lab-adaptive-orchestration
│ │ │     └─┬ domain/recovery-lab-console-core
│ │ │       └── domain/recovery-lab-orchestration-core
│ │ └── data/recovery-incident-store
│ ├─┬ service/chain0-2-policy-bridge-g38
│ │ ├─┬ data/recovery-lab-simulation-store
│ │ │ └─┬ domain/recovery-simulation-lab-core
│ │ │   └── shared/recovery-lab-kernel
│ │ └─┬ data/recovery-quantum-store
│ │   └─┬ domain/recovery-quantum-orchestration
│ │     └── shared/recovery-quantum-runtime
│ ├─┬ service/recovery-policy-engine
│ │ └── data/recovery-policy-store
│ └── service/recovery-temporal-orchestrator
├─┬ app/chain0-2-model-core-g41
│ ├── service/analytics
│ └── service/recovery-lab-orchestrator
├─┬ app/chain0-2-route-flow-g40
│ └─┬ service/incident-fusion-orchestrator
│   └─┬ data/incident-fusion-store
│     └── domain/incident-fusion-models
├─┬ app/chain0-3-edge-hub-g55
│ ├─┬ service/chain0-3-compute-lens-g51
│ │ ├─┬ data/chain0-3-queue-engine-g48
│ │ │ ├─┬ domain/chain0-3-event-core-g45
│ │ │ │ └─┬ shared/chain0-3-data-hub-g44
│ │ │ │   └── shared/chain0-3-stream-lens-g43
│ │ │ ├─┬ domain/chain0-3-policy-fabric-g46
│ │ │ │ ├── shared/cascade-orchestration-kernel
│ │ │ │ └── shared/incident-saga-core
│ │ │ ├── domain/notification
│ │ │ └─┬ domain/recovery-fabric-orchestration
│ │ │   └── domain/incident-management
│ │ └─┬ data/chain0-3-stream-lens-g49
│ │   └── domain/recovery-lab-console-labs
│ ├─┬ service/chain0-3-queue-fabric-g52
│ │ ├─┬ data/recovery-ecosystem-analytics-store
│ │ │ └── domain/recovery-ecosystem-analytics
│ │ └─┬ data/recovery-timeline-store
│ │   └── domain/recovery-timeline
│ ├─┬ service/recovery-fabric-controller
│ │ ├── domain/recovery-fabric-models
│ │ └── domain/recovery-fusion-intelligence
│ └── service/recovery-lab-orchestration-studio
├─┬ app/chain0-3-model-bridge-g54
│ ├─┬ service/fulfillment-intelligence-orchestrator
│ │ ├── data/fulfillment-telemetry-store
│ │ └─┬ service/fulfillment-planner
│ │   ├─┬ data/fulfillment-hub
│ │   │ └── shared/aws-adapters
│ │   └── platform/http
│ └─┬ service/recovery-playbook-automation-engine
│   ├─┬ data/recovery-playbook-automation-store
│   │ └── domain/recovery-playbook-orchestration-core
│   └── service/recovery-playbook-engine
├─┬ app/chain1-0-compute-bridge-g1014
│ ├─┬ service/chain1-0-queue-mesh-g1009
│ │ ├─┬ data/chain0-2-schema-fabric-g36
│ │ │ └── domain/recovery-command-studio
│ │ ├─┬ data/chain1-0-metric-core-g1006
│ │ │ ├─┬ domain/chain1-0-data-flow-g1003
│ │ │ │ └─┬ shared/chain1-0-data-lens-g1002
│ │ │ │   └── shared/chain1-0-stream-mesh-g1001
│ │ │ ├─┬ domain/chain1-0-stream-lens-g1004
│ │ │ │ └── shared/automation-orchestration-runtime
│ │ │ └── domain/nebula-grid-a
│ │ └─┬ data/chain1-0-signal-engine-g1007
│ │   ├── domain/recovery-coordination
│ │   └── domain/recovery-playbook-lab
│ ├─┬ service/chain1-0-route-hub-g1010
│ │ └─┬ data/recovery-autonomy-experiment-store
│ │   └── domain/recovery-autonomy-experiment
│ └─┬ service/recovery-runner
│   ├── data/recovery-artifacts
│   ├── data/recovery-observability
│   ├─┬ data/recovery-plan-store
│   │ └── domain/recovery-plan
│   ├─┬ data/recovery-simulation-metrics
│   │ └── domain/recovery-simulation-planning
│   ├─┬ data/recovery-workflow-store
│   │ └── domain/recovery-incident-workflows
│   ├── infrastructure/recovery-notifications
│   └─┬ service/recovery-coordination-orchestrator
│     ├── data/recovery-coordination-store
│     ├── infrastructure/recovery-coordination-notifier
│     └─┬ service/recovery-plan-orchestrator
│       └─┬ service/recovery-risk-engine
│         ├── domain/recovery-risk-strategy
│         └─┬ service/recovery-risk-orchestrator
│           └── infrastructure/recovery-risk-connectors
├─┬ app/chain1-0-rule-hub-g1012
│ └─┬ service/recovery-cockpit-intent-orchestrator
│   └─┬ data/recovery-cockpit-intent-store
│     ├── domain/recovery-cockpit-models
│     └── domain/recovery-cockpit-orchestration-core
├─┬ app/chain1-0-schema-core-g1013
│ └─┬ service/recovery-simulation-orchestrator
│   ├─┬ data/recovery-simulation-store
│   │ └── domain/recovery-simulation-core
│   └── domain/recovery-simulation-lab-models
├─┬ app/chain1-1-compute-nexus-g1027
│ ├─┬ service/chain1-1-data-nexus-g1023
│ │ ├─┬ data/chain1-1-route-core-g1021
│ │ │ ├─┬ domain/chain1-1-metric-pulse-g1018
│ │ │ │ └─┬ shared/chain1-1-metric-nexus-g1016
│ │ │ │   └── shared/chain1-1-policy-engine-g1015
│ │ │ └─┬ domain/chain1-1-state-engine-g1017
│ │ │   └── shared/chaos-lab-console-kernel
│ │ ├─┬ data/chain1-1-schema-nexus-g1020
│ │ │ └─┬ domain/chain0-1-trace-nexus-g19
│ │ │   └── shared/orchestration-runtime
│ │ └─┬ data/recovery-ops-mesh-observability-store
│ │   └── domain/recovery-ops-mesh
│ ├── service/chain1-1-graph-hub-g1024
│ └─┬ service/recovery-fabric-orchestrator
│   └─┬ data/recovery-ops-fabric-store
│     └── domain/recovery-ops-fabric
├─┬ app/chain1-1-event-engine-g1028
│ ├─┬ service/failover-runtime
│ │ └─┬ data/failover-plans
│ │   └── domain/failover-orchestration
│ └─┬ service/recovery-cadence-coordinator
│   └─┬ data/recovery-cadence-event-store
│     └── domain/recovery-cadence-orchestration
├─┬ app/chain1-1-metric-pulse-g1026
│ └─┬ service/reputation
│   └── domain/risk
├─┬ app/chain1-2-compute-pulse-g1042
│ ├─┬ service/chain1-2-graph-flow-g1038
│ │ ├─┬ data/chain1-2-node-engine-g1034
│ │ │ ├─┬ domain/chain1-2-graph-hub-g1032
│ │ │ │ └─┬ shared/chain1-2-data-core-g1030
│ │ │ │   └── shared/chain1-2-rule-core-g1029
│ │ │ ├── domain/chain1-2-metric-core-g1031
│ │ │ └── domain/recovery-ecosystem-core
│ │ └─┬ data/chain1-2-node-hub-g1035
│ │   └── domain/recovery-drill-lab
│ ├─┬ service/chain1-2-state-hub-g1037
│ │ ├── data/adapters
│ │ └─┬ data/recovery-drill-store
│ │   └── domain/recovery-drill
│ ├─┬ service/recovery-fusion-orchestrator
│ │ ├─┬ data/recovery-command-graph-store
│ │ │ └── domain/recovery-command-orchestration
│ │ ├─┬ infrastructure/recovery-operations-intelligence-adapters
│ │ │ └─┬ data/recovery-operations-intelligence-store
│ │ │   └── domain/recovery-operations-intelligence
│ │ └── infrastructure/recovery-operations-queue
│ └── service/recovery-workbench-orchestrator
├─┬ app/chain1-2-schema-fabric-g1041
│ ├─┬ service/recovery-chronicle-orchestrator
│ │ └─┬ data/recovery-chronicle-store
│ │   └── domain/recovery-chronicle-core
│ └─┬ service/recovery-playbook-orchestrator
│   └─┬ data/recovery-playbook-orchestration-store
│     └── domain/recovery-playbook-orchestration
├─┬ app/chain1-2-state-core-g1040
│ ├─┬ service/recovery-cockpit-orchestrator
│ │ ├─┬ data/recovery-cockpit-analytics
│ │ │ ├── data/recovery-cockpit-store
│ │ │ └─┬ domain/recovery-cockpit-intelligence
│ │ │   └── domain/recovery-cockpit-workloads
│ │ └── data/recovery-cockpit-insights
│ └─┬ service/recovery-strategy-orchestrator
│   └─┬ data/recovery-strategy-store
│     └── domain/recovery-orchestration-planning
├─┬ app/chain1-3-event-core-g1054
│ ├─┬ service/chain1-3-queue-flow-g1051
│ │ ├─┬ data/chain1-3-cache-core-g1049
│ │ │ ├─┬ domain/chain1-3-edge-pulse-g1045
│ │ │ │ ├── shared/chain1-3-cache-engine-g1043
│ │ │ │ ├── shared/chain1-3-stream-fabric-g1044
│ │ │ │ └── shared/chronicle-orchestration-protocol
│ │ │ └─┬ domain/chain1-3-trace-lens-g1046
│ │ │   └── shared/playbook-studio-runtime
│ │ ├─┬ data/chain1-3-span-fabric-g1048
│ │ │ ├── domain/enterprise-facts
│ │ │ └── domain/recovery-continuity-planning
│ │ └── data/warehouse
│ ├─┬ service/chain1-3-rule-pulse-g1052
│ │ └─┬ data/recovery-stability-store
│ │   └── domain/recovery-stability-models
│ ├─┬ service/failure-intelligence-runner
│ │ ├─┬ data/failure-intelligence-store
│ │ │ └── domain/failure-intelligence
│ │ └── platform/security
│ └── service/recovery-lab-graph-orchestrator
├─┬ app/chain1-3-policy-bridge-g1056
│ └─┬ service/orchestrations
│   └── domain/observability-core
├─┬ app/chain1-3-span-nexus-g1055
│ └─┬ service/recovery-continuity-lens
│   └─┬ data/continuity-lens-store
│     └── domain/continuity-lens
├── app/cli
├── app/fault-intel-console
├── app/fuzzy-console
├─┬ app/incident-forecast-operator
│ ├─┬ data/incident-forecast-store
│ │ └── domain/incident-forecasting
│ └─┬ service/incident-forecast-engine
│   └── infrastructure/incident-forecasting-connectors
├─┬ app/insights
│ ├── service/graph-intelligence
│ └─┬ service/telemetry
│   └─┬ data/telemetry-store
│     └── domain/telemetry-models
├─┬ app/policy-console
│ ├─┬ data/policy-orchestration-store
│ │ └─┬ domain/policy-orchestration
│ │   ├── domain/contracts
│ │   └── domain/policy-engine
│ └── service/policy-orchestration-engine
├─┬ app/recovery-autonomy-console
│ ├─┬ data/recovery-autonomy-store
│ │ └── domain/recovery-autonomy-graph
│ ├── service/recovery-autonomy-experiment-orchestrator
│ └── service/recovery-autonomy-orchestrator
├─┬ app/recovery-cascade-console
│ └── domain/recovery-cascade-orchestration
├─┬ app/recovery-chaos-lab
│ ├─┬ data/recovery-chaos-observability
│ │ └── domain/recovery-chaos-lab
│ ├── domain/recovery-chaos-sim-models
│ ├─┬ service/recovery-chaos-intelligence-orchestrator
│ │ └── service/recovery-chaos-orchestrator
│ └── service/recovery-chaos-lab-intelligence
├─┬ app/recovery-chronicle-console
│ ├─┬ data/recovery-chronicle-graph-store
│ │ └── domain/recovery-chronicle-graph-core
│ ├── domain/recovery-chronicle-lab-core
│ └── service/recovery-chronicle-graph-orchestrator
├─┬ app/recovery-cockpit-ui
│ ├─┬ data/recovery-cockpit-cognitive-store
│ │ └── domain/recovery-cockpit-cognitive-core
│ ├─┬ data/recovery-cockpit-constellation-store
│ │ └── domain/recovery-cockpit-constellation-core
│ ├─┬ domain/recovery-cockpit-synthetic-lab
│ │ └── shared/recovery-orchestration-runtime
│ ├─┬ domain/recovery-command-lattice-core
│ │ └── shared/command-graph-kernel
│ ├── domain/recovery-operations-cadence
│ ├── service/recovery-cockpit-cognitive-orchestrator
│ ├── service/recovery-cockpit-constellation-orchestrator
│ ├── service/recovery-cockpit-signal-orchestrator
│ ├─┬ service/recovery-orchestration-studio-engine
│ │ └─┬ domain/recovery-orchestration-design
│ │   └── shared/orchestration-kernel
│ ├─┬ service/recovery-stress-lab-orchestrator
│ │ ├── data/recovery-incident-lab-store
│ │ └── data/recovery-stress-lab-orchestration-store
│ └── shared/ops-orchestration-runtime
├─┬ app/recovery-console
│ ├─┬ data/continuity-readiness-store
│ │ └── domain/recovery-continuity-readiness
│ ├── data/incident-hub
│ ├─┬ data/recovery-atlas-store
│ │ └── domain/recovery-operations-atlas
│ ├─┬ data/recovery-command-control-plane
│ │ └── domain/recovery-command-language
│ ├─┬ data/recovery-synthetic-orchestration-store
│ │ └── domain/recovery-synthetic-orchestration
│ ├── domain/recovery-automation-orchestrator
│ ├── domain/recovery-chronicle-orchestrator
│ ├── domain/recovery-command-forge
│ ├── domain/recovery-continuity-lab-core
│ ├── domain/recovery-incident-graph
│ ├── domain/recovery-incident-saga
│ ├── domain/recovery-ops-playbook
│ ├─┬ domain/recovery-orchestration-lab-models
│ │ └── shared/recovery-orchestration-lab-runtime
│ ├── service/continuity-readiness-orchestrator
│ ├─┬ service/incident-orchestration
│ │ └── infrastructure/incident-notifications
│ ├─┬ service/recovery-command-control-hub
│ │ └── domain/recovery-command-control-hub
│ ├── service/recovery-command-forge-orchestrator
│ ├── service/recovery-command-intelligence-orchestrator
│ ├─┬ service/recovery-command-surface-orchestrator
│ │ └─┬ data/recovery-command-surface-store
│ │   └── domain/recovery-command-surface-models
│ ├── service/recovery-drill-orchestrator
│ ├─┬ service/recovery-fabric-cadence-orchestrator
│ │ └── domain/recovery-fabric-cadence-core
│ ├─┬ service/recovery-fusion-lab-orchestrator
│ │ └── domain/recovery-fusion-lab-core
│ ├── service/recovery-incident-graph-engine
│ ├── service/recovery-incident-saga-orchestrator
│ ├─┬ service/recovery-operations-engine
│ │ ├── data/recovery-operations-analytics
│ │ ├── data/recovery-operations-control-plane-store
│ │ ├── infrastructure/recovery-operations-cadence-bridge
│ │ ├── infrastructure/recovery-operations-compliance
│ │ └─┬ service/recovery-operations-intelligence-orchestrator
│ │   └── service/recovery-operations-policy-engine
│ ├─┬ service/recovery-ops-graph-orchestrator
│ │ └── domain/recovery-ops-orchestration-graph
│ ├── service/recovery-ops-playbook-orchestrator
│ ├── service/recovery-orchestration-atlas
│ ├── service/recovery-playbook-lab-orchestrator
│ ├─┬ service/recovery-scenario-orchestrator
│ │ ├─┬ data/recovery-scenario-store
│ │ │ ├── data/recovery-intelligence-store
│ │ │ └── domain/recovery-scenario-planner
│ │ ├── infrastructure/recovery-scenario-notifier
│ │ └── platform/logging
│ ├─┬ service/recovery-signal-intelligence-orchestrator
│ │ └─┬ data/recovery-signal-orchestration-store
│ │   └── domain/recovery-signal-orchestration-models
│ └── service/recovery-synthetic-orchestrator
├─┬ app/recovery-drill-observer
│ ├── data/recovery-drill-lab-store
│ ├── service/recovery-drill-lab-orchestrator
│ ├─┬ service/recovery-drill-observability
│ │ ├─┬ data/recovery-drill-metrics
│ │ │ └── domain/recovery-drill-telemetry
│ │ └── infrastructure/recovery-drill-archive
│ └── service/recovery-drill-surface-orchestrator
├─┬ app/recovery-ecosystem-console
│ ├── data/recovery-ecosystem-store
│ ├─┬ data/recovery-lens-observability-store
│ │ └── domain/recovery-lens-observability-models
│ ├── domain/recovery-ecosystem-orchestrator-core
│ ├─┬ service/recovery-ecosystem-analytics-orchestrator
│ │ └── data/recovery-ecosystem-analytics-plan-catalog
│ ├── service/recovery-ecosystem-orchestrator
│ └── service/recovery-lens-observability-orchestrator
├─┬ app/recovery-incident-dashboard
│ ├─┬ data/incident-signal-store
│ │ └── domain/incident-signal-intelligence
│ ├─┬ data/recovery-situational-store
│ │ └── domain/recovery-situational-intelligence
│ ├── domain/recovery-command-network
│ ├── domain/recovery-horizon-studio-core
│ ├── domain/recovery-incident-analytics
│ ├── domain/recovery-scenario-design
│ ├── service/recovery-chaos-lab-console-orchestrator
│ ├── service/recovery-command-orchestrator
│ ├─┬ service/recovery-incident-analytics-orchestrator
│ │ └── service/recovery-incident-orchestrator
│ ├─┬ service/recovery-intent-graph-orchestrator
│ │ └── domain/recovery-intent-graph
│ ├─┬ service/recovery-scenario-design-orchestrator
│ │ └── shared/scenario-design-kernel
│ ├── service/recovery-situational-orchestrator
│ ├── service/recovery-stability-orchestrator
│ ├── service/recovery-workflow-orchestrator
│ └── shared/recovery-orchestration-surface
├─┬ app/recovery-incident-lab-console
│ └── service/recovery-incident-lab-orchestrator
├── app/recovery-lab-dashboard
├─┬ app/recovery-mesh-console
│ ├── service/recovery-ops-mesh-engine
│ └── service/recovery-ops-mesh-observability-orchestrator
├─┬ app/recovery-playbook-orchestrator
│ ├── domain/recovery-playbook-observability-core
│ ├── domain/recovery-playbook-studio-core
│ └── service/recovery-playbook-observability-orchestrator
├─┬ app/recovery-timeline-studio
│ ├─┬ data/recovery-ops-playbook-studio-store
│ │ └── domain/recovery-ops-playbook-studio
│ ├── domain/recovery-timeline-orchestration
│ ├── service/recovery-ops-playbook-studio-orchestrator
│ └── service/recovery-timeline-orchestrator
├─┬ app/reporter
│ ├── domain/reporting
│ └── service/reporting
├─┬ app/stream-dashboard
│ ├── data/recovery-lattice-store
│ ├─┬ data/streaming-command-intelligence-store
│ │ └── domain/streaming-command-intelligence
│ ├── data/streaming-dashboard-store
│ └─┬ service/streaming-command-intelligence-orchestrator
│   └─┬ service/streaming-dashboard-orchestrator
│     └── service/streaming-control
├── app/worker
├── data/chain0-0-metric-engine-g8
├── data/chain0-1-index-fabric-g22
├── data/chain0-3-graph-mesh-g50
├── data/chain1-0-schema-pulse-g1008
├── data/chain1-1-index-mesh-g1022
├── data/chain1-2-graph-engine-g1036
├── data/chain1-3-data-pulse-g1050
├─┬ data/chain1-4-model-flow-g1062
│ ├─┬ domain/chain1-4-data-engine-g1060
│ │ └─┬ shared/chain1-4-route-flow-g1058
│ │   └── shared/chain1-4-state-nexus-g1057
│ └── domain/chain1-4-stream-fabric-g1059
├── data/chain1-4-model-nexus-g1063
├─┬ data/chain1-4-state-hub-g1064
│ └── domain/recovery-incident-insights
├─┬ data/continuity-journal
│ └── domain/continuity-orchestration
├── data/decision-catalog
├── data/lineage
├─┬ data/operations-control-store
│ └── domain/operations-control
├── data/recovery-continuity-plan-store
├── data/recovery-incident-insights-store
├── domain/catalog
├── domain/chain0-0-event-fabric-g5
├── domain/chain0-2-trace-flow-g33
├─┬ domain/chain0-3-schema-flow-g47
│ └── shared/cascade-intelligence-runtime
├── domain/chain1-0-signal-lens-g1005
├── domain/chain1-1-edge-fabric-g1019
├── domain/chain1-2-model-mesh-g1033
├── domain/chain1-3-graph-engine-g1047
├── domain/chain1-4-schema-fabric-g1061
├── domain/compliance
├── domain/decision-orchestration
├── domain/feature-flags
├── domain/identity
├── domain/identity-verification
├── domain/nebula-grid
├── domain/nebula-grid-b
├── domain/nebula-grid-c
├── domain/nebula-grid-d
├── domain/nebula-orchestration
├── domain/operations-orchestration
├── domain/search-suite
├── domain/temporal
├── domain/workflow
├── infrastructure/aws-ops
├── infrastructure/recovery-continuity-adapters
├── infrastructure/recovery-incident-notifier
├── infrastructure/transformers
├── platform/config
├── platform/ingress
├── platform/integrations
├── platform/policy
├── platform/queue
├── platform/storage
├── service/chain0-0-policy-nexus-g11
├── service/chain0-1-trace-nexus-g25
├── service/chain0-2-rule-mesh-g39
├── service/chain0-3-rule-pulse-g53
├── service/chain1-0-compute-fabric-g1011
├── service/chain1-1-node-pulse-g1025
├── service/chain1-2-queue-core-g1039
├── service/chain1-3-node-mesh-g1053
├── service/chain1-4-index-mesh-g1065
├── service/chain1-4-rule-nexus-g1066
├── service/continuity-runtime
├─┬ service/decision-mesh
│ └── service/decision-runtime
├── service/ingestion
├── service/operations
├── service/orchestrators
├── service/recommendation
├── service/recovery-continuity-orchestrator
├── service/recovery-incident-insight-orchestrator
├── service/recovery-intelligence-orchestrator
├── service/recovery-operations-observability
├── service/workflow
└── shared/monads
```
