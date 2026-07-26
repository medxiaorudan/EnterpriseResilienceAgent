import { useQuery } from "@tanstack/react-query";
import { Badge, Card, Stat } from "@enterprise-resilience/ui";
import { listIncidents, listServices } from "@/api/incidents.js";
import { getPlatformStatus } from "@/api/platform.js";
import { IncidentStatusBadge } from "@/components/status-badge.js";

export function OverviewPage() {
  const incidentsQuery = useQuery({
    queryKey: ["incidents"],
    queryFn: listIncidents
  });
  const servicesQuery = useQuery({
    queryKey: ["services"],
    queryFn: listServices
  });
  const platformQuery = useQuery({
    queryKey: ["platform-status"],
    queryFn: getPlatformStatus
  });

  const incidents = incidentsQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  const platform = platformQuery.data;
  const activeIncidents = incidents.filter((incident) => !["RESOLVED", "ROLLED_BACK"].includes(incident.status));
  const providerTargets = platform?.providerTargets ?? [];
  const activeCloudProviders = platform?.activeCloudProviders ?? [];
  const providerNames = activeCloudProviders.map((provider) => provider.toUpperCase());
  const providerTargetGroups = activeCloudProviders.map((provider) => ({
    provider,
    targets: providerTargets.filter((target) => target.provider === provider)
  }));
  const featuredTarget = providerTargets[0];
  const providerCoverage = new Set(services.map((service) => service.cloudProvider));
  const alertedTargets = providerTargets.filter((target) => target.metricAlertState && target.metricAlertState !== "normal");

  return (
    <div className="page-grid">
      <section className="page-header">
        <p className="eyebrow">Overview</p>
        <h2>Business-first incident command view</h2>
        <p>
          The MVP tracks service health, incident state, approval gates, and auditable safe-remediation proposals for
          the cloud provider your company chooses.
        </p>
      </section>

      <div className="stats-grid">
        <Card>
          <Stat label="Active incidents" value={String(activeIncidents.length)} hint="Correlated and awaiting action" />
        </Card>
        <Card>
          <Stat
            label="Protected services"
            value={String(services.length)}
            hint={providerNames.length > 0 ? `${providerNames.join(" · ")} execution lane${providerNames.length === 1 ? "" : "s"} configured` : "Cloud selection loading"}
          />
        </Card>
        <Card>
          <Stat label="Approval queue" value={String(incidents.filter((item) => item.status === "AWAITING_APPROVAL").length)} hint="Human-controlled actions only" />
        </Card>
        <Card>
          <Stat label="Low-risk actions" value="3" hint="Registered runbooks available in the catalog" />
        </Card>
        <Card>
          <Stat label="Metric alerts" value={String(alertedTargets.length)} hint="Targets with sustained threshold pressure" />
        </Card>
      </div>

      <div className="two-column">
        <Card title="Priority incidents" subtitle="Current resilience work across the selected cloud scope">
          <div className="stack">
            {incidents.map((incident) => (
              <div key={incident.incidentId} className="row-card">
                <div>
                  <strong>{incident.title}</strong>
                  <p>{incident.customerImpact}</p>
                  <div className="provider-chip-row">
                    {incident.cloudProviders.map((provider) => (
                      <span key={`${incident.incidentId}-${provider}`} className="provider-chip">
                        {provider.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
                <IncidentStatusBadge status={incident.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Provider readiness" subtitle="Execution coverage across the selected cloud scope">
          <div className="stack">
            {providerTargetGroups.map(({ provider, targets }) => (
              <div key={provider} className="row-card">
                <div>
                  <strong>{provider.toUpperCase()} execution lane</strong>
                  <p>{targets.length} approved target{targets.length === 1 ? "" : "s"} connected</p>
                </div>
                <Badge tone={targets.some((target) => target.executionMode === "live-enabled") ? "good" : "default"}>
                  {targets.some((target) => target.executionMode === "live-enabled") ? "live-enabled" : "simulation-only"}
                </Badge>
              </div>
            ))}
            <div className="row-card">
              <div>
                <strong>Protected provider coverage</strong>
                <p>{[...providerCoverage].map((provider) => provider.toUpperCase()).join(" · ") || "Loading providers"}</p>
              </div>
            </div>
            <div className="row-card">
              <div>
                <strong>Sustained metric alerts</strong>
                <p>
                  {alertedTargets.length > 0
                    ? alertedTargets.map((target) => `${target.provider.toUpperCase()} ${target.targetService}`).join(" · ")
                    : "No target is currently holding a sustained warning or breach."}
                </p>
              </div>
              <Badge tone={alertedTargets.length > 0 ? "warning" : "good"}>
                {alertedTargets.length > 0 ? "attention" : "stable"}
              </Badge>
            </div>
          </div>
        </Card>
      </div>

      <Card
        title={featuredTarget ? `${featuredTarget.provider.toUpperCase()} simulation lane` : "Simulation lane"}
        subtitle="Provider-specific view for the currently selected rollback path"
      >
        {featuredTarget ? (
          <div className="target-card">
            <div className="provider-chip-row">
              <span className="provider-chip">{featuredTarget.provider.toUpperCase()}</span>
              <span className="provider-chip provider-chip-muted">{featuredTarget.executionMode}</span>
            </div>
            <strong>{featuredTarget.targetService}</strong>
            <p>{featuredTarget.summary}</p>
            <div className="provider-chip-row">
              <span className="provider-chip provider-chip-muted">
                monitor: {featuredTarget.metricAlertState ?? "normal"}
              </span>
            </div>
            {featuredTarget.latestSimulation ? (
              <div className="simulation-box">
                <p>{featuredTarget.latestSimulation.summary}</p>
                <p className="muted">
                  Last dry-run by {featuredTarget.latestSimulation.actor} on{" "}
                  {new Date(featuredTarget.latestSimulation.timestamp).toLocaleString()}
                </p>
              </div>
            ) : (
              <p className="muted">No dry-run has been recorded yet for the selected provider.</p>
            )}
            <p className="muted">
              Runbook: {featuredTarget.runbookId} · Region: {featuredTarget.region}
            </p>
          </div>
        ) : (
          <p>No simulation lane is configured for the selected provider yet.</p>
        )}
      </Card>
    </div>
  );
}
