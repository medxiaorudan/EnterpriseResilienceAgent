import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Roles } from "../auth/auth.decorators.js";
import { RunbooksService } from "./runbooks.service.js";

@Controller()
export class RunbooksController {
  constructor(private readonly runbooksService: RunbooksService) {}

  @Get("runbooks")
  list() {
    return this.runbooksService.list();
  }

  @Get("runbooks/:runbookId")
  getOne(@Param("runbookId") runbookId: string) {
    return this.runbooksService.getOne(runbookId);
  }

  @Post("runbooks/:runbookId/simulate")
  @Roles("engineer", "incident-manager")
  simulate(
    @Param("runbookId") runbookId: string,
    @Body() body: { dryRun?: boolean }
  ) {
    return this.runbooksService.simulate(runbookId, body?.dryRun);
  }

  @Post("runbooks/:runbookId/execute")
  @Roles("engineer", "incident-manager")
  execute(
    @Param("runbookId") runbookId: string,
    @Body() body: { incidentId?: string }
  ) {
    return this.runbooksService.execute(runbookId, body.incidentId);
  }

  @Get("executions/:executionId")
  @Roles("engineer", "incident-manager", "auditor")
  getExecution(@Param("executionId") executionId: string) {
    return {
      executionId,
      status: "not_implemented",
      summary: "Execution persistence is reserved for the next workflow slice."
    };
  }

  @Post("executions/:executionId/cancel")
  @Roles("engineer", "incident-manager")
  cancelExecution(@Param("executionId") executionId: string) {
    return {
      executionId,
      status: "cancel_requested"
    };
  }

  @Post("executions/:executionId/rollback")
  @Roles("engineer", "incident-manager")
  rollbackExecution(@Param("executionId") executionId: string) {
    return {
      executionId,
      status: "rollback_requested"
    };
  }
}
