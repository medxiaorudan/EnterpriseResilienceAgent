import { useEffect, useEffectEvent } from "react";
import type { IncidentEvent } from "@enterprise-resilience/contracts";
import { apiBaseUrl } from "@/api/client.js";

export function useEventStream(onEvent: (event: IncidentEvent) => void) {
  const handleEvent = useEffectEvent(onEvent);

  useEffect(() => {
    const source = new EventSource(`${apiBaseUrl}/events/stream`);

    source.onmessage = (message) => {
      const parsed = JSON.parse(message.data) as IncidentEvent;
      handleEvent(parsed);
    };

    return () => {
      source.close();
    };
  }, [handleEvent]);
}
