import { Module } from "@nestjs/common";
import { AwsOperationsAdapter } from "./providers/aws-operations.adapter.js";
import { CloudAdaptersService } from "./cloud-adapters.service.js";

@Module({
  providers: [AwsOperationsAdapter, CloudAdaptersService],
  exports: [CloudAdaptersService]
})
export class CloudAdaptersModule {}
