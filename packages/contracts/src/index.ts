export type CloudProvider = "aws" | "gcp";
export type Environment = "production" | "staging" | "development";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ConfidenceLevel = "low" | "medium" | "high";
export type Severity = "SEV-1" | "SEV-2" | "SEV-3" | "SEV-4";
export type IncidentStatus =
  | "DETECTED"
  | "CORRELATED"
  | "INVESTIGATING"
  | "ACTION_PROPOSED"
  | "POLICY_CHECKED"
  | "AWAITING_APPROVAL"
  | "EXECUTING"
  | "VERIFYING"
  | "RESOLVED"
  | "ROLLED_BACK"
  | "ESCALATED";

export type VerificationOutcome =
  | "RECOVERED"
  | "PARTIALLY_RECOVERED"
  | "NO_CHANGE"
  | "WORSE"
  | "ROLLBACK_COMPLETED"
  | "ESCALATED";
export type MlFramework = "pytorch" | "tensorflow";
export type LlmProvider = "openai" | "anthropic" | "google" | "azure-openai" | "self-hosted";

export interface TimeRange {
  start: string;
  end: string;
}

export interface ServiceDependency {
  serviceId: string;
  kind: "sync" | "async" | "data" | "control-plane";
  description: string;
}

export interface ServiceHealth {
  serviceId: string;
  status: "healthy" | "degraded" | "critical";
  summary: string;
  errorRate: number;
  latencyP95Ms: number;
  saturation: number;
  lastUpdatedAt: string;
}

export interface CloudService {
  serviceId: string;
  name: string;
  ownerTeam: string;
  businessJourney: string;
  cloudProvider: CloudProvider;
  environment: Environment;
  sla: string;
  riskTier: "tier-1" | "tier-2" | "tier-3";
  health: ServiceHealth;
  dependencies: ServiceDependency[];
  recentChanges: CloudChange[];
}

export interface CloudChange {
  changeId: string;
  timestamp: string;
  summary: string;
  source: "deployment" | "configuration" | "feature-flag" | "infrastructure";
}

export interface EvidenceItem {
  evidenceId: string;
  category: "metric" | "log" | "trace" | "deployment" | "security" | "cost" | "dependency";
  summary: string;
  details: string;
  source: string;
  timestamp: string;
}

export interface Hypothesis {
  cause: string;
  confidenceLevel: "low" | "medium" | "high";
  confidenceReason: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
}

export interface RemediationProposal {
  actionId: string;
  runbookId: string;
  runbookVersion: string;
  cloudProvider: CloudProvider;
  targetService: string;
  targetEnvironment: Environment;
  reason: string;
  riskLevel: RiskLevel;
  confidenceLevel: ConfidenceLevel;
  expectedResult: string;
  estimatedCostPerHour?: number;
  maximumDurationMinutes: number;
  preconditions: string[];
  verificationChecks: string[];
  rollbackRunbookId?: string;
  approvalPolicy: string;
}

export interface IncidentTimelineEntry {
  eventId: string;
  timestamp: string;
  title: string;
  detail: string;
  status: IncidentStatus;
}

export interface ApprovalRecord {
  approvalId: string;
  incidentId: string;
  decision: "approved" | "rejected" | "escalated";
  actor: string;
  comment?: string;
  timestamp: string;
}

export interface VerificationResult {
  verificationId: string;
  incidentId: string;
  outcome: VerificationOutcome;
  summary: string;
  checks: Array<{
    name: string;
    status: "passed" | "failed" | "warning";
    detail: string;
  }>;
  timestamp: string;
}

export interface ExecutionRecord {
  executionId: string;
  incidentId: string;
  runbookId: string;
  status: "pending" | "running" | "completed" | "failed" | "rolled_back";
  startedAt: string;
  completedAt?: string;
  steps: Array<{
    stepId: string;
    title: string;
    status: "pending" | "running" | "completed" | "failed";
    detail: string;
  }>;
}

export interface AuditEvent {
  auditId: string;
  incidentId?: string;
  executionId?: string;
  timestamp: string;
  actor: string;
  category: "incident" | "approval" | "policy" | "execution" | "verification";
  summary: string;
  detail: string;
}

export interface RegisteredRunbook {
  runbookId: string;
  version: string;
  cloudProvider: CloudProvider;
  riskLevel: RiskLevel;
  title: string;
  owner: string;
  description: string;
  approvedTargets: string[];
  preconditions: string[];
  verificationChecks: string[];
  rollbackRunbookId?: string;
}

export interface IncidentRecord {
  incidentId: string;
  title: string;
  summary: string;
  severity: Severity;
  primaryService: string;
  ownerTeam: string;
  customerImpact: string;
  businessImpact: string;
  cloudProviders: CloudProvider[];
  status: IncidentStatus;
  confidenceSummary: string;
  createdAt: string;
  updatedAt: string;
  hypotheses: Hypothesis[];
  evidence: EvidenceItem[];
  proposals: RemediationProposal[];
  timeline: IncidentTimelineEntry[];
  approvals: ApprovalRecord[];
  latestVerification?: VerificationResult;
  latestExecution?: ExecutionRecord;
}

export interface IncidentEvent<TPayload = unknown> {
  eventId: string;
  incidentId: string;
  eventType: string;
  timestamp: string;
  version: number;
  payload: TPayload;
}

export interface CreateIncidentInput {
  title: string;
  primaryService: string;
  severity: Severity;
  summary: string;
  trigger: string;
}

export interface MlFrameworkSupport {
  framework: MlFramework;
  supported: boolean;
  executionMode: "python-service" | "external-worker";
  useCases: string[];
  notes: string;
}

export interface MlopsCapabilityProfile {
  frameworks: MlFrameworkSupport[];
  modelRegistry: string[];
  evaluationModes: string[];
  deploymentStrategies: string[];
}

export interface LlmopsCapabilityProfile {
  providers: Array<{
    provider: LlmProvider;
    supported: boolean;
    useCases: string[];
    notes: string;
  }>;
  observability: string[];
  evaluationModes: string[];
  safetyControls: string[];
  governance: string[];
}

export interface ToolLayerFit {
  tool: string;
  category: "telemetry" | "monitoring" | "llm-observability" | "resilience-control-plane";
  strongestFit: string[];
  roleInThisProject: string;
}

export interface MetricQuery {
  serviceId: string;
  metricName: string;
  statistic?: "avg" | "sum" | "min" | "max" | "p95";
  timeRange: TimeRange;
}

export interface MetricResult {
  metricName: string;
  value: number;
  unit: string;
  timestamp: string;
}

export interface LogQuery {
  serviceId: string;
  pattern: string;
  timeRange: TimeRange;
}

export interface LogResult {
  timestamp: string;
  message: string;
  source: string;
}

export interface SecurityQuery {
  serviceId: string;
  environment: Environment;
}

export interface SecurityFinding {
  findingId: string;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
}

export interface CostQuery {
  serviceId: string;
  environment: Environment;
}

export interface CostSignal {
  signalId: string;
  estimatedCostPerHour: number;
  summary: string;
}

export interface RunbookSimulationRequest {
  runbookId: string;
  incidentId?: string;
  targetService: string;
  environment: Environment;
  dryRun?: boolean;
}

export interface SimulationResult {
  simulationId: string;
  provider: CloudProvider;
  status: "passed" | "failed";
  summary: string;
  checks: string[];
  proposedChange?: {
    field: string;
    currentValue: number;
    nextValue: number;
  };
}

export interface ApprovedExecutionRequest {
  executionId: string;
  incidentId: string;
  runbookId: string;
  targetService: string;
  environment: Environment;
  dryRun?: boolean;
}

export interface ExecutionResult {
  executionId: string;
  provider: CloudProvider;
  status: "completed" | "failed";
  summary: string;
  steps: ExecutionRecord["steps"];
}

export interface VerificationRequest {
  incidentId: string;
  targetService: string;
  environment: Environment;
  checks: string[];
}

export interface RollbackRequest {
  executionId: string;
  incidentId: string;
  runbookId: string;
  targetService: string;
}

export interface RollbackResult {
  executionId: string;
  provider: CloudProvider;
  status: "completed" | "failed";
  summary: string;
}

export interface CloudOperationsAdapter {
  provider: CloudProvider;
  getServiceHealth(serviceId: string): Promise<ServiceHealth>;
  getRecentChanges(serviceId: string, timeRange: TimeRange): Promise<CloudChange[]>;
  getMetrics(query: MetricQuery): Promise<MetricResult[]>;
  queryLogs(query: LogQuery): Promise<LogResult[]>;
  getSecurityFindings(query: SecurityQuery): Promise<SecurityFinding[]>;
  getCostSignals(query: CostQuery): Promise<CostSignal[]>;
  simulateRunbook(request: RunbookSimulationRequest): Promise<SimulationResult>;
  executeRunbook(request: ApprovedExecutionRequest): Promise<ExecutionResult>;
  verifyRecovery(request: VerificationRequest): Promise<VerificationResult>;
  rollback(request: RollbackRequest): Promise<RollbackResult>;
}

const now = "2026-07-25T09:30:00.000Z";

export const seedServices: CloudService[] = [
  {
    serviceId: "checkout-api",
    name: "Checkout API",
    ownerTeam: "commerce-platform",
    businessJourney: "Customer checkout",
    cloudProvider: "aws",
    environment: "production",
    sla: "99.95%",
    riskTier: "tier-1",
    health: {
      serviceId: "checkout-api",
      status: "degraded",
      summary: "Rising queue depth and elevated p95 latency.",
      errorRate: 8.7,
      latencyP95Ms: 2650,
      saturation: 91,
      lastUpdatedAt: now
    },
    dependencies: [
      {
        serviceId: "payment-routing",
        kind: "sync",
        description: "Routes payment attempts to PSP integrations."
      }
    ],
    recentChanges: [
      {
        changeId: "chg-aws-1",
        timestamp: "2026-07-25T08:55:00.000Z",
        summary: "Checkout deployment rolled out image `checkout:2026.07.25.4`.",
        source: "deployment"
      }
    ]
  },
  {
    serviceId: "payment-routing",
    name: "Payment Routing",
    ownerTeam: "payments-reliability",
    businessJourney: "Customer checkout",
    cloudProvider: "gcp",
    environment: "production",
    sla: "99.9%",
    riskTier: "tier-1",
    health: {
      serviceId: "payment-routing",
      status: "healthy",
      summary: "No error spike detected in Cloud Run revisions.",
      errorRate: 0.4,
      latencyP95Ms: 430,
      saturation: 48,
      lastUpdatedAt: now
    },
    dependencies: [
      {
        serviceId: "checkout-api",
        kind: "control-plane",
        description: "Receives synchronous traffic from Checkout API."
      }
    ],
    recentChanges: [
      {
        changeId: "chg-gcp-1",
        timestamp: "2026-07-24T21:10:00.000Z",
        summary: "Traffic pinned to stable revision `payment-routing-r219`.",
        source: "configuration"
      }
    ]
  }
];

export const seedRunbooks: RegisteredRunbook[] = [
  {
    runbookId: "aws-ecs-scale-service",
    version: "3.2.1",
    cloudProvider: "aws",
    riskLevel: "low",
    title: "Increase ECS service capacity within approved range",
    owner: "platform-sre",
    description: "Scales an ECS service by a bounded number of tasks, verifies health, and auto-restores after cooldown.",
    approvedTargets: ["checkout-api"],
    preconditions: [
      "Database is healthy",
      "Current desired count below approved ceiling",
      "Dependency service is healthy"
    ],
    verificationChecks: [
      "checkout_success_rate > 99.5%",
      "p95_latency < 2000ms",
      "queue_depth decreasing for 5 minutes"
    ],
    rollbackRunbookId: "aws-ecs-restore-service-count"
  },
  {
    runbookId: "aws-ecs-replace-task",
    version: "1.4.0",
    cloudProvider: "aws",
    riskLevel: "low",
    title: "Replace one unhealthy ECS task",
    owner: "platform-sre",
    description: "Drains and replaces a single unhealthy task while preserving service capacity.",
    approvedTargets: ["checkout-api"],
    preconditions: [
      "At least one other task remains healthy",
      "No deployment freeze override required"
    ],
    verificationChecks: [
      "Healthy task count restored",
      "No increase in 5xx rate"
    ]
  },
  {
    runbookId: "gcp-cloud-run-shift-revision",
    version: "2.1.0",
    cloudProvider: "gcp",
    riskLevel: "medium",
    title: "Shift Cloud Run traffic to previous revision",
    owner: "payments-reliability",
    description: "Returns traffic to the last known healthy Cloud Run revision and verifies cross-cloud checkout recovery.",
    approvedTargets: ["payment-routing"],
    preconditions: [
      "Previous healthy revision is available",
      "No security hold is active"
    ],
    verificationChecks: [
      "GCP request error rate normalizes",
      "AWS checkout success rate recovers"
    ]
  }
];

export const seedIncidents: IncidentRecord[] = [
  {
    incidentId: "INC-2026-0042",
    title: "Checkout worker saturation in production",
    summary: "Checkout success dropped from 99.8% to 91.2% over 12 minutes.",
    severity: "SEV-2",
    primaryService: "checkout-api",
    ownerTeam: "commerce-platform",
    customerImpact: "About 9% of checkout attempts are failing.",
    businessImpact: "Failed payments are reducing completed orders for the checkout journey.",
    cloudProviders: ["aws", "gcp"],
    status: "AWAITING_APPROVAL",
    confidenceSummary: "Medium confidence: queue growth, worker saturation, and stable dependencies point to capacity exhaustion.",
    createdAt: "2026-07-25T09:04:00.000Z",
    updatedAt: now,
    hypotheses: [
      {
        cause: "Application worker saturation",
        confidenceLevel: "high",
        confidenceReason: "Three independent signals support capacity exhaustion while database and GCP dependencies remain healthy.",
        supportingEvidence: [
          "Request queue is increasing",
          "Healthy worker count dropped from 8 to 5",
          "Database latency remains normal"
        ],
        contradictingEvidence: [
          "Traffic is only 12% above baseline"
        ]
      }
    ],
    evidence: [
      {
        evidenceId: "ev-1",
        category: "metric",
        summary: "Queue depth climbed from 120 to 920 in 10 minutes.",
        details: "SQS-backed checkout work queue has grown continuously while consumer task count remained at 5.",
        source: "CloudWatch / CheckoutQueueDepth",
        timestamp: "2026-07-25T09:18:00.000Z"
      },
      {
        evidenceId: "ev-2",
        category: "dependency",
        summary: "Payment routing remains healthy in GCP.",
        details: "Cloud Run error rate remains below 0.5% and p95 latency below 500ms.",
        source: "Cloud Monitoring / request_count",
        timestamp: "2026-07-25T09:17:00.000Z"
      },
      {
        evidenceId: "ev-3",
        category: "deployment",
        summary: "Checkout deployment changed 25 minutes before detection.",
        details: "No rollback signal found yet; traces isolate slowdown to worker pool saturation rather than dependency failures.",
        source: "GitOps deployment history",
        timestamp: "2026-07-25T08:55:00.000Z"
      }
    ],
    proposals: [
      {
        actionId: "scale-checkout-workers",
        runbookId: "aws-ecs-scale-service",
        runbookVersion: "3.2.1",
        cloudProvider: "aws",
        targetService: "checkout-api",
        targetEnvironment: "production",
        reason: "Request queue is growing while worker capacity is exhausted.",
        riskLevel: "low",
        confidenceLevel: "high",
        expectedResult: "Restore checkout latency below 2 seconds and recover success rate above 99.5%.",
        estimatedCostPerHour: 0.6,
        maximumDurationMinutes: 30,
        preconditions: [
          "Database is healthy",
          "External payment service is healthy",
          "Current worker count is below approved maximum"
        ],
        verificationChecks: [
          "checkout_success_rate > 99.5%",
          "p95_latency < 2 seconds",
          "queue_depth decreasing for 5 minutes"
        ],
        rollbackRunbookId: "aws-ecs-restore-service-count",
        approvalPolicy: "automatic-within-approved-range"
      }
    ],
    timeline: [
      {
        eventId: "tl-1",
        timestamp: "2026-07-25T09:04:00.000Z",
        title: "Incident detected",
        detail: "Checkout success fell below SLO threshold.",
        status: "DETECTED"
      },
      {
        eventId: "tl-2",
        timestamp: "2026-07-25T09:06:00.000Z",
        title: "Signals correlated",
        detail: "Latency, error-rate, and queue signals linked to checkout-api and customer checkout journey.",
        status: "CORRELATED"
      },
      {
        eventId: "tl-3",
        timestamp: "2026-07-25T09:10:00.000Z",
        title: "Root-cause hypothesis ranked",
        detail: "Worker saturation is the leading hypothesis with stable database and GCP dependencies.",
        status: "INVESTIGATING"
      },
      {
        eventId: "tl-4",
        timestamp: "2026-07-25T09:16:00.000Z",
        title: "Action proposed",
        detail: "Low-risk ECS scaling runbook selected and policy-scoped for production.",
        status: "ACTION_PROPOSED"
      },
      {
        eventId: "tl-5",
        timestamp: "2026-07-25T09:22:00.000Z",
        title: "Awaiting approval",
        detail: "Business approver or service owner approval required before execution.",
        status: "AWAITING_APPROVAL"
      }
    ],
    approvals: []
  }
];

export const seedAuditEvents: AuditEvent[] = [
  {
    auditId: "audit-1",
    incidentId: "INC-2026-0042",
    timestamp: "2026-07-25T09:22:00.000Z",
    actor: "policy-engine",
    category: "policy",
    summary: "Runbook passed deterministic approval pre-checks.",
    detail: "Environment, target service, rollback availability, cost ceiling, and blast radius checks all passed."
  }
];

export const seedMlopsCapabilityProfile: MlopsCapabilityProfile = {
  frameworks: [
    {
      framework: "pytorch",
      supported: true,
      executionMode: "python-service",
      useCases: [
        "deep learning model training",
        "incident classification",
        "root-cause ranking",
        "embedding generation"
      ],
      notes: "Run PyTorch workloads in a dedicated Python ML service or worker to isolate native dependencies from the Node.js control plane."
    },
    {
      framework: "tensorflow",
      supported: true,
      executionMode: "python-service",
      useCases: [
        "time-series anomaly detection",
        "forecasting",
        "classification",
        "model serving and batch evaluation"
      ],
      notes: "Use TensorFlow in the same Python ML boundary with separate model packaging and evaluation pipelines when required."
    }
  ],
  modelRegistry: [
    "mlflow",
    "vertex-ai-model-registry",
    "sagemaker-model-registry"
  ],
  evaluationModes: [
    "offline backtesting",
    "shadow deployment",
    "champion-challenger comparison"
  ],
  deploymentStrategies: [
    "canary",
    "blue-green",
    "rollback-to-previous-model"
  ]
};

export const seedLlmopsCapabilityProfile: LlmopsCapabilityProfile = {
  providers: [
    {
      provider: "openai",
      supported: true,
      useCases: [
        "incident summarization",
        "root-cause hypothesis generation",
        "remediation recommendation ranking",
        "evaluation and judging workflows"
      ],
      notes: "Preferred for frontier reasoning and structured-output workflows where managed hosted models are acceptable."
    },
    {
      provider: "anthropic",
      supported: true,
      useCases: [
        "policy-aware reasoning",
        "long-context incident investigation",
        "explanation generation"
      ],
      notes: "Useful when long-context reasoning and cautious recommendation behavior are preferred."
    },
    {
      provider: "google",
      supported: true,
      useCases: [
        "multimodal investigation extensions",
        "tool-driven analysis",
        "alternative model routing"
      ],
      notes: "Supported as an alternate managed provider for model diversity and routing experiments."
    },
    {
      provider: "azure-openai",
      supported: true,
      useCases: [
        "enterprise-managed OpenAI deployments",
        "regional governance",
        "regulated environment hosting"
      ],
      notes: "Useful when enterprise network, compliance, or regional hosting requirements favor Azure-managed deployment."
    },
    {
      provider: "self-hosted",
      supported: true,
      useCases: [
        "private inference",
        "air-gapped environments",
        "specialized internal models"
      ],
      notes: "Reserved for high-control environments where hosted LLM providers are not permitted."
    }
  ],
  observability: [
    "trace every LLM call",
    "record prompt version and tool schema version",
    "track latency, cost, token use, and model version",
    "capture retrieved documents and tool calls",
    "store approval and override context"
  ],
  evaluationModes: [
    "offline datasets",
    "production scoring",
    "llm-as-a-judge",
    "deterministic code evaluators",
    "prompt experiments",
    "champion-challenger comparison"
  ],
  safetyControls: [
    "prompt-injection detection",
    "tool misuse prevention",
    "unsupported-claim monitoring",
    "structured-output validation",
    "human approval before production change",
    "runbook-only execution"
  ],
  governance: [
    "prompt version registry",
    "model version registry",
    "approval audit trail",
    "release tagging",
    "policy-scoped autonomy levels"
  ]
};

export const seedToolLayerFits: ToolLayerFit[] = [
  {
    tool: "OpenTelemetry",
    category: "telemetry",
    strongestFit: ["AIOps", "MLOps", "LLMOps"],
    roleInThisProject: "Instrumentation and signal emission for services, agents, APIs, and workers."
  },
  {
    tool: "Prometheus",
    category: "monitoring",
    strongestFit: ["AIOps", "MLOps-serving"],
    roleInThisProject: "Numeric time-series monitoring and alert input for incident detection and recovery verification."
  },
  {
    tool: "Grafana",
    category: "monitoring",
    strongestFit: ["AIOps", "MLOps-serving"],
    roleInThisProject: "Dashboards, anomaly views, and operator-facing observability for infrastructure and business signals."
  },
  {
    tool: "LangSmith",
    category: "llm-observability",
    strongestFit: ["LLMOps", "AgentOps"],
    roleInThisProject: "Tracing, evaluation, dataset testing, and regression monitoring for the LLM and agent layers."
  },
  {
    tool: "Langfuse",
    category: "llm-observability",
    strongestFit: ["LLMOps", "AgentOps"],
    roleInThisProject: "Production LLM observability, prompt experiments, scoring, and model/prompt analytics."
  },
  {
    tool: "Enterprise Resilience Agent",
    category: "resilience-control-plane",
    strongestFit: ["AIOps", "Resilience Engineering", "Human-approved automation"],
    roleInThisProject: "Incident reasoning, approval gating, runbook orchestration, execution control, verification, rollback, and escalation."
  }
];
