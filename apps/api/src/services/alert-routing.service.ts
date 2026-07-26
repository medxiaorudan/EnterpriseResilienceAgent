import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
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

  async listRuntimeChannelConfigs() {
    const configs = this.getChannelConfigs();
    const storedStates = await this.store.listAlertChannelStates();
    const stateByChannel = new Map(storedStates.map((record) => [record.channelName, record]));

    return configs.map((channel) => {
      const stored = stateByChannel.get(channel.name);
      const mutedUntil = stored?.mutedUntil;

      return {
        ...channel,
        enabled: stored?.enabled ?? true,
        mutedUntil
      };
    });
  }

  getRetryCount() {
    return Number(process.env.ALERT_WEBHOOK_RETRY_COUNT ?? "1");
  }

  async setChannelEnabled(channelName: string, enabled: boolean) {
    const channel = this.getChannelConfigs().find((item) => item.name === channelName);
    if (!channel) {
      throw new NotFoundException(`Alert channel ${channelName} is not configured.`);
    }

    const existing = await this.store.getAlertChannelState(channelName);
    const record = {
      channelName,
      enabled,
      mutedUntil: existing?.mutedUntil,
      updatedAt: new Date().toISOString()
    };
    return this.store.saveAlertChannelState(record);
  }

  async muteChannel(channelName: string, durationMinutes = 60) {
    const channel = this.getChannelConfigs().find((item) => item.name === channelName);
    if (!channel) {
      throw new NotFoundException(`Alert channel ${channelName} is not configured.`);
    }

    const existing = await this.store.getAlertChannelState(channelName);
    const mutedUntil = new Date(Date.now() + durationMinutes * 60000).toISOString();
    return this.store.saveAlertChannelState({
      channelName,
      enabled: existing?.enabled ?? true,
      mutedUntil,
      updatedAt: new Date().toISOString()
    });
  }

  async unmuteChannel(channelName: string) {
    const channel = this.getChannelConfigs().find((item) => item.name === channelName);
    if (!channel) {
      throw new NotFoundException(`Alert channel ${channelName} is not configured.`);
    }

    const existing = await this.store.getAlertChannelState(channelName);
    return this.store.saveAlertChannelState({
      channelName,
      enabled: existing?.enabled ?? true,
      updatedAt: new Date().toISOString()
    });
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
    const channels = await this.listRuntimeChannelConfigs();
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
      if (channel.enabled === false) {
        await this.store.recordAudit({
          actor: "alert-router",
          provider: input.provider,
          targetService: input.targetService,
          incidentId: input.incidentId,
          category: "policy",
          summary: "Target alert notification skipped",
          detail: `channel=${channel.name}; eventType=${input.eventType}; Channel is disabled, so notification was skipped for ${input.targetService}.`
        });
        continue;
      }

      if (channel.mutedUntil && new Date(channel.mutedUntil).getTime() > Date.now()) {
        await this.store.recordAudit({
          actor: "alert-router",
          provider: input.provider,
          targetService: input.targetService,
          incidentId: input.incidentId,
          category: "policy",
          summary: "Target alert notification skipped",
          detail: `channel=${channel.name}; eventType=${input.eventType}; Channel is muted until ${channel.mutedUntil}, so notification was skipped for ${input.targetService}.`
        });
        continue;
      }

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
            await this.store.createAlertDeadLetter({
              deadLetterId: randomUUID(),
              channelName: channel.name,
              provider: input.provider,
              targetService: input.targetService,
              eventType: input.eventType,
              payloadSummary: input.summary,
              error: lastError,
              createdAt: new Date().toISOString()
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
