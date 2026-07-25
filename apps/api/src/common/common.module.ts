import { Global, Module } from "@nestjs/common";
import { PostgresService } from "./postgres.service.js";
import { StoreService } from "./store.service.js";

@Global()
@Module({
  providers: [PostgresService, StoreService],
  exports: [PostgresService, StoreService]
})
export class CommonModule {}
