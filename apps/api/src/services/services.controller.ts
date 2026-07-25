import { Controller, Get, Param } from "@nestjs/common";
import { ServicesService } from "./services.service.js";

@Controller("services")
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  list() {
    return this.servicesService.list();
  }

  @Get(":serviceId")
  getOne(@Param("serviceId") serviceId: string) {
    return this.servicesService.getOne(serviceId);
  }

  @Get(":serviceId/health")
  getHealth(@Param("serviceId") serviceId: string) {
    return this.servicesService.getHealth(serviceId);
  }

  @Get(":serviceId/dependencies")
  getDependencies(@Param("serviceId") serviceId: string) {
    return this.servicesService.getDependencies(serviceId);
  }

  @Get(":serviceId/incidents")
  getIncidents(@Param("serviceId") serviceId: string) {
    return this.servicesService.getIncidents(serviceId);
  }

  @Get(":serviceId/changes")
  getChanges(@Param("serviceId") serviceId: string) {
    return this.servicesService.getChanges(serviceId);
  }
}
