import { useQuery } from "@tanstack/react-query";
import { Card } from "@enterprise-resilience/ui";
import { listAuditEvents } from "@/api/incidents.js";

export function AuditPage() {
  const auditQuery = useQuery({
    queryKey: ["audit-events"],
    queryFn: listAuditEvents
  });

  return (
    <div className="page-grid">
      <section className="page-header">
        <p className="eyebrow">Audit</p>
        <h2>Deterministic decisions and recovery records</h2>
      </section>

      <Card>
        <div className="stack">
          {(auditQuery.data ?? []).map((event) => (
            <div key={event.auditId} className="entry">
              <strong>{event.summary}</strong>
              <p>{event.detail}</p>
              <span className="muted">
                {event.actor} · {new Date(event.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
