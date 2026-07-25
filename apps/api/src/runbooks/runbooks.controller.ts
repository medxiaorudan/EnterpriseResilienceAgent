import { Body, Controller, Get, Param, Post } from "@nestjs/common";
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
  simulate(@Param("runbookId") runbookId: string) {
    return this.runbooksService.simulate(runbookId);
  }

  @Post("runbooks/:runbookId/execute")
  execute(
    @Param("runbookId") runbookId: string,
    @Body() body: { incidentId?: string }
  ) {
    return this.runbooksService.execute(runbookId, body.incidentId);
  }

  @Get("executions/:executionId")
  getExecution(@Param("executionId") executionId: string) {
    return {
      executionId,
      status: "not_implemented",
      summary: "Execution persistence is reserved for the next workflow slice."
    };
  }

  @Post("executions/:executionId/cancel")
  cancelExecution(@Param("executionId") executionId: string) {
    return {
      executionId,
      status: "cancel_requested"
    };
  }

  @Post("executions/:executionId/rollback")
  rollbackExecution(@Param("executionId") executionId: string) {
    return {
      executionId,
      status: "rollback_requested"
    };
  }
}
