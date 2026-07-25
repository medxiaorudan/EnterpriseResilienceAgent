import { Module } from "@nestjs/common";
import { MlopsController } from "./mlops.controller.js";
import { MlopsService } from "./mlops.service.js";

@Module({
  controllers: [MlopsController],
  providers: [MlopsService]
})
export class MlopsModule {}
