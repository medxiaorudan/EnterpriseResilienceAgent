import { Module } from "@nestjs/common";
import { AuditModule } from "./audit/audit.module.js";
import { CommonModule } from "./common/common.module.js";
import { EventsModule } from "./events/events.module.js";
import { IncidentsModule } from "./incidents/incidents.module.js";
import { MlopsModule } from "./mlops/mlops.module.js";
import { RunbooksModule } from "./runbooks/runbooks.module.js";
import { ServicesModule } from "./services/services.module.js";

@Module({
  imports: [
    CommonModule,
    EventsModule,
    IncidentsModule,
    ServicesModule,
    RunbooksModule,
    AuditModule,
    MlopsModule
  ]
})
export class AppModule {}
