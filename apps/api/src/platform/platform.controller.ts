import { Controller, Get } from "@nestjs/common";
import { PlatformService } from "./platform.service.js";

@Controller("platform")
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get("status")
  getStatus() {
    return this.platformService.getStatus();
  }
}
