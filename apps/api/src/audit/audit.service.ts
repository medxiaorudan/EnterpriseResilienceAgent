import { Injectable } from "@nestjs/common";
import { StoreService } from "../common/store.service.js";

@Injectable()
export class AuditService {
  constructor(private readonly store: StoreService) {}

  listEvents() {
    return this.store.listAuditEvents();
  }

  listIncidentEvents(incidentId: string) {
    return this.store.listAuditEventsForIncident(incidentId);
  }

  listExecutionEvents(executionId: string) {
    return this.store.listAuditEventsForExecution(executionId);
  }
}
