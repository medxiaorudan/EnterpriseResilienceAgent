import { Module } from "@nestjs/common";
import { CloudAdaptersModule } from "../cloud-adapters/cloud-adapters.module.js";
import { IncidentsModule } from "../incidents/incidents.module.js";
import { ServicesModule } from "../services/services.module.js";
import { PlatformController } from "./platform.controller.js";
import { PlatformService } from "./platform.service.js";

@Module({
  imports: [CloudAdaptersModule, IncidentsModule, ServicesModule],
  controllers: [PlatformController],
  providers: [PlatformService]
})
export class PlatformModule {}
