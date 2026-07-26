import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Stat } from "@enterprise-resilience/ui";
import { Link, useParams } from "react-router-dom";
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

export function PlatformTargetPage() {
  const queryClient = useQueryClient();
  const { provider = "", targetService = "" } = useParams();
  const platformQuery = useQuery({
    queryKey: ["platform-status"],
    queryFn: getPlatformStatus
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

  if (!target) {
    return <div className="page-grid">Loading target activity...</div>;
  }

  const rollbackHistory = target.recentActivity.filter((activity) => activity.kind === "rollback");
  const latestLiveTimestamp = target.lastSuccessfulLiveAction?.timestamp;

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
      </div>

      <div className="two-column">
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

        <Card title="Rollback history" subtitle="What happened when the lane needed to revert">
          {rollbackHistory.length > 0 ? (
            <div className="activity-list">
              {rollbackHistory.map((activity) => (
                <div key={`rollback-${activity.timestamp}`} className="activity-item">
                  <p>{activity.summary}</p>
                  <p className="muted">
                    {activity.actor} · {new Date(activity.timestamp).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p>No rollback activity is recorded for this target yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
