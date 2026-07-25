import { useQuery } from "@tanstack/react-query";
import { Card } from "@enterprise-resilience/ui";
import { listRunbooks } from "@/api/incidents.js";

export function RunbooksPage() {
  const runbooksQuery = useQuery({
    queryKey: ["runbooks"],
    queryFn: listRunbooks
  });

  return (
    <div className="page-grid">
      <section className="page-header">
        <p className="eyebrow">Runbooks</p>
        <h2>Registered deterministic recovery procedures</h2>
      </section>

      <div className="two-column">
        {(runbooksQuery.data ?? []).map((runbook) => (
          <Card key={runbook.runbookId} title={runbook.title} subtitle={`${runbook.cloudProvider.toUpperCase()} · v${runbook.version}`}>
            <div className="stack">
              <p>{runbook.description}</p>
              <p>Owner: {runbook.owner}</p>
              <p>Risk: {runbook.riskLevel}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
