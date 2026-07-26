import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type { CreateIncidentInput } from "@enterprise-resilience/contracts";
import { CurrentSession, Roles } from "../auth/auth.decorators.js";
import type { AuthSession } from "@enterprise-resilience/contracts";
import { IncidentsService } from "./incidents.service.js";

@Controller("incidents")
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  list() {
    return this.incidentsService.list();
  }

  @Post()
  @Roles("engineer", "incident-manager")
  create(@Body() body: CreateIncidentInput) {
    return this.incidentsService.create(body);
  }

  @Get(":incidentId")
  getOne(@Param("incidentId") incidentId: string) {
    return this.incidentsService.getOne(incidentId);
  }

  @Get(":incidentId/timeline")
  getTimeline(@Param("incidentId") incidentId: string) {
    return this.incidentsService.getTimeline(incidentId);
  }

  @Get(":incidentId/evidence")
  getEvidence(@Param("incidentId") incidentId: string) {
    return this.incidentsService.getEvidence(incidentId);
  }

  @Get(":incidentId/hypotheses")
  getHypotheses(@Param("incidentId") incidentId: string) {
    return this.incidentsService.getHypotheses(incidentId);
  }

  @Get(":incidentId/actions")
  getActions(@Param("incidentId") incidentId: string) {
    return this.incidentsService.getActions(incidentId);
  }

  @Post(":incidentId/approve")
  @Roles("business-approver", "incident-manager")
  approve(
    @Param("incidentId") incidentId: string,
    @Body() body: { actor?: string; comment?: string; idempotencyKey?: string; dryRun?: boolean },
    @CurrentSession() session: AuthSession
  ) {
    return this.incidentsService.approve(
      incidentId,
      body.actor ?? session.displayName,
      body.comment,
      body.idempotencyKey,
      body.dryRun
    );
  }

  @Post(":incidentId/reject")
  @Roles("business-approver", "incident-manager")
  reject(
    @Param("incidentId") incidentId: string,
    @Body() body: { actor?: string; comment?: string },
    @CurrentSession() session: AuthSession
  ) {
    return this.incidentsService.reject(incidentId, body.actor ?? session.displayName, body.comment);
  }

  @Post(":incidentId/escalate")
  @Roles("incident-manager")
  escalate(
    @Param("incidentId") incidentId: string,
    @Body() body: { actor?: string; comment?: string },
    @CurrentSession() session: AuthSession
  ) {
    return this.incidentsService.escalate(incidentId, body.actor ?? session.displayName, body.comment);
  }

  @Post(":incidentId/cancel")
  cancel(@Param("incidentId") incidentId: string) {
    return {
      incidentId,
      status: "cancel_requested"
    };
  }
}
