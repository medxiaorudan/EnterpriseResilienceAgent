import { Controller, Sse } from "@nestjs/common";
import { map } from "rxjs/operators";
import { EventsService } from "./events.service.js";

@Controller("events")
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Sse("stream")
  stream() {
    return this.eventsService.getStream().pipe(
      map((event) => ({
        data: event
      }))
    );
  }
}
