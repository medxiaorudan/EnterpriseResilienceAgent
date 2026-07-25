# Incident Datasets And Benchmarks

This short list favors datasets that fit the current product scope: incident correlation, root-cause analysis, business-impact summaries, and safe remediation recommendations.

## Best fit now

### 1. IT Incident Log Dataset

- Source: Kaggle
- URL: https://www.kaggle.com/datasets/shamiulislamshifat/it-incident-log-dataset
- Why it fits:
  - Large incident-management event log
  - Good for workflow analytics, incident-state transitions, routing, and SLA patterns
  - Useful for approval, escalation, and audit-flow evaluation
- Limitation:
  - It is process/event data, not cloud telemetry or runbook execution evidence

### 2. RCABench OpenRCA2-Lite

- Source: Hugging Face dataset card for `lincyaw/rca`
- URL: https://huggingface.co/datasets/lincyaw/rca
- Why it fits:
  - 500 cloud-native RCA cases
  - Includes logs, metrics, traces, and ground-truth root causes
  - Strong fit for hypothesis ranking and evidence-based investigation
- Limitation:
  - Large and telemetry-heavy, so it is better for backend/offline evaluation than quick UI demos

### 3. OpenSRE / OpenRCA

- Source: Hugging Face dataset card for `tracer-cloud/opensre`
- URL: https://huggingface.co/datasets/tracer-cloud/opensre
- Why it fits:
  - Focused on SRE-style RCA tasks
  - Includes query/alert style cases and associated telemetry artifacts
  - Useful for evaluating prompt quality, investigation flow, and root-cause identification
- Limitation:
  - The full archive is large and better suited for benchmark pipelines than lightweight repo fixtures

## Good supplementary data

### 4. DevOps Incident Response Dataset

- Source: Hugging Face dataset card for `Snaseem2026/devops-incident-response`
- URL: https://huggingface.co/datasets/Snaseem2026/devops-incident-response
- Why it fits:
  - Small structured scenarios with symptoms, root cause, resolution steps, and prevention notes
  - Useful as seed examples for prompt evaluation and UI fixtures
- Limitation:
  - Small and synthetic, so it should not be treated as a main benchmark

### 5. Process Mining Event Log - Incident Management

- Source: Kaggle
- URL: https://www.kaggle.com/datasets/albertopmd/process-mining-event-log-incident-management
- Why it fits:
  - Good for queueing, reassignment, bottleneck, and conformance analysis
  - Useful for approval-path and incident-lifecycle reporting
- Limitation:
  - Not designed for cloud runbook recommendation or verification logic

## Recommended evaluation strategy

Use a layered approach instead of one dataset:

1. `evaluation/incidents/mvp-scenarios.json` for deterministic product acceptance tests.
2. DevOps Incident Response Dataset for prompt/output schema trials and UX fixture generation.
3. RCABench or OpenSRE for serious RCA benchmarking once the investigation pipeline is real.
4. Incident log datasets from Kaggle for workflow, escalation, and approval analytics.
