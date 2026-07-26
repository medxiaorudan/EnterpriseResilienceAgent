import { Module } from "@nestjs/common";
import { AwsConfigService } from "./aws-config.service.js";
import { GcpConfigService } from "./gcp-config.service.js";
import { AwsOperationsAdapter } from "./providers/aws-operations.adapter.js";
import { GcpOperationsAdapter } from "./providers/gcp-operations.adapter.js";
import { CloudAdaptersService } from "./cloud-adapters.service.js";

@Module({
  providers: [AwsConfigService, GcpConfigService, AwsOperationsAdapter, GcpOperationsAdapter, CloudAdaptersService],
  exports: [AwsConfigService, GcpConfigService, CloudAdaptersService]
})
export class CloudAdaptersModule {}
