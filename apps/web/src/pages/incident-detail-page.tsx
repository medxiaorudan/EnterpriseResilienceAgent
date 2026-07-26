import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Card } from "@enterprise-resilience/ui";
import { approveIncident, escalateIncident, getIncident, rejectIncident } from "@/api/incidents.js";
import { IncidentStatusBadge } from "@/components/status-badge.js";
import { useEventStream } from "@/features/events/use-event-stream.js";

export function IncidentDetailPage() {
  const { incidentId = "" } = useParams();
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<string[]>([]);

  const incidentQuery = useQuery({
    queryKey: ["incident", incidentId],
    queryFn: () => getIncident(incidentId),
    enabled: Boolean(incidentId)
  });

  useEventStream((event) => {
    if (event.incidentId !== incidentId) {
      return;
    }
    setEvents((current) => [`${event.eventType} at ${new Date(event.timestamp).toLocaleTimeString()}`, ...current].slice(0, 6));
    void queryClient.invalidateQueries({
      queryKey: ["incident", incidentId]
    });
    void queryClient.invalidateQueries({
      queryKey: ["incidents"]
    });
  });

  const approveMutation = useMutation({
    mutationFn: () => approveIncident(incidentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
    }
  });
  const rejectMutation = useMutation({
    mutationFn: () => rejectIncident(incidentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
    }
  });
  const escalateMutation = useMutation({
    mutationFn: () => escalateIncident(incidentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
    }
  });

  const incident = incidentQuery.data;
  const primaryProposal = useMemo(() => incident?.proposals[0], [incident]);
  const mutationError =
    approveMutation.error?.message ?? rejectMutation.error?.message ?? escalateMutation.error?.message;

  if (!incident) {
    return <div className="page-grid">Loading incident...</div>;
  }

  return (
    <div className="page-grid">
      <section className="page-header">
        <p className="eyebrow">{incident.incidentId}</p>
        <h2>{incident.title}</h2>
        <p>{incident.businessImpact}</p>
        <IncidentStatusBadge status={incident.status} />
      </section>

      <div className="two-column">
        <Card title="Business impact" subtitle={incident.customerImpact}>
          <p>{incident.confidenceSummary}</p>
          {primaryProposal ? (
            <div className="action-panel">
              <h4>Recommended action</h4>
              <p>{primaryProposal.reason}</p>
              <p>
                Expected result: <strong>{primaryProposal.expectedResult}</strong>
              </p>
              <p>
                Cost: ${primaryProposal.estimatedCostPerHour?.toFixed(2)}/hour · Risk: {primaryProposal.riskLevel}
              </p>
            </div>
          ) : null}
        </Card>

        <Card title="Live event stream" subtitle="Recent SSE updates">
          <div className="stack">
            {events.length === 0 ? <p>No live events yet.</p> : events.map((event) => <p key={event}>{event}</p>)}
          </div>
        </Card>
      </div>

      <div className="three-column">
        <Card title="Evidence">
          <div className="stack">
            {incident.evidence.map((item) => (
              <div key={item.evidenceId} className="entry">
                <strong>{item.summary}</strong>
                <p>{item.details}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Hypotheses">
          <div className="stack">
            {incident.hypotheses.map((item) => (
              <div key={item.cause} className="entry">
                <strong>{item.cause}</strong>
                <p>{item.confidenceReason}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Timeline">
          <div className="stack">
            {incident.timeline.map((item) => (
              <div key={item.eventId} className="entry">
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Approval controls" subtitle="Only deterministic registered runbooks may execute">
        <div className="actions-row">
          <button className="primary-button" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
            Approve action
          </button>
          <button className="secondary-button" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
            Reject
          </button>
          <button className="secondary-button" onClick={() => escalateMutation.mutate()} disabled={escalateMutation.isPending}>
            Escalate
          </button>
        </div>
        {mutationError ? (
          <div className="verification-box verification-box-warning">
            <strong>Action blocked</strong>
            <p>{mutationError}</p>
          </div>
        ) : null}
        {incident.latestVerification ? (
          <div className="verification-box">
            <strong>{incident.latestVerification.outcome}</strong>
            <p>{incident.latestVerification.summary}</p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
