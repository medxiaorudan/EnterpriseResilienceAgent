import { Injectable } from "@nestjs/common";
import {
  seedLlmopsCapabilityProfile,
  seedToolLayerFits
} from "@enterprise-resilience/contracts";

@Injectable()
export class LlmopsService {
  getCapabilityProfile() {
    return seedLlmopsCapabilityProfile;
  }

  listProviders() {
    return seedLlmopsCapabilityProfile.providers;
  }

  getToolLayerFit() {
    return seedToolLayerFits;
  }
}
