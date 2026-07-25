import { Injectable, NotFoundException } from "@nestjs/common";
import { StoreService } from "../common/store.service.js";

@Injectable()
export class ServicesService {
  constructor(private readonly store: StoreService) {}

  list() {
    return this.store.listServices();
  }

  getOne(serviceId: string) {
    const service = this.store.getService(serviceId);
    if (!service) {
      throw new NotFoundException(`Service ${serviceId} not found.`);
    }

    return service;
  }

  getHealth(serviceId: string) {
    return this.getOne(serviceId).health;
  }

  getDependencies(serviceId: string) {
    return this.getOne(serviceId).dependencies;
  }

  getIncidents(serviceId: string) {
    return this.store
      .listIncidents()
      .filter((incident) => incident.primaryService === serviceId);
  }

  getChanges(serviceId: string) {
    return this.getOne(serviceId).recentChanges;
  }
}
