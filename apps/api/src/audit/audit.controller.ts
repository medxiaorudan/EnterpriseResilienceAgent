import { Controller, Get, Param } from "@nestjs/common";
import { AuditService } from "./audit.service.js";

@Controller("audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get("events")
  listEvents() {
    return this.auditService.listEvents();
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
