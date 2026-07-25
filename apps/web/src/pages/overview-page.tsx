import { useQuery } from "@tanstack/react-query";
import { Card, Stat } from "@enterprise-resilience/ui";
import { listIncidents, listServices } from "@/api/incidents.js";
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

  const incidents = incidentsQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  const activeIncidents = incidents.filter((incident) => !["RESOLVED", "ROLLED_BACK"].includes(incident.status));

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

      <Card title="Priority incidents" subtitle="Current cross-cloud resilience work">
        <div className="stack">
          {incidents.map((incident) => (
            <div key={incident.incidentId} className="row-card">
              <div>
                <strong>{incident.title}</strong>
                <p>{incident.customerImpact}</p>
              </div>
              <IncidentStatusBadge status={incident.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
