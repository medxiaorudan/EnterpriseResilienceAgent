import { Injectable } from "@nestjs/common";
import type { IncidentEvent } from "@enterprise-resilience/contracts";
import { Subject } from "rxjs";

@Injectable()
export class EventsService {
  private readonly stream$ = new Subject<IncidentEvent>();
  private version = 1;

  getStream() {
    return this.stream$.asObservable();
  }

  publish(event: Omit<IncidentEvent, "version">) {
    this.stream$.next({
      ...event,
      version: this.version++
    });
  }
}
