import { Injectable } from "@nestjs/common";
import { seedMlopsCapabilityProfile } from "@enterprise-resilience/contracts";

@Injectable()
export class MlopsService {
  getCapabilityProfile() {
    return seedMlopsCapabilityProfile;
  }

  listFrameworks() {
    return seedMlopsCapabilityProfile.frameworks;
  }
}
