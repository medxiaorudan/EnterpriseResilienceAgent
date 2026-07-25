import { Module } from "@nestjs/common";
import { RunbooksController } from "./runbooks.controller.js";
import { RunbooksService } from "./runbooks.service.js";

@Module({
  controllers: [RunbooksController],
  providers: [RunbooksService]
})
export class RunbooksModule {}
