import { Controller, Get } from "@nestjs/common";
import { MlopsService } from "./mlops.service.js";

@Controller("mlops")
export class MlopsController {
  constructor(private readonly mlopsService: MlopsService) {}

  @Get("profile")
  getProfile() {
    return this.mlopsService.getCapabilityProfile();
  }

  @Get("frameworks")
  listFrameworks() {
    return this.mlopsService.listFrameworks();
  }
}
