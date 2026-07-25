import { useQuery } from "@tanstack/react-query";
import { Card } from "@enterprise-resilience/ui";
import { listServices } from "@/api/incidents.js";
import { HealthBadge } from "@/components/status-badge.js";

export function ServicesPage() {
  const servicesQuery = useQuery({
    queryKey: ["services"],
    queryFn: listServices
  });

  return (
    <div className="page-grid">
      <section className="page-header">
        <p className="eyebrow">Services</p>
        <h2>Cross-cloud service catalogue</h2>
      </section>

      <div className="two-column">
        {(servicesQuery.data ?? []).map((service) => (
          <Card key={service.serviceId} title={service.name} subtitle={`${service.cloudProvider.toUpperCase()} · ${service.businessJourney}`}>
            <div className="entry">
              <HealthBadge health={service.health.status} />
              <p>{service.health.summary}</p>
              <p>Owner: {service.ownerTeam}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
