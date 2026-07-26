import { useQuery } from "@tanstack/react-query";
import { Badge, Card, Stat } from "@enterprise-resilience/ui";
import { getPlatformStatus } from "@/api/platform.js";

function componentTone(status: "ready" | "configuration-needed" | "disabled") {
  if (status === "ready") {
    return "good" as const;
  }

  if (status === "configuration-needed") {
    return "warning" as const;
  }

  return "default" as const;
}

export function PlatformPage() {
  const platformQuery = useQuery({
    queryKey: ["platform-status"],
    queryFn: getPlatformStatus
  });

  const platform = platformQuery.data;
  const components = platform?.components ?? [];
  const providerTargets = platform?.providerTargets ?? [];
  const cloudComponents = components.filter((component) => component.kind === "cloud-adapter");
  const readyCount = components.filter((component) => component.status === "ready").length;
  const liveProviderCount = cloudComponents.filter((component) => component.status === "ready").length;

  return (
    <div className="page-grid">
      <section className="page-header">
        <p className="eyebrow">Platform</p>
        <h2>Deployment, access, and operational entry points</h2>
        <p>
          This page shows where non-technical users should start, which runtime components are configured, and what
          still needs to be connected before live production execution.
        </p>
      </section>

      <div className="stats-grid">
        <Card>
          <Stat label="Ready components" value={String(readyCount)} hint="Configured and available now" />
        </Card>
        <Card>
          <Stat label="Deployment mode" value={platform?.deploymentMode ?? "loading"} hint="Local, container, or cloud-ready" />
        </Card>
        <Card>
          <Stat label="Environment" value={platform?.environmentName ?? "loading"} hint="Runtime label shown to operators" />
        </Card>
        <Card>
          <Stat label="API base path" value={platform?.apiBasePath ?? "/api"} hint="Integration entry point" />
        </Card>
        <Card>
          <Stat label="Live cloud lanes" value={String(liveProviderCount)} hint="Providers enabled for bounded execution" />
        </Card>
      </div>

      <div className="two-column">
        <Card title="Where people should go" subtitle="Simple entry points by audience">
          <div className="stack">
            {(platform?.accessLinks ?? []).map((link) => (
              <div key={link.label} className="row-card">
                <div>
                  <strong>{link.label}</strong>
                  <p>{link.summary}</p>
                  <p className="muted">
                    {link.audience} · {link.path}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="What is connected" subtitle="Runtime and cloud control status">
          <div className="stack">
            {components.map((component) => (
              <div key={component.name} className="row-card">
                <div>
                  <strong>{component.name}</strong>
                  <p>{component.summary}</p>
                  {component.url ? <p className="muted">{component.url}</p> : null}
                </div>
                <Badge tone={componentTone(component.status)}>{component.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Approved provider targets" subtitle="Which cloud lanes are ready and what each lane is allowed to touch">
        <div className="provider-grid">
          {cloudComponents.map((component) => {
            const providerName = component.name.startsWith("AWS") ? "aws" : "gcp";
            const targets = providerTargets.filter((target) => target.provider === providerName);

            return (
              <div key={component.name} className="provider-card">
                <div className="provider-card-header">
                  <div>
                    <p className="eyebrow">{providerName.toUpperCase()}</p>
                    <strong>{component.name}</strong>
                    <p>{component.summary}</p>
                  </div>
                  <Badge tone={componentTone(component.status)}>{component.status}</Badge>
                </div>
                <div className="stack">
                  {targets.map((target) => (
                    <div key={`${target.provider}-${target.targetService}`} className="target-card">
                      <div className="provider-chip-row">
                        <span className="provider-chip">{target.targetService}</span>
                        <span className="provider-chip provider-chip-muted">{target.executionMode}</span>
                      </div>
                      <p>{target.summary}</p>
                      <p className="muted">
                        {target.environment} · {target.region ?? "managed region"} · {target.runbookId ?? "registered runbook"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Deployment checklist" subtitle="Recommended next actions before production rollout">
        <div className="stack">
          {(platform?.nextSteps ?? []).map((step) => (
            <div key={step} className="row-card">
              <div>
                <strong>{step}</strong>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
