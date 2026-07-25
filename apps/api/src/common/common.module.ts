import { Global, Module } from "@nestjs/common";
import { StoreService } from "./store.service.js";

@Global()
@Module({
  providers: [StoreService],
  exports: [StoreService]
})
export class CommonModule {}
