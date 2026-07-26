import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Card, Stat } from "@enterprise-resilience/ui";
import { simulateRunbook } from "@/api/incidents.js";
import { getPlatformStatus } from "@/api/platform.js";
import { Link } from "react-router-dom";

function componentTone(status: "ready" | "configuration-needed" | "disabled") {
  if (status === "ready") {
    return "good" as const;
  }

  if (status === "configuration-needed") {
    return "warning" as const;
  }

  return "default" as const;
}

function metricAlertTone(state?: "normal" | "warning" | "breached") {
  if (state === "breached") {
    return "danger" as const;
  }
  if (state === "warning") {
    return "warning" as const;
  }
  return "good" as const;
}

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

export function PlatformPage() {
  const queryClient = useQueryClient();
  const platformQuery = useQuery({
    queryKey: ["platform-status"],
    queryFn: getPlatformStatus
  });
  const simulateMutation = useMutation({
    mutationFn: ({ runbookId, targetService }: { runbookId: string; targetService: string }) =>
      simulateRunbook(runbookId, targetService),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-status"] });
      await queryClient.invalidateQueries({ queryKey: ["audit-events"] });
    }
  });

  const platform = platformQuery.data;
  const components = platform?.components ?? [];
  const providerTargets = platform?.providerTargets ?? [];
  const cloudComponents = components.filter((component) => component.kind === "cloud-adapter");
  const readyCount = components.filter((component) => component.status === "ready").length;
  const liveProviderCount = cloudComponents.filter((component) => component.status === "ready").length;
  const alertedTargets = providerTargets.filter((target) => target.metricAlertState && target.metricAlertState !== "normal");
  const alertRouting = platform?.alertRouting;

  return (
    <div className="page-grid">
      <section className="page-header">
        <p className="eyebrow">Platform</p>
        <h2>Deployment, access, and operational entry points</h2>
        <p>
          This page shows where non-technical users should start, which runtime components are configured, and what
          still needs to be connected before live production execution.
        </p>
      </section>

      <div className="stats-grid">
        <Card>
          <Stat label="Ready components" value={String(readyCount)} hint="Configured and available now" />
        </Card>
        <Card>
          <Stat label="Deployment mode" value={platform?.deploymentMode ?? "loading"} hint="Local, container, or cloud-ready" />
        </Card>
        <Card>
          <Stat label="Environment" value={platform?.environmentName ?? "loading"} hint="Runtime label shown to operators" />
        </Card>
        <Card>
          <Stat label="API base path" value={platform?.apiBasePath ?? "/api"} hint="Integration entry point" />
        </Card>
        <Card>
          <Stat label="Live cloud lanes" value={String(liveProviderCount)} hint="Providers enabled for bounded execution" />
        </Card>
        <Card>
          <Stat label="Metric alerts" value={String(alertedTargets.length)} hint="Targets with sustained warning or breach signals" />
        </Card>
      </div>

      <div className="two-column">
        <Card title="Where people should go" subtitle="Simple entry points by audience">
          <div className="stack">
            {(platform?.accessLinks ?? []).map((link) => (
              <div key={link.label} className="row-card">
                <div>
                  <strong>{link.label}</strong>
                  <p>{link.summary}</p>
                  <p className="muted">
                    {link.audience} · {link.path}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="What is connected" subtitle="Runtime and cloud control status">
          <div className="stack">
            {components.map((component) => (
              <div key={component.name} className="row-card">
                <div>
                  <strong>{component.name}</strong>
                  <p>{component.summary}</p>
                  {component.url ? <p className="muted">{component.url}</p> : null}
                </div>
                <Badge tone={componentTone(component.status)}>{component.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="two-column">
        <Card title="Alert routing policy" subtitle="How sustained alerts leave the dashboard">
          <div className="stack">
            <div className="row-card">
              <div>
                <strong>Delivery mode</strong>
                <p>{alertRouting?.summary ?? "Loading routing policy"}</p>
              </div>
              <Badge tone={alertRouting?.webhookConfigured ? "good" : "warning"}>
                {alertRouting?.deliveryMode ?? "loading"}
              </Badge>
            </div>
            <div className="row-card">
              <div>
                <strong>Escalation threshold</strong>
                <p>
                  {alertRouting
                    ? `${alertRouting.escalationBreachStreak} breached collector cycle${alertRouting.escalationBreachStreak === 1 ? "" : "s"} before auto-escalation`
                    : "Loading threshold"}
                </p>
              </div>
            </div>
            <div className="row-card">
              <div>
                <strong>Collector cadence</strong>
                <p>
                  {alertRouting
                    ? `${Math.round(alertRouting.pollIntervalMs / 60000)} minute polling interval`
                    : "Loading collector cadence"}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Auto-escalation targets" subtitle="Targets currently eligible for automatic incident creation">
          {alertRouting?.autoEscalationTargets?.length ? (
            <div className="activity-list">
              {alertRouting.autoEscalationTargets.map((target) => (
                <div key={target} className="activity-item">
                  <strong>{target}</strong>
                  <p className="muted">This target is currently in warning or breached state and will follow the configured escalation policy.</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No target is currently in a state that could trigger automatic escalation.</p>
          )}
        </Card>
      </div>

      <Card title="Approved provider targets" subtitle="Which cloud lanes are ready and what each lane is allowed to touch">
        <div className="provider-grid">
          {cloudComponents.map((component) => {
            const providerName = component.name.startsWith("AWS") ? "aws" : "gcp";
            const targets = providerTargets.filter((target) => target.provider === providerName);

            return (
              <div key={component.name} className="provider-card">
                <div className="provider-card-header">
                  <div>
                    <p className="eyebrow">{providerName.toUpperCase()}</p>
                    <strong>{component.name}</strong>
                    <p>{component.summary}</p>
                  </div>
                  <Badge tone={componentTone(component.status)}>{component.status}</Badge>
                </div>
                <div className="stack">
                  {targets.map((target) => (
                    <div key={`${target.provider}-${target.targetService}`} className="target-card">
                      <div className="provider-chip-row">
                        <span className="provider-chip">{target.targetService}</span>
                        <span className="provider-chip provider-chip-muted">{target.executionMode}</span>
                        <Badge tone={metricAlertTone(target.metricAlertState)}>
                          {target.metricAlertState ?? "normal"}
                        </Badge>
                      </div>
                      <Link
                        to={`/platform/${target.provider}/${target.targetService}`}
                        className="target-link"
                      >
                        Open target timeline
                      </Link>
                      <p>{target.summary}</p>
                      <p className="muted">
                        {target.environment} · {target.region ?? "managed region"} · {target.runbookId ?? "registered runbook"}
                      </p>
                      <p className="muted">
                        Last live success:{" "}
                        {target.lastSuccessfulLiveAction
                          ? formatRelativeTime(target.lastSuccessfulLiveAction.timestamp)
                          : "not recorded"}
                      </p>
                      <p className="muted">
                        Metric monitor: {target.metricAlertSummary ?? "Waiting for collector history"}{" "}
                        {target.lastCollectedAt ? `· ${formatRelativeTime(target.lastCollectedAt)}` : ""}
                      </p>
                      {target.latestSimulation ? (
                        <div className="simulation-box">
                          <div className="provider-chip-row">
                            <span className="provider-chip">
                              last dry-run {target.latestSimulation.status}
                            </span>
                          </div>
                          <p>{target.latestSimulation.summary}</p>
                          <p className="muted">
                            {target.latestSimulation.actor} · {new Date(target.latestSimulation.timestamp).toLocaleString()}
                          </p>
                        </div>
                      ) : (
                        <p className="muted">No dry-run has been recorded for this target yet.</p>
                      )}
                      {target.executionMode === "live-enabled" ? (
                        target.lastSuccessfulLiveAction ? (
                          <div className="simulation-box">
                            <div className="provider-chip-row">
                              <span className="provider-chip">last live success</span>
                            </div>
                            <p>{target.lastSuccessfulLiveAction.summary}</p>
                            <p className="muted">
                              {target.lastSuccessfulLiveAction.actor} ·{" "}
                              {new Date(target.lastSuccessfulLiveAction.timestamp).toLocaleString()}
                            </p>
                          </div>
                        ) : (
                          <p className="muted">Live execution is enabled, but no successful live action is recorded yet.</p>
                        )
                      ) : (
                        <p className="muted">Enable live execution to track the last successful live action for this target.</p>
                      )}
                      {target.recentActivity.length > 0 ? (
                        <div className="activity-list">
                          {target.recentActivity.map((activity) => (
                            <div
                              key={`${target.provider}-${target.targetService}-${activity.timestamp}-${activity.kind}`}
                              className="activity-item"
                            >
                              <div className="provider-chip-row">
                                <span className="provider-chip provider-chip-muted">
                                  {activity.kind}
                                </span>
                                <span className="provider-chip provider-chip-muted">
                                  {activity.live ? "live" : "dry-run"}
                                </span>
                              </div>
                              <p>{activity.summary}</p>
                              <p className="muted">
                                {activity.actor} · {new Date(activity.timestamp).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {target.runbookId ? (
                        <button
                          className="secondary-button"
                          onClick={() =>
                            simulateMutation.mutate({
                              runbookId: target.runbookId!,
                              targetService: target.targetService
                            })
                          }
                          disabled={simulateMutation.isPending}
                        >
                          {simulateMutation.isPending ? "Running dry-run..." : "Run dry-run"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Deployment checklist" subtitle="Recommended next actions before production rollout">
        <div className="stack">
          {(platform?.nextSteps ?? []).map((step) => (
            <div key={step} className="row-card">
              <div>
                <strong>{step}</strong>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
