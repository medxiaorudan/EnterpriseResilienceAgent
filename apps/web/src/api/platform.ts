import type { PlatformStatusSummary } from "@enterprise-resilience/contracts";
import { apiRequest } from "./client.js";

export function getPlatformStatus() {
  return apiRequest<PlatformStatusSummary>("/platform/status");
}
