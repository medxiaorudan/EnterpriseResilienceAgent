import { Injectable, NotFoundException } from "@nestjs/common";
import { StoreService } from "../common/store.service.js";

@Injectable()
export class RunbooksService {
  constructor(private readonly store: StoreService) {}

  list() {
    return this.store.listRunbooks();
  }

  getOne(runbookId: string) {
    const runbook = this.store.getRunbook(runbookId);
    if (!runbook) {
      throw new NotFoundException(`Runbook ${runbookId} not found.`);
    }
    return runbook;
  }

  simulate(runbookId: string) {
    const runbook = this.getOne(runbookId);
    return {
      runbookId,
      simulation: "passed",
      summary: `${runbook.title} is within policy for approved targets ${runbook.approvedTargets.join(", ")}.`
    };
  }

  execute(runbookId: string, incidentId?: string) {
    const runbook = this.getOne(runbookId);
    return {
      runbookId,
      incidentId,
      status: "queued",
      summary: `${runbook.title} queued for deterministic execution.`
    };
  }
}
