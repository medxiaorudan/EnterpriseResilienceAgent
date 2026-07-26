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
  const awsTargets = providerTargets.filter((target) => target.provider === "aws");
  const gcpTargets = providerTargets.filter((target) => target.provider === "gcp");
  const gcpSimulationLane = gcpTargets[0];
  const providerCoverage = new Set(services.map((service) => service.cloudProvider));

  return (
    <div className="page-grid">
      <section className="page-header">
        <p className="eyebrow">Overview</p>
        <h2>Business-first incident command view</h2>
        <p>
          The MVP tracks AWS and GCP service health, incident state, approval gates, and auditable safe-remediation
          proposals for the checkout journey.
        </p>
      </section>

      <div className="stats-grid">
        <Card>
          <Stat label="Active incidents" value={String(activeIncidents.length)} hint="Correlated and awaiting action" />
        </Card>
        <Card>
          <Stat label="Protected services" value={String(services.length)} hint="AWS and GCP adapters seeded" />
        </Card>
        <Card>
          <Stat label="Approval queue" value={String(incidents.filter((item) => item.status === "AWAITING_APPROVAL").length)} hint="Human-controlled actions only" />
        </Card>
        <Card>
          <Stat label="Low-risk actions" value="3" hint="Registered runbooks available in the catalog" />
        </Card>
      </div>

      <div className="two-column">
        <Card title="Priority incidents" subtitle="Current cross-cloud resilience work">
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

        <Card title="Provider readiness" subtitle="Execution coverage across the control plane">
          <div className="stack">
            <div className="row-card">
              <div>
                <strong>AWS execution lane</strong>
                <p>{awsTargets.length} approved target{awsTargets.length === 1 ? "" : "s"} connected</p>
              </div>
              <Badge tone={awsTargets.some((target) => target.executionMode === "live-enabled") ? "good" : "default"}>
                {awsTargets.some((target) => target.executionMode === "live-enabled") ? "live-enabled" : "simulation-only"}
              </Badge>
            </div>
            <div className="row-card">
              <div>
                <strong>GCP execution lane</strong>
                <p>{gcpTargets.length} approved target{gcpTargets.length === 1 ? "" : "s"} connected</p>
              </div>
              <Badge tone={gcpTargets.some((target) => target.executionMode === "live-enabled") ? "good" : "default"}>
                {gcpTargets.some((target) => target.executionMode === "live-enabled") ? "live-enabled" : "simulation-only"}
              </Badge>
            </div>
            <div className="row-card">
              <div>
                <strong>Protected provider coverage</strong>
                <p>{[...providerCoverage].map((provider) => provider.toUpperCase()).join(" · ") || "Loading providers"}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card title="GCP simulation lane" subtitle="Provider-specific view for the Cloud Run rollback path">
        {gcpSimulationLane ? (
          <div className="target-card">
            <div className="provider-chip-row">
              <span className="provider-chip">GCP</span>
              <span className="provider-chip provider-chip-muted">{gcpSimulationLane.executionMode}</span>
            </div>
            <strong>{gcpSimulationLane.targetService}</strong>
            <p>{gcpSimulationLane.summary}</p>
            <p className="muted">
              Runbook: {gcpSimulationLane.runbookId} · Region: {gcpSimulationLane.region}
            </p>
          </div>
        ) : (
          <p>No GCP simulation lane is configured yet.</p>
        )}
      </Card>
    </div>
  );
}
