import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  AuthSession,
  CloudProvider,
  PlatformStatusComponent,
  PlatformStatusSummary,
  TargetAlertStateRecord
} from "@enterprise-resilience/contracts";
import { AwsConfigService } from "../cloud-adapters/aws-config.service.js";
import { CloudAdaptersService } from "../cloud-adapters/cloud-adapters.service.js";
import { GcpConfigService } from "../cloud-adapters/gcp-config.service.js";
import { StoreService } from "../common/store.service.js";
import { IncidentsService } from "../incidents/incidents.service.js";
import { AlertRoutingService } from "../services/alert-routing.service.js";
import { getMetricDefinitions, getThresholdStatus } from "../services/metric-policy.js";

/**
 * How many consecutive samples a metric must stay bad for before it counts as
 * breached or elevated. Also interpolated into the operator-facing summaries, so
 * the number and the wording cannot drift apart.
 */
const BREACH_CONSECUTIVE_SAMPLES = 3;

@Injectable()
export class PlatformService {
  constructor(
    private readonly awsConfig: AwsConfigService,
    private readonly gcpConfig: GcpConfigService,
    private readonly cloudAdapters: CloudAdaptersService,
    private readonly store: StoreService,
    private readonly incidentsService: IncidentsService,
    private readonly alertRouting: AlertRoutingService
  ) {}

  async getStatus(): Promise<PlatformStatusSummary> {
    const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:5173";
    const apiBaseUrl = process.env.API_PUBLIC_URL ?? "http://localhost:3000/api";
    const databaseUrl = process.env.DATABASE_URL;
    const redisUrl = process.env.REDIS_URL;
    const awsLiveExecution = this.awsConfig.isLiveExecutionEnabled();
    const gcpLiveExecution = this.gcpConfig.isLiveExecutionEnabled();
    const activeCloudProviders = this.getActiveCloudProviders();
    const deploymentMode = process.env.DEPLOYMENT_MODE ?? "cloud-ready";
    const alertChannels = await this.alertRouting.listRuntimeChannelConfigs();
    const alertWebhookConfigured = alertChannels.some((channel) => channel.configured);
    const alertEscalationBreachStreak = Number(process.env.ALERT_ESCALATION_BREACH_STREAK ?? "2");
    const metricPollIntervalMs = Number(process.env.METRIC_POLL_INTERVAL_MS ?? "300000");
    const auditEvents = await this.store.listAuditEvents();
    const pendingDeadLettersByChannel = await this.store.countPendingAlertDeadLettersByChannel();
    const latestSimulationByTarget = new Map<string, (typeof auditEvents)[number]>();
    for (const event of auditEvents) {
      if (
        event.category !== "execution" ||
        !event.provider ||
        !event.targetService ||
        !event.runbookId ||
        !event.summary.startsWith("Runbook simulation ")
      ) {
        continue;
      }

      const key = `${event.provider}:${event.targetService}:${event.runbookId}`;
      if (!latestSimulationByTarget.has(key)) {
        latestSimulationByTarget.set(key, event);
      }
    }
    const notificationEvents = auditEvents.filter((event) =>
      [
        "Target alert notification sent",
        "Target alert notification failed",
        "Target alert notification skipped"
      ].includes(event.summary)
    );

    const buildTargetActivity = (
      provider: "aws" | "gcp",
      targetService: string,
      runbookId: string
    ) =>
      auditEvents
        .filter(
          (event) =>
            event.provider === provider &&
            event.targetService === targetService &&
            event.runbookId === runbookId &&
            (event.summary.startsWith("Runbook simulation ") ||
              event.summary === "Incident action approved" ||
              event.summary === "Recovery verified" ||
              event.summary.toLowerCase().includes("rollback"))
        )
        .slice(0, 4)
        .map((event) => ({
          kind: event.summary.startsWith("Runbook simulation ")
            ? ("simulation" as const)
            : event.summary.toLowerCase().includes("rollback")
              ? ("rollback" as const)
            : event.summary === "Recovery verified"
              ? ("verification" as const)
              : ("approval" as const),
          status: event.summary.startsWith("Runbook simulation ")
            ? event.summary.endsWith("passed")
              ? ("passed" as const)
              : ("failed" as const)
            : event.summary === "Recovery verified"
              ? ("completed" as const)
              : ("completed" as const),
          summary: event.detail,
          timestamp: event.timestamp,
          actor: event.actor,
          live: !event.summary.startsWith("Runbook simulation "),
          incidentId: event.incidentId
        }));

    const buildLastSuccessfulLiveAction = (
      provider: "aws" | "gcp",
      targetService: string,
      runbookId: string
    ) => {
      const event = auditEvents.find(
        (item) =>
          item.provider === provider &&
          item.targetService === targetService &&
          item.runbookId === runbookId &&
          item.summary === "Recovery verified" &&
          !item.detail.toLowerCase().includes("dry-run")
      );

      if (!event) {
        return undefined;
      }

      return {
        summary: event.detail,
        timestamp: event.timestamp,
        actor: event.actor
      };
    };

    const buildMetricAlert = async (provider: "aws" | "gcp", targetService: string) => {
      const storedAlert = await this.store.getTargetAlertState(provider, targetService);
      const { collectedAt, breachedMetrics, warningMetrics } = await this.summarizeMetricState(
        provider,
        targetService
      );

      if (breachedMetrics.length > 0) {
        return {
          metricAlertState: storedAlert?.state ?? ("breached" as const),
          metricAlertSummary: storedAlert?.summary ?? `${breachedMetrics.join(", ")} stayed breached across the last ${BREACH_CONSECUTIVE_SAMPLES} samples.`,
          lastCollectedAt: storedAlert?.lastCollectedAt ?? (collectedAt ? new Date(collectedAt).toISOString() : undefined),
          breachedMetrics,
          alertAcknowledgedAt: storedAlert?.acknowledgedAt,
          alertAcknowledgedBy: storedAlert?.acknowledgedBy,
          alertIncidentId: storedAlert?.incidentId
        };
      }

      if (warningMetrics.length > 0) {
        return {
          metricAlertState: storedAlert?.state ?? ("warning" as const),
          metricAlertSummary: storedAlert?.summary ?? `${warningMetrics.join(", ")} stayed elevated across the last ${BREACH_CONSECUTIVE_SAMPLES} samples.`,
          lastCollectedAt: storedAlert?.lastCollectedAt ?? (collectedAt ? new Date(collectedAt).toISOString() : undefined),
          breachedMetrics: warningMetrics,
          alertAcknowledgedAt: storedAlert?.acknowledgedAt,
          alertAcknowledgedBy: storedAlert?.acknowledgedBy,
          alertIncidentId: storedAlert?.incidentId
        };
      }

      return {
        metricAlertState: storedAlert?.state ?? ("normal" as const),
        metricAlertSummary: storedAlert?.summary ?? (collectedAt
          ? "Recent samples remain within policy thresholds."
          : "Metric polling has not collected enough history yet."),
        lastCollectedAt: storedAlert?.lastCollectedAt ?? (collectedAt ? new Date(collectedAt).toISOString() : undefined),
        breachedMetrics: storedAlert?.breachedMetrics ?? [],
        alertAcknowledgedAt: storedAlert?.acknowledgedAt,
        alertAcknowledgedBy: storedAlert?.acknowledgedBy,
        alertIncidentId: storedAlert?.incidentId
      };
    };

    const awsTargets = activeCloudProviders.includes("aws")
      ? await Promise.all(
        this.awsConfig.listTargets().map(async (target) => ({
        provider: "aws" as const,
        executionMode: awsLiveExecution ? ("live-enabled" as const) : ("simulation-only" as const),
        targetService: target.serviceId,
        environment: (target.environments[0] ?? "production") as "production" | "staging" | "development",
        region: target.region,
        runbookId: "aws-ecs-scale-service",
        rollbackRunbookId: target.rollbackRunbookId,
        summary: `ECS target ${target.ecsServiceName} can scale from ${target.minDesiredCount} to ${target.maxDesiredCount} in ${target.region}.`,
        recentActivity: buildTargetActivity("aws", target.serviceId, "aws-ecs-scale-service"),
        latestSimulation: this.toLatestSimulation(
          latestSimulationByTarget.get(`aws:${target.serviceId}:aws-ecs-scale-service`)
        ),
        lastSuccessfulLiveAction: buildLastSuccessfulLiveAction("aws", target.serviceId, "aws-ecs-scale-service"),
        ...(await buildMetricAlert("aws", target.serviceId))
      }))
    )
      : [];

    const gcpTargets = activeCloudProviders.includes("gcp")
      ? await Promise.all(
        this.gcpConfig.listTargets().map(async (target) => ({
        provider: "gcp" as const,
        executionMode: gcpLiveExecution ? ("live-enabled" as const) : ("simulation-only" as const),
        targetService: target.serviceId,
        environment: (target.environments[0] ?? "production") as "production" | "staging" | "development",
        region: target.region,
        runbookId: "gcp-cloud-run-shift-revision",
        rollbackRunbookId: target.rollbackRunbookId,
        summary: `Cloud Run target ${target.serviceName} can shift ${target.shiftPercent}% of traffic to revision ${target.previousRevision}.`,
        recentActivity: buildTargetActivity("gcp", target.serviceId, "gcp-cloud-run-shift-revision"),
        latestSimulation: this.toLatestSimulation(
          latestSimulationByTarget.get(`gcp:${target.serviceId}:gcp-cloud-run-shift-revision`)
        ),
        lastSuccessfulLiveAction: buildLastSuccessfulLiveAction("gcp", target.serviceId, "gcp-cloud-run-shift-revision"),
        ...(await buildMetricAlert("gcp", target.serviceId))
      }))
    )
      : [];

    const cloudComponents: PlatformStatusComponent[] = [];
    if (activeCloudProviders.includes("aws")) {
      cloudComponents.push({
        name: "AWS execution adapter",
        kind: "cloud-adapter",
        status: awsLiveExecution ? "ready" : "disabled",
        summary: awsLiveExecution
          ? "Live ECS dry-run and bounded execution are enabled for approved targets."
          : "Running in safe simulation mode until AWS_ECS_LIVE_EXECUTION=true."
      });
    }

    if (activeCloudProviders.includes("gcp")) {
      cloudComponents.push({
        name: "GCP execution adapter",
        kind: "cloud-adapter",
        status: gcpLiveExecution ? "ready" : "disabled",
        summary: gcpLiveExecution
          ? "Cloud Run traffic-shift execution is enabled for approved targets."
          : "Running in safe simulation mode until GCP_CLOUD_RUN_LIVE_EXECUTION=true."
      });
    }

    return {
      productName: "Enterprise Resilience Agent",
      deploymentMode: deploymentMode === "local" || deploymentMode === "container" ? deploymentMode : "cloud-ready",
      environmentName: process.env.APP_ENVIRONMENT ?? "demo",
      apiBasePath: "/api",
      generatedAt: new Date().toISOString(),
      activeCloudProviders,
      components: [
        {
          name: "Operations dashboard",
          kind: "ui",
          status: "ready",
          summary: "Primary screen for business users, service owners, and approvers.",
          url: `${appBaseUrl}/overview`
        },
        {
          name: "Resilience API",
          kind: "api",
          status: "ready",
          summary: "Backend API for incidents, runbooks, approvals, MLOps, and LLMOps.",
          url: apiBaseUrl
        },
        {
          name: "Postgres persistence",
          kind: "database",
          status: databaseUrl ? "ready" : "configuration-needed",
          summary: databaseUrl
            ? "Configured for incidents, approvals, runbooks, and audit history."
            : "Set DATABASE_URL to persist incidents and audit history."
        },
        {
          name: "Redis guardrails",
          kind: "cache",
          status: redisUrl ? "ready" : "configuration-needed",
          summary: redisUrl
            ? "Configured for idempotency control and approval execution locks."
            : "Set REDIS_URL to enable idempotency control and execution locking."
        },
        ...cloudComponents,
        {
          name: "User guide",
          kind: "documentation",
          status: "ready",
          summary: "Business-friendly handbook for approval, recovery, MLOps, and LLMOps.",
          url: "docs/user-guide.md"
        }
      ],
      providerTargets: [...awsTargets, ...gcpTargets],
      alertRouting: {
        deliveryMode:
          alertChannels.filter((channel) => channel.deliveryMode === "webhook").length > 1
            ? "multi-webhook"
            : alertWebhookConfigured
              ? "webhook"
              : "audit-only",
        webhookConfigured: alertWebhookConfigured,
        escalationBreachStreak: alertEscalationBreachStreak,
        pollIntervalMs: metricPollIntervalMs,
        retryCount: this.alertRouting.getRetryCount(),
        channels: alertChannels.map((channel) => {
          const lastEvent = notificationEvents.find((event) => event.detail.includes(`channel=${channel.name};`));
          return {
            name: channel.name,
            deliveryMode: channel.deliveryMode,
            configured: channel.configured,
            enabled: channel.enabled,
            mutedUntil: channel.mutedUntil,
            lastDeliveryStatus: !lastEvent
              ? ("unknown" as const)
              : lastEvent.summary === "Target alert notification sent"
                ? ("sent" as const)
                : lastEvent.summary === "Target alert notification failed"
                  ? ("failed" as const)
                  : ("skipped" as const),
            lastDeliveryAt: lastEvent?.timestamp,
            lastDeliverySummary: lastEvent?.detail,
            pendingDeadLetters: pendingDeadLettersByChannel.get(channel.name) ?? 0
          };
        }),
        autoEscalationTargets: [...awsTargets, ...gcpTargets]
          .filter((target) => target.metricAlertState === "warning" || target.metricAlertState === "breached")
          .map((target) => `${target.provider.toUpperCase()} ${target.targetService}`),
        summary: alertWebhookConfigured
          ? `Webhook routing is active. Sustained breached targets auto-escalate after ${alertEscalationBreachStreak} breached collector cycles.`
          : `Webhook routing is not configured. Alert delivery stays in audit only, and auto-escalation still triggers after ${alertEscalationBreachStreak} breached collector cycles.`
      },
      accessLinks: [
        {
          label: "Executive overview",
          audience: "business",
          path: "/overview",
          summary: "Use this to understand customer impact, active incidents, and approvals."
        },
        {
          label: "Approval queue",
          audience: "business",
          path: "/approvals",
          summary: "Use this to approve, reject, or escalate the safest proposed action."
        },
        {
          label: "Incident and audit trail",
          audience: "audit",
          path: "/audit",
          summary: "Use this to review who approved what, when it ran, and the outcome."
        },
        {
          label: "API entry point",
          audience: "engineering",
          path: "/api",
          summary: "Use this for integrations, platform automation, and deployment checks."
        }
      ],
      nextSteps: [
        "Set APP_BASE_URL and API_PUBLIC_URL for the real environment.",
        "Configure DATABASE_URL and REDIS_URL before production use.",
        `Keep ${activeCloudProviders.map((provider) => provider.toUpperCase()).join(" and ")} live execution off until allowed targets and execution identities are verified.`
      ]
    };
  }

  async getAlertHistory(provider: CloudProvider, targetService: string) {
    const events = await this.store.listAuditEventsByProvider(provider);
    return events.filter(
      (event) =>
        event.targetService === targetService &&
        (event.summary === "Target alert state changed" ||
          event.summary === "Target alert recovered" ||
          event.summary === "Target alert acknowledged" ||
          event.summary === "Target alert incident opened" ||
          event.summary === "Target alert auto-escalated" ||
          event.summary === "Target alert notification sent" ||
          event.summary === "Target alert notification skipped" ||
          event.summary === "Target alert notification failed")
    );
  }

  async enableAlertChannel(channelName: string) {
    await this.alertRouting.setChannelEnabled(channelName, true);
    return this.getStatus();
  }

  async disableAlertChannel(channelName: string) {
    await this.alertRouting.setChannelEnabled(channelName, false);
    return this.getStatus();
  }

  async muteAlertChannel(channelName: string, durationMinutes = 60) {
    await this.alertRouting.muteChannel(channelName, durationMinutes);
    return this.getStatus();
  }

  async unmuteAlertChannel(channelName: string) {
    await this.alertRouting.unmuteChannel(channelName);
    return this.getStatus();
  }

  async acknowledgeAlert(provider: CloudProvider, targetService: string, session: AuthSession) {
    const alert = await this.resolveTargetAlert(provider, targetService);
    if (!alert || alert.state === "normal") {
      throw new BadRequestException(`No active alert is available to acknowledge for ${provider}/${targetService}.`);
    }

    const updatedAt = new Date().toISOString();
    await this.store.saveTargetAlertState({
      ...alert,
      acknowledgedAt: updatedAt,
      acknowledgedBy: session.displayName,
      updatedAt
    });
    await this.store.recordAudit({
      actor: session.displayName,
      provider,
      targetService,
      incidentId: alert.incidentId,
      category: "policy",
      summary: "Target alert acknowledged",
      detail: `${session.displayName} acknowledged the ${alert.state} alert for ${targetService}.`
    });
    await this.alertRouting.route({
      provider,
      targetService,
      state: alert.state,
      summary: `${session.displayName} acknowledged the ${alert.state} alert for ${targetService}.`,
      incidentId: alert.incidentId,
      eventType: "acknowledged"
    });

    return this.getStatus();
  }

  async openIncidentFromAlert(provider: CloudProvider, targetService: string, session: AuthSession) {
    const alert = await this.resolveTargetAlert(provider, targetService);
    if (!alert || alert.state === "normal") {
      throw new BadRequestException(`No active alert is available to open an incident for ${provider}/${targetService}.`);
    }

    if (alert.incidentId) {
      return this.incidentsService.getOne(alert.incidentId);
    }

    const incident = await this.incidentsService.create({
      title: `${targetService} sustained ${alert.state} metric alert`,
      primaryService: targetService,
      severity: alert.state === "breached" ? "SEV-2" : "SEV-3",
      summary: `${targetService} triggered a sustained ${alert.state} alert from metric polling.`,
      trigger: alert.summary
    });

    const updatedAt = new Date().toISOString();
    await this.store.saveTargetAlertState({
      ...alert,
      incidentId: incident.incidentId,
      acknowledgedAt: alert.acknowledgedAt ?? updatedAt,
      acknowledgedBy: alert.acknowledgedBy ?? session.displayName,
      updatedAt
    });
    await this.store.recordAudit({
      actor: session.displayName,
      provider,
      targetService,
      incidentId: incident.incidentId,
      category: "incident",
      summary: "Target alert incident opened",
      detail: `${session.displayName} opened ${incident.incidentId} from the ${alert.state} alert on ${targetService}.`
    });
    await this.alertRouting.route({
      provider,
      targetService,
      state: alert.state,
      summary: `${session.displayName} opened ${incident.incidentId} from the ${alert.state} alert on ${targetService}.`,
      incidentId: incident.incidentId,
      eventType: "incident-opened"
    });

    return incident;
  }

  /**
   * Breach and warning state for one target, from its recent metric history.
   *
   * Extracted because this was duplicated verbatim in two places. Both callers
   * feed incident creation, so a divergence here would let two endpoints
   * disagree about whether the same service is breached.
   */
  private async summarizeMetricState(provider: CloudProvider, targetService: string) {
    const definitions = getMetricDefinitions(provider);
    const metricHistory = await this.store.listMetricHistory(
      targetService,
      definitions.map((metric) => metric.metricName),
      BREACH_CONSECUTIVE_SAMPLES
    );

    const collectedAt = Math.max(
      0,
      ...[...metricHistory.values()].flat().map((sample) => new Date(sample.timestamp).getTime())
    );
    const breachedMetrics = definitions
      .filter((metric) => {
        const samples = metricHistory.get(metric.metricName) ?? [];
        return (
          samples.length === BREACH_CONSECUTIVE_SAMPLES &&
          samples.every((sample) => getThresholdStatus(metric, sample.value) === "breached")
        );
      })
      .map((metric) => metric.label);
    const warningMetrics = definitions
      .filter((metric) => {
        const samples = metricHistory.get(metric.metricName) ?? [];
        return (
          samples.length === BREACH_CONSECUTIVE_SAMPLES &&
          breachedMetrics.includes(metric.label) === false &&
          samples.every((sample) => getThresholdStatus(metric, sample.value) !== "within-threshold")
        );
      })
      .map((metric) => metric.label);

    return { definitions, metricHistory, collectedAt, breachedMetrics, warningMetrics };
  }

  private async resolveTargetAlert(
    provider: CloudProvider,
    targetService: string
  ): Promise<TargetAlertStateRecord | undefined> {
    const storedAlert = await this.store.getTargetAlertState(provider, targetService);
    if (storedAlert) {
      return storedAlert;
    }

    const { collectedAt, breachedMetrics, warningMetrics } = await this.summarizeMetricState(
      provider,
      targetService
    );
    const state: TargetAlertStateRecord["state"] =
      breachedMetrics.length > 0 ? "breached" : warningMetrics.length > 0 ? "warning" : "normal";

    return {
      alertKey: `${provider}:${targetService}`,
      provider,
      targetService,
      state,
      summary:
        state === "breached"
          ? `${breachedMetrics.join(", ")} stayed breached across the last ${BREACH_CONSECUTIVE_SAMPLES} samples.`
          : state === "warning"
            ? `${warningMetrics.join(", ")} stayed elevated across the last ${BREACH_CONSECUTIVE_SAMPLES} samples.`
            : "Recent samples remain within policy thresholds.",
      lastCollectedAt: collectedAt ? new Date(collectedAt).toISOString() : undefined,
      breachedMetrics: state === "breached" ? breachedMetrics : warningMetrics,
      updatedAt: collectedAt ? new Date(collectedAt).toISOString() : new Date().toISOString()
    };
  }

  private toLatestSimulation(
    event:
      | {
          summary: string;
          detail: string;
          timestamp: string;
          actor: string;
        }
      | undefined
  ) {
    if (!event) {
      return undefined;
    }

    return {
      status: event.summary.endsWith("passed") ? ("passed" as const) : ("failed" as const),
      summary: event.detail,
      timestamp: event.timestamp,
      actor: event.actor
    };
  }

  async rollbackTarget(provider: CloudProvider, targetService: string, actor: AuthSession) {
    const rollbackRunbookId = this.getRollbackRunbookId(provider, targetService);
    if (!rollbackRunbookId) {
      throw new NotFoundException(`No rollback path is configured for ${provider}:${targetService}.`);
    }

    const incidentId = await this.findLatestIncidentId(targetService, provider);
    const adapter = this.cloudAdapters.getAdapter(provider);
    const result = await adapter.rollback({
      executionId: randomUUID(),
      incidentId,
      runbookId: rollbackRunbookId,
      targetService
    });

    await this.store.recordAudit({
      incidentId,
      executionId: result.executionId,
      actor: actor.userId,
      provider,
      targetService,
      runbookId: rollbackRunbookId,
      category: "execution",
      summary: "Rollback completed",
      detail: result.summary
    });

    return result;
  }

  private getRollbackRunbookId(provider: CloudProvider, targetService: string) {
    if (provider === "aws") {
      return this.awsConfig.getTarget(targetService)?.rollbackRunbookId;
    }

    return this.gcpConfig.getTarget(targetService)?.rollbackRunbookId;
  }

  private async findLatestIncidentId(targetService: string, provider: CloudProvider) {
    const incidents = await this.store.listIncidents();
    return incidents.find(
      (incident) =>
        incident.primaryService === targetService ||
        incident.proposals.some(
          (proposal) => proposal.targetService === targetService && proposal.cloudProvider === provider
        )
    )?.incidentId ?? `target:${provider}:${targetService}`;
  }

  private getActiveCloudProviders(): CloudProvider[] {
    const raw = process.env.ERA_ENABLED_CLOUD_PROVIDERS?.trim();
    if (!raw) {
      return ["aws", "gcp"];
    }

    const requested = raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is CloudProvider => value === "aws" || value === "gcp");

    return requested.length > 0 ? requested : ["aws", "gcp"];
  }
}
