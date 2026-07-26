import { Controller, Get } from "@nestjs/common";
import { LlmopsService } from "./llmops.service.js";

@Controller("llmops")
export class LlmopsController {
  constructor(private readonly llmopsService: LlmopsService) {}

  @Get("profile")
  getProfile() {
    return this.llmopsService.getCapabilityProfile();
  }

  @Get("providers")
  listProviders() {
    return this.llmopsService.listProviders();
  }

  @Get("tool-layer-fit")
  getToolLayerFit() {
    return this.llmopsService.getToolLayerFit();
  }
}
