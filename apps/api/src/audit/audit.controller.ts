import { Controller, Get, Param, Query } from "@nestjs/common";
import type { CloudProvider } from "@enterprise-resilience/contracts";
import { Roles } from "../auth/auth.decorators.js";
import { AuditService } from "./audit.service.js";

@Controller("audit")
@Roles("auditor", "engineer", "incident-manager")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get("events")
  listEvents(@Query("provider") provider?: CloudProvider) {
    return this.auditService.listEvents(provider);
  }

  @Get("incidents/:incidentId")
  listIncidentEvents(@Param("incidentId") incidentId: string) {
    return this.auditService.listIncidentEvents(incidentId);
  }

  @Get("executions/:executionId")
  listExecutionEvents(@Param("executionId") executionId: string) {
    return this.auditService.listExecutionEvents(executionId);
  }
}
