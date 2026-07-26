import { Body, Controller, Get, Param, Post } from "@nestjs/common";
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

  @Get("targets/:provider/:targetService/alert-history")
  @Roles("viewer", "business-approver", "incident-manager", "engineer", "auditor", "admin")
  getAlertHistory(
    @Param("provider") provider: CloudProvider,
    @Param("targetService") targetService: string
  ) {
    return this.platformService.getAlertHistory(provider, targetService);
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

  @Post("alert-routing/channels/:channelName/enable")
  @Roles("admin")
  enableAlertChannel(@Param("channelName") channelName: string) {
    return this.platformService.enableAlertChannel(channelName);
  }

  @Post("alert-routing/channels/:channelName/disable")
  @Roles("admin")
  disableAlertChannel(@Param("channelName") channelName: string) {
    return this.platformService.disableAlertChannel(channelName);
  }

  @Post("alert-routing/channels/:channelName/mute")
  @Roles("admin")
  muteAlertChannel(
    @Param("channelName") channelName: string,
    @Body() body: { durationMinutes?: number }
  ) {
    return this.platformService.muteAlertChannel(channelName, body.durationMinutes);
  }

  @Post("alert-routing/channels/:channelName/unmute")
  @Roles("admin")
  unmuteAlertChannel(@Param("channelName") channelName: string) {
    return this.platformService.unmuteAlertChannel(channelName);
  }
}
