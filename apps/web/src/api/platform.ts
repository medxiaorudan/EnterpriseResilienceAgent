import type { PlatformStatusSummary } from "@enterprise-resilience/contracts";
import { apiRequest } from "./client.js";

export function getPlatformStatus() {
  return apiRequest<PlatformStatusSummary>("/platform/status");
}

export function rollbackPlatformTarget(provider: "aws" | "gcp", targetService: string) {
  return apiRequest(`/platform/targets/${provider}/${targetService}/rollback`, {
    method: "POST",
    body: JSON.stringify({})
  });
}
