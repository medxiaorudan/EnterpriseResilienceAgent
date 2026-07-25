import { Global, Module } from "@nestjs/common";
import { PostgresService } from "./postgres.service.js";
import { RedisService } from "./redis.service.js";
import { StoreService } from "./store.service.js";

@Global()
@Module({
  providers: [PostgresService, RedisService, StoreService],
  exports: [PostgresService, RedisService, StoreService]
})
export class CommonModule {}
