import { Module } from "@nestjs/common";
import { CloudAdaptersModule } from "../cloud-adapters/cloud-adapters.module.js";
import { PlatformController } from "./platform.controller.js";
import { PlatformService } from "./platform.service.js";

@Module({
  imports: [CloudAdaptersModule],
  controllers: [PlatformController],
  providers: [PlatformService]
})
export class PlatformModule {}
