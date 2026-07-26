import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Stat } from "@enterprise-resilience/ui";
import { Link, useParams } from "react-router-dom";
import { getService, getServiceChanges, getServiceIncidents } from "@/api/incidents.js";
import { getPlatformStatus, rollbackPlatformTarget } from "@/api/platform.js";

function formatRelativeTime(timestamp: string) {
  const deltaMs = Date.now() - new Date(timestamp).getTime();
  const deltaMinutes = Math.max(1, Math.floor(deltaMs / 60000));

  if (deltaMinutes < 60) {
    return `${deltaMinutes} min ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours} hr ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays} day${deltaDays === 1 ? "" : "s"} ago`;
}

function trendTone(status: "passed" | "failed" | "completed") {
  return status === "failed" ? "activity-dot-failed" : "activity-dot-good";
}

function clampBar(value: number, max: number) {
  return `${Math.max(12, Math.min(100, Math.round((value / max) * 100)))}%`;
}

function getReadinessSummary(input: {
  executionMode: "simulation-only" | "live-enabled";
  healthStatus?: "healthy" | "degraded" | "critical";
  latestSimulationStatus?: "passed" | "failed";
  hasRecentIncident: boolean;
}) {
  if (input.healthStatus === "critical") {
    return {
      label: "Investigate first",
      detail: "Service health is critical. Review evidence and related incidents before taking action."
    };
  }

  if (input.latestSimulationStatus === "failed") {
    return {
      label: "Investigate first",
      detail: "The latest dry-run failed. Fix target configuration or provider health before acting."
    };
  }

  if (input.hasRecentIncident && input.healthStatus === "degraded") {
    return {
      label: "Investigate first",
      detail: "A recent incident is still linked to this target and the service remains degraded."
    };
  }

  if (input.executionMode === "simulation-only") {
    return {
      label: "Safe to validate",
      detail: "Dry-run actions are available, but live execution remains disabled for this target."
    };
  }

  return {
    label: "Safe to act",
    detail: "Health is stable, the lane is live-enabled, and no blocking signal is present."
  };
}

export function PlatformTargetPage() {
  const queryClient = useQueryClient();
  const { provider = "", targetService = "" } = useParams();
  const platformQuery = useQuery({
    queryKey: ["platform-status"],
    queryFn: getPlatformStatus
  });
  const serviceQuery = useQuery({
    queryKey: ["service", targetService],
    queryFn: () => getService(targetService),
    enabled: Boolean(targetService)
  });
  const changesQuery = useQuery({
    queryKey: ["service-changes", targetService],
    queryFn: () => getServiceChanges(targetService),
    enabled: Boolean(targetService)
  });
  const incidentsQuery = useQuery({
    queryKey: ["service-incidents", targetService],
    queryFn: () => getServiceIncidents(targetService),
    enabled: Boolean(targetService)
  });
  const rollbackMutation = useMutation({
    mutationFn: () => rollbackPlatformTarget(provider as "aws" | "gcp", targetService),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-status"] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events"] });
    }
  });

  const platform = platformQuery.data;
  const target = platform?.providerTargets.find(
    (item) => item.provider === provider && item.targetService === targetService
  );
  const service = serviceQuery.data;
  const changes = changesQuery.data ?? [];
  const relatedIncidents = incidentsQuery.data ?? [];

  if (!target) {
    return <div className="page-grid">Loading target activity...</div>;
  }

  const rollbackHistory = target.recentActivity.filter((activity) => activity.kind === "rollback");
  const latestLiveTimestamp = target.lastSuccessfulLiveAction?.timestamp;
  const readiness = getReadinessSummary({
    executionMode: target.executionMode,
    healthStatus: service?.health.status,
    latestSimulationStatus: target.latestSimulation?.status,
    hasRecentIncident: relatedIncidents.length > 0
  });
  const healthBars = service
    ? [
        {
          label: "Error rate",
          value: `${service.health.errorRate}%`,
          width: clampBar(service.health.errorRate, 10)
        },
        {
          label: "Latency p95",
          value: `${service.health.latencyP95Ms} ms`,
          width: clampBar(service.health.latencyP95Ms, 3000)
        },
        {
          label: "Saturation",
          value: `${service.health.saturation}%`,
          width: clampBar(service.health.saturation, 100)
        }
      ]
    : [];

  return (
    <div className="page-grid">
      <section className="page-header">
        <p className="eyebrow">
          <Link to="/platform">Platform</Link> · {target.provider.toUpperCase()}
        </p>
        <h2>{target.targetService}</h2>
        <p>{target.summary}</p>
        {target.rollbackRunbookId ? (
          <div className="actions-row">
            <button
              className="secondary-button"
              onClick={() => rollbackMutation.mutate()}
              disabled={rollbackMutation.isPending}
            >
              {rollbackMutation.isPending ? "Running rollback..." : "Run rollback"}
            </button>
          </div>
        ) : null}
      </section>

      <div className="stats-grid">
        <Card>
          <Stat label="Execution mode" value={target.executionMode} hint="Simulation-only or live-enabled" />
        </Card>
        <Card>
          <Stat label="Region" value={target.region ?? "managed"} hint="Primary control region" />
        </Card>
        <Card>
          <Stat
            label="Time since last success"
            value={latestLiveTimestamp ? formatRelativeTime(latestLiveTimestamp) : "none"}
            hint={latestLiveTimestamp ? new Date(latestLiveTimestamp).toLocaleString() : "No successful live action yet"}
          />
        </Card>
        <Card>
          <Stat label="Rollback events" value={String(rollbackHistory.length)} hint="Recent rollback activity on this target" />
        </Card>
      </div>

      <div className="two-column">
        <Card title="Readiness summary" subtitle="Should an operator act now or investigate first">
          <div className="simulation-box">
            <strong>{readiness.label}</strong>
            <p>{readiness.detail}</p>
            <p className="muted">
              Health: {service?.health.status ?? "loading"} · Related incidents: {relatedIncidents.length}
            </p>
          </div>
          {relatedIncidents.length > 0 ? (
            <div className="activity-list">
              {relatedIncidents.map((incident) => (
                <div key={incident.incidentId} className="activity-item">
                  <strong>{incident.title}</strong>
                  <p>{incident.summary}</p>
                  <Link to={`/incidents/${incident.incidentId}`} className="target-link">
                    Open incident {incident.incidentId}
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No active incident is currently attached to this target.</p>
          )}
        </Card>

        <Card title="Health signal sparkline" subtitle="Current service health, compressed for fast scanning">
          {healthBars.length > 0 ? (
            <div className="sparkline-panel">
              {healthBars.map((metric) => (
                <div key={metric.label} className="sparkline-row">
                  <div className="sparkline-meta">
                    <strong>{metric.label}</strong>
                    <span className="muted">{metric.value}</span>
                  </div>
                  <div className="sparkline-track">
                    <div className="sparkline-fill" style={{ width: metric.width }} />
                  </div>
                </div>
              ))}
              <p className="muted">Snapshot captured from the provider-backed service health endpoint.</p>
            </div>
          ) : (
            <p>Loading health signals...</p>
          )}
        </Card>
      </div>

      <div className="two-column">
        <Card title="Activity trend" subtitle="Newest activity on the left">
          <div className="trend-strip">
            {target.recentActivity.length > 0 ? (
              target.recentActivity.map((activity) => (
                <div
                  key={`${activity.kind}-${activity.timestamp}`}
                  className={`trend-node ${trendTone(activity.status)}`}
                  title={`${activity.kind} · ${activity.summary}`}
                >
                  <span>{activity.kind.slice(0, 4).toUpperCase()}</span>
                </div>
              ))
            ) : (
              <p>No target activity recorded yet.</p>
            )}
          </div>
          <p className="muted">
            This trend line compresses recent dry-runs, approvals, verification, and rollback activity into one target-level view.
          </p>
        </Card>

        <Card title="Recent changes and deployments" subtitle="What changed around this target">
          {changes.length > 0 ? (
            <div className="activity-list">
              {changes.map((change) => (
                <div key={change.changeId} className="activity-item">
                  <strong>{change.source}</strong>
                  <p>{change.summary}</p>
                  <p className="muted">{new Date(change.timestamp).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <p>No recent changes are recorded for this target.</p>
          )}
        </Card>
      </div>

      <div className="two-column">
        <Card title="Live recovery state" subtitle="Most recent successful live outcome">
          {target.lastSuccessfulLiveAction ? (
            <div className="simulation-box">
              <p>{target.lastSuccessfulLiveAction.summary}</p>
              <p className="muted">
                {target.lastSuccessfulLiveAction.actor} ·{" "}
                {new Date(target.lastSuccessfulLiveAction.timestamp).toLocaleString()} ·{" "}
                {formatRelativeTime(target.lastSuccessfulLiveAction.timestamp)}
              </p>
            </div>
          ) : (
            <p>No successful live action has been recorded for this target yet.</p>
          )}
          {target.latestSimulation ? (
            <div className="simulation-box">
              <p>{target.latestSimulation.summary}</p>
              <p className="muted">
                Latest dry-run by {target.latestSimulation.actor} · {new Date(target.latestSimulation.timestamp).toLocaleString()}
              </p>
            </div>
          ) : null}
        </Card>

        <Card title="Rollback history" subtitle="What happened when the lane needed to revert">
          {rollbackHistory.length > 0 ? (
            <div className="activity-list">
              {rollbackHistory.map((activity) => (
                <div key={`rollback-${activity.timestamp}`} className="activity-item">
                  <p>{activity.summary}</p>
                  <p className="muted">
                    {activity.actor} · {new Date(activity.timestamp).toLocaleString()}
                  </p>
                  {activity.incidentId ? (
                    <Link to={`/incidents/${activity.incidentId}`} className="target-link">
                      Open incident {activity.incidentId}
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p>No rollback activity is recorded for this target yet.</p>
          )}
        </Card>
      </div>

      <Card title="Recent activity timeline" subtitle="Simulation, approval, verification, and rollback">
        <div className="activity-list">
          {target.recentActivity.map((activity) => (
            <div key={`${activity.kind}-${activity.timestamp}`} className="activity-item">
              <div className="provider-chip-row">
                <span className="provider-chip provider-chip-muted">{activity.kind}</span>
                <span className="provider-chip provider-chip-muted">{activity.live ? "live" : "dry-run"}</span>
              </div>
              <p>{activity.summary}</p>
              <p className="muted">
                {activity.actor} · {new Date(activity.timestamp).toLocaleString()}
              </p>
              {activity.incidentId ? (
                <Link to={`/incidents/${activity.incidentId}`} className="target-link">
                  Open incident {activity.incidentId}
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
