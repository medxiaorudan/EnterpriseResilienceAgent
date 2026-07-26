import { Injectable, NotFoundException } from "@nestjs/common";
import type { AuthSession } from "@enterprise-resilience/contracts";
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

  async simulate(runbookId: string, actor: AuthSession, dryRun = false, targetService?: string) {
    const runbook = await this.getOne(runbookId);
    const adapter = this.cloudAdapters.getAdapter(runbook.cloudProvider);
    const target = targetService ?? runbook.approvedTargets[0] ?? "unknown-target";
    const simulation = await adapter.simulateRunbook({
      runbookId,
      targetService: target,
      environment: "production",
      dryRun
    });

    await this.store.recordAudit({
      actor: actor.userId,
      category: "execution",
      provider: runbook.cloudProvider,
      targetService: target,
      runbookId,
      summary: `Runbook simulation ${simulation.status}`,
      detail: simulation.summary
    });

    return simulation;
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
