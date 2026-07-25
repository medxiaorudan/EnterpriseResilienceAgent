import { Module } from "@nestjs/common";
import { CloudAdaptersModule } from "../cloud-adapters/cloud-adapters.module.js";
import { EventsModule } from "../events/events.module.js";
import { IncidentsController } from "./incidents.controller.js";
import { IncidentsService } from "./incidents.service.js";

@Module({
  imports: [CloudAdaptersModule, EventsModule],
  controllers: [IncidentsController],
  providers: [IncidentsService]
})
export class IncidentsModule {}
