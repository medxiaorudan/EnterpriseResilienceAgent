import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@enterprise-resilience/ui";
import { listAuditEvents } from "@/api/incidents.js";

export function AuditPage() {
  const [providerFilter, setProviderFilter] = useState<"all" | "aws" | "gcp">("all");
  const auditQuery = useQuery({
    queryKey: ["audit-events", providerFilter],
    queryFn: () => listAuditEvents(providerFilter === "all" ? undefined : providerFilter)
  });

  return (
    <div className="page-grid">
      <section className="page-header">
        <p className="eyebrow">Audit</p>
        <h2>Deterministic decisions and recovery records</h2>
      </section>

      <Card title="Audit history" subtitle="Filter by cloud provider when you need to explain one execution lane">
        <div className="filter-row">
          <label className="field-label" htmlFor="audit-provider-filter">
            Provider
          </label>
          <select
            id="audit-provider-filter"
            className="session-select audit-filter"
            value={providerFilter}
            onChange={(event) => setProviderFilter(event.target.value as "all" | "aws" | "gcp")}
          >
            <option value="all">All providers</option>
            <option value="aws">AWS only</option>
            <option value="gcp">GCP only</option>
          </select>
        </div>
        <div className="stack">
          {(auditQuery.data ?? []).map((event) => (
            <div key={event.auditId} className="entry">
              <strong>{event.summary}</strong>
              <p>{event.detail}</p>
              <span className="muted">
                {event.provider ? `${event.provider.toUpperCase()} · ` : ""}
                {event.targetService ? `${event.targetService} · ` : ""}
                {event.actor} · {new Date(event.timestamp).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
