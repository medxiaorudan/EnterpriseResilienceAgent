import { Injectable, Logger } from "@nestjs/common";
import type { CloudProvider } from "@enterprise-resilience/contracts";
import { StoreService } from "../common/store.service.js";

@Injectable()
export class AlertRoutingService {
  private readonly logger = new Logger(AlertRoutingService.name);

  constructor(private readonly store: StoreService) {}

  async route(input: {
    provider: CloudProvider;
    targetService: string;
    state: "warning" | "breached" | "normal";
    summary: string;
    incidentId?: string;
    eventType:
      | "state-changed"
      | "recovered"
      | "acknowledged"
      | "incident-opened"
      | "auto-escalated";
  }) {
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    const timestamp = new Date().toISOString();
    const payload = {
      kind: "target-alert",
      timestamp,
      ...input
    };

    if (!webhookUrl) {
      await this.store.recordAudit({
        actor: "alert-router",
        provider: input.provider,
        targetService: input.targetService,
        incidentId: input.incidentId,
        category: "policy",
        summary: "Target alert notification skipped",
        detail: `No ALERT_WEBHOOK_URL configured. ${input.eventType} notification retained in audit only for ${input.targetService}.`
      });
      return { delivered: false, channel: "audit-only" as const };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      await this.store.recordAudit({
        actor: "alert-router",
        provider: input.provider,
        targetService: input.targetService,
        incidentId: input.incidentId,
        category: "policy",
        summary: "Target alert notification sent",
        detail: `${input.eventType} notification delivered to configured webhook for ${input.targetService}.`
      });
      return { delivered: true, channel: "webhook" as const };
    } catch (error) {
      this.logger.error("Alert webhook delivery failed", error instanceof Error ? error.stack : undefined);
      await this.store.recordAudit({
        actor: "alert-router",
        provider: input.provider,
        targetService: input.targetService,
        incidentId: input.incidentId,
        category: "policy",
        summary: "Target alert notification failed",
        detail: `${input.eventType} notification failed for ${input.targetService}: ${error instanceof Error ? error.message : "unknown error"}.`
      });
      return { delivered: false, channel: "webhook-failed" as const };
    }
  }
}
