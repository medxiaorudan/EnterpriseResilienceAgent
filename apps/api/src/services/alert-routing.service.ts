import { Injectable, Logger } from "@nestjs/common";
import type { CloudProvider } from "@enterprise-resilience/contracts";
import { StoreService } from "../common/store.service.js";

type AlertChannelConfig = {
  name: string;
  url?: string;
  deliveryMode: "webhook" | "audit-only";
  configured: boolean;
};

@Injectable()
export class AlertRoutingService {
  private readonly logger = new Logger(AlertRoutingService.name);

  constructor(private readonly store: StoreService) {}

  getChannelConfigs(): AlertChannelConfig[] {
    const legacy = process.env.ALERT_WEBHOOK_URL?.trim();
    const additional = (process.env.ALERT_WEBHOOK_URLS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const urls = [legacy, ...additional].filter(Boolean) as string[];

    if (urls.length === 0) {
      return [
        {
          name: "audit-only",
          deliveryMode: "audit-only",
          configured: false
        }
      ];
    }

    return urls.map((url, index) => ({
      name: index === 0 ? "primary-webhook" : `webhook-${index + 1}`,
      url,
      deliveryMode: "webhook",
      configured: true
    }));
  }

  getRetryCount() {
    return Number(process.env.ALERT_WEBHOOK_RETRY_COUNT ?? "1");
  }

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
    const channels = this.getChannelConfigs();
    const retryCount = this.getRetryCount();
    const timestamp = new Date().toISOString();
    const payload = {
      kind: "target-alert",
      timestamp,
      ...input
    };

    if (channels[0]?.deliveryMode === "audit-only") {
      await this.store.recordAudit({
        actor: "alert-router",
        provider: input.provider,
        targetService: input.targetService,
        incidentId: input.incidentId,
        category: "policy",
        summary: "Target alert notification skipped",
        detail: `channel=audit-only; eventType=${input.eventType}; No webhook is configured. Notification retained in audit only for ${input.targetService}.`
      });
      return { delivered: false, channel: "audit-only" as const };
    }

    let delivered = false;
    for (const channel of channels) {
      if (!channel.url) {
        continue;
      }

      let lastError: string | undefined;
      for (let attempt = 1; attempt <= retryCount + 1; attempt += 1) {
        try {
          const response = await fetch(channel.url, {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              ...payload,
              channel: channel.name,
              attempt
            })
          });

          if (!response.ok) {
            throw new Error(`Webhook returned ${response.status}`);
          }

          delivered = true;
          await this.store.recordAudit({
            actor: "alert-router",
            provider: input.provider,
            targetService: input.targetService,
            incidentId: input.incidentId,
            category: "policy",
            summary: "Target alert notification sent",
            detail: `channel=${channel.name}; eventType=${input.eventType}; attempt=${attempt}; notification delivered for ${input.targetService}.`
          });
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : "unknown error";
          if (attempt > retryCount) {
            this.logger.error("Alert webhook delivery failed", error instanceof Error ? error.stack : undefined);
            await this.store.recordAudit({
              actor: "alert-router",
              provider: input.provider,
              targetService: input.targetService,
              incidentId: input.incidentId,
              category: "policy",
              summary: "Target alert notification failed",
              detail: `channel=${channel.name}; eventType=${input.eventType}; attempts=${retryCount + 1}; notification failed for ${input.targetService}: ${lastError}.`
            });
          }
        }
      }

      if (!delivered && lastError) {
        continue;
      }
    }

    return {
      delivered,
      channel: channels.length > 1 ? ("multi-webhook" as const) : ("webhook" as const)
    };
  }
}
