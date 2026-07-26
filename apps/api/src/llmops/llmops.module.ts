import { Module } from "@nestjs/common";
import { LlmopsController } from "./llmops.controller.js";
import { LlmopsService } from "./llmops.service.js";

@Module({
  controllers: [LlmopsController],
  providers: [LlmopsService]
})
export class LlmopsModule {}
