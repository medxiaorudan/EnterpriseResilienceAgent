import { Module } from "@nestjs/common";
import { CloudAdaptersModule } from "../cloud-adapters/cloud-adapters.module.js";
import { IncidentsModule } from "../incidents/incidents.module.js";
import { AlertRoutingService } from "./alert-routing.service.js";
import { MetricsCollectorService } from "./metrics-collector.service.js";
import { ServicesController } from "./services.controller.js";
import { ServicesService } from "./services.service.js";

@Module({
  imports: [CloudAdaptersModule, IncidentsModule],
  controllers: [ServicesController],
  providers: [ServicesService, MetricsCollectorService, AlertRoutingService],
  exports: [AlertRoutingService]
})
export class ServicesModule {}
