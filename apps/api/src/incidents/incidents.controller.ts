import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type { CreateIncidentInput } from "@enterprise-resilience/contracts";
import { IncidentsService } from "./incidents.service.js";

@Controller("incidents")
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  list() {
    return this.incidentsService.list();
  }

  @Post()
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
  approve(
    @Param("incidentId") incidentId: string,
    @Body() body: { actor?: string; comment?: string }
  ) {
    return this.incidentsService.approve(incidentId, body.actor ?? "service-owner", body.comment);
  }

  @Post(":incidentId/reject")
  reject(
    @Param("incidentId") incidentId: string,
    @Body() body: { actor?: string; comment?: string }
  ) {
    return this.incidentsService.reject(incidentId, body.actor ?? "service-owner", body.comment);
  }

  @Post(":incidentId/escalate")
  escalate(
    @Param("incidentId") incidentId: string,
    @Body() body: { actor?: string; comment?: string }
  ) {
    return this.incidentsService.escalate(incidentId, body.actor ?? "incident-manager", body.comment);
  }

  @Post(":incidentId/cancel")
  cancel(@Param("incidentId") incidentId: string) {
    return {
      incidentId,
      status: "cancel_requested"
    };
  }
}
