import { Injectable, NotFoundException } from "@nestjs/common";
import { CloudAdaptersService } from "../cloud-adapters/cloud-adapters.service.js";
import { StoreService } from "../common/store.service.js";

@Injectable()
export class RunbooksService {
  constructor(
    private readonly store: StoreService,
    private readonly cloudAdapters: CloudAdaptersService
  ) {}

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

  async simulate(runbookId: string, dryRun = false) {
    const runbook = await this.getOne(runbookId);
    const adapter = this.cloudAdapters.getAdapter(runbook.cloudProvider);
    return adapter.simulateRunbook({
      runbookId,
      targetService: runbook.approvedTargets[0] ?? "unknown-target",
      environment: "production",
      dryRun
    });
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
