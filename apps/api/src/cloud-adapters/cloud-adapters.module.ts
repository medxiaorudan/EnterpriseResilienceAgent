import { Module } from "@nestjs/common";
import { AwsConfigService } from "./aws-config.service.js";
import { AwsOperationsAdapter } from "./providers/aws-operations.adapter.js";
import { CloudAdaptersService } from "./cloud-adapters.service.js";

@Module({
  providers: [AwsConfigService, AwsOperationsAdapter, CloudAdaptersService],
  exports: [AwsConfigService, CloudAdaptersService]
})
export class CloudAdaptersModule {}
