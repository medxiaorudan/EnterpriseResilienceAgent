import { Injectable, NotFoundException } from "@nestjs/common";
import type { CloudOperationsAdapter, CloudProvider } from "@enterprise-resilience/contracts";
import { AwsOperationsAdapter } from "./providers/aws-operations.adapter.js";

@Injectable()
export class CloudAdaptersService {
  private readonly adapters: Map<CloudProvider, CloudOperationsAdapter>;

  constructor(awsAdapter: AwsOperationsAdapter) {
    this.adapters = new Map<CloudProvider, CloudOperationsAdapter>([["aws", awsAdapter]]);
  }

  getAdapter(provider: CloudProvider) {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new NotFoundException(`Cloud adapter for provider ${provider} is not configured.`);
    }
    return adapter;
  }
}
