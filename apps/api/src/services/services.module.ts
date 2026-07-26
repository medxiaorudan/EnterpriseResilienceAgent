import { Module } from "@nestjs/common";
import { CloudAdaptersModule } from "../cloud-adapters/cloud-adapters.module.js";
import { ServicesController } from "./services.controller.js";
import { ServicesService } from "./services.service.js";

@Module({
  imports: [CloudAdaptersModule],
  controllers: [ServicesController],
  providers: [ServicesService]
})
export class ServicesModule {}
