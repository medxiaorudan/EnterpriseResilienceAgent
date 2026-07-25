import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@enterprise-resilience/ui";
import { listIncidents } from "@/api/incidents.js";
import { IncidentStatusBadge } from "@/components/status-badge.js";

export function IncidentsPage() {
  const incidentsQuery = useQuery({
    queryKey: ["incidents"],
    queryFn: listIncidents
  });

  return (
    <div className="page-grid">
      <section className="page-header">
        <p className="eyebrow">Incidents</p>
        <h2>Correlated incidents and safe actions</h2>
      </section>

      <Card>
        <div className="table-like">
          {(incidentsQuery.data ?? []).map((incident) => (
            <Link key={incident.incidentId} to={`/incidents/${incident.incidentId}`} className="table-row">
              <div>
                <strong>{incident.title}</strong>
                <p>{incident.summary}</p>
              </div>
              <div>
                <p>{incident.severity}</p>
                <IncidentStatusBadge status={incident.status} />
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
