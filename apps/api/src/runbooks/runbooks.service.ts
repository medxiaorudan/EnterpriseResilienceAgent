import { Injectable, NotFoundException } from "@nestjs/common";
import { StoreService } from "../common/store.service.js";

@Injectable()
export class RunbooksService {
  constructor(private readonly store: StoreService) {}

  list() {
    return this.store.listRunbooks();
  }

  async getOne(runbookId: string) {
    const runbook = await this.store.getRunbook(runbookId);
    if (!runbook) {
      throw new NotFoundException(`Runbook ${runbookId} not found.`);
    }
    return runbook;
  }

  async simulate(runbookId: string) {
    const runbook = await this.getOne(runbookId);
    return {
      runbookId,
      simulation: "passed",
      summary: `${runbook.title} is within policy for approved targets ${runbook.approvedTargets.join(", ")}.`
    };
  }

  async execute(runbookId: string, incidentId?: string) {
    const runbook = await this.getOne(runbookId);
    return {
      runbookId,
      incidentId,
      status: "queued",
      summary: `${runbook.title} queued for deterministic execution.`
    };
  }
}
