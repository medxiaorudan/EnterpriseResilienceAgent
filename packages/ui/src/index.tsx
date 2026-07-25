import type { PropsWithChildren } from "react";

export function Card(props: PropsWithChildren<{ title?: string; subtitle?: string; className?: string }>) {
  return (
    <section className={`era-card ${props.className ?? ""}`.trim()}>
      {props.title ? <h3 className="era-card-title">{props.title}</h3> : null}
      {props.subtitle ? <p className="era-card-subtitle">{props.subtitle}</p> : null}
      {props.children}
    </section>
  );
}

export function Badge(props: PropsWithChildren<{ tone?: "default" | "good" | "warning" | "danger" }>) {
  const tone = props.tone ?? "default";
  return <span className={`era-badge era-badge-${tone}`}>{props.children}</span>;
}

export function Stat(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="era-stat">
      <span className="era-stat-label">{props.label}</span>
      <strong className="era-stat-value">{props.value}</strong>
      {props.hint ? <span className="era-stat-hint">{props.hint}</span> : null}
    </div>
  );
}
