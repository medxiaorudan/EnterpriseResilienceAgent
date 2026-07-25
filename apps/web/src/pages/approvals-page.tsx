import { useQuery } from "@tanstack/react-query";
import { Card } from "@enterprise-resilience/ui";
import { listIncidents } from "@/api/incidents.js";
import { IncidentStatusBadge } from "@/components/status-badge.js";

export function ApprovalsPage() {
  const incidentsQuery = useQuery({
    queryKey: ["incidents"],
    queryFn: listIncidents
  });

  const approvals = (incidentsQuery.data ?? []).filter((incident) => incident.status === "AWAITING_APPROVAL");

  return (
    <div className="page-grid">
      <section className="page-header">
        <p className="eyebrow">Approvals</p>
        <h2>Human-controlled remediation queue</h2>
      </section>

      <Card>
        <div className="stack">
          {approvals.map((incident) => (
            <div key={incident.incidentId} className="row-card">
              <div>
                <strong>{incident.title}</strong>
                <p>{incident.businessImpact}</p>
              </div>
              <IncidentStatusBadge status={incident.status} />
            </div>
          ))}
          {approvals.length === 0 ? <p>No incidents currently require approval.</p> : null}
        </div>
      </Card>
    </div>
  );
}
