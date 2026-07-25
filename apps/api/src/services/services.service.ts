import { Injectable, NotFoundException } from "@nestjs/common";
import { StoreService } from "../common/store.service.js";

@Injectable()
export class ServicesService {
  constructor(private readonly store: StoreService) {}

  list() {
    return this.store.listServices();
  }

  async getOne(serviceId: string) {
    const service = await this.store.getService(serviceId);
    if (!service) {
      throw new NotFoundException(`Service ${serviceId} not found.`);
    }

    return service;
  }

  async getHealth(serviceId: string) {
    return (await this.getOne(serviceId)).health;
  }

  async getDependencies(serviceId: string) {
    return (await this.getOne(serviceId)).dependencies;
  }

  async getIncidents(serviceId: string) {
    return (await this.store.listIncidents()).filter((incident) => incident.primaryService === serviceId);
  }

  async getChanges(serviceId: string) {
    return (await this.getOne(serviceId)).recentChanges;
  }
}
