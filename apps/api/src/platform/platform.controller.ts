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

  @Post("targets/:provider/:targetService/acknowledge-alert")
  @Roles("engineer", "incident-manager")
  acknowledgeAlert(
    @Param("provider") provider: CloudProvider,
    @Param("targetService") targetService: string,
    @CurrentSession() session: AuthSession
  ) {
    return this.platformService.acknowledgeAlert(provider, targetService, session);
  }

  @Post("targets/:provider/:targetService/open-incident")
  @Roles("engineer", "incident-manager")
  openIncidentFromAlert(
    @Param("provider") provider: CloudProvider,
    @Param("targetService") targetService: string,
    @CurrentSession() session: AuthSession
  ) {
    return this.platformService.openIncidentFromAlert(provider, targetService, session);
  }
}
