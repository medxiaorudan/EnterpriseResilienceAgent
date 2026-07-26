import { Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentSession, Roles } from "../auth/auth.decorators.js";
import type { AuthSession, CloudProvider } from "@enterprise-resilience/contracts";
import { PlatformService } from "./platform.service.js";

@Controller("platform")
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get("status")
  getStatus() {
    return this.platformService.getStatus();
  }

  @Post("targets/:provider/:targetService/rollback")
  @Roles("engineer", "incident-manager")
  rollbackTarget(
    @Param("provider") provider: CloudProvider,
    @Param("targetService") targetService: string,
    @CurrentSession() session: AuthSession
  ) {
    return this.platformService.rollbackTarget(provider, targetService, session);
  }
}
