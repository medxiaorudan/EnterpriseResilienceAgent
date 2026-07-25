import { Module } from "@nestjs/common";
import { CloudAdaptersModule } from "../cloud-adapters/cloud-adapters.module.js";
import { RunbooksController } from "./runbooks.controller.js";
import { RunbooksService } from "./runbooks.service.js";

@Module({
  imports: [CloudAdaptersModule],
  controllers: [RunbooksController],
  providers: [RunbooksService]
})
export class RunbooksModule {}
