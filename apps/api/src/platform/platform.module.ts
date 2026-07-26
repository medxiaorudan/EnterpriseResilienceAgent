import { Module } from "@nestjs/common";
import { CloudAdaptersModule } from "../cloud-adapters/cloud-adapters.module.js";
import { IncidentsModule } from "../incidents/incidents.module.js";
import { PlatformController } from "./platform.controller.js";
import { PlatformService } from "./platform.service.js";

@Module({
  imports: [CloudAdaptersModule, IncidentsModule],
  controllers: [PlatformController],
  providers: [PlatformService]
})
export class PlatformModule {}
