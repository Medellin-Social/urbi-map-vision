import { API_ENDPOINTS } from "@/config/api"

const SESSION_ID = crypto.randomUUID()

interface TrackData {
  entity_type?: string
  entity_id?: string
  barrio_id?: number
  duration_ms?: number
  metadata?: Record<string, unknown>
}

export async function track(event_type: string, data: TrackData = {}): Promise<void> {
  try {
    await fetch(API_ENDPOINTS.track, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: SESSION_ID, event_type, ...data }),
    })
  } catch {
    // Silencioso — no romper la app
  }
}

export function trackWithDuration(
  event_base: string,
  data: TrackData = {},
): () => void {
  const start = Date.now()
  track(`${event_base}_open`, data)

  return () => {
    track(`${event_base}_close`, {
      ...data,
      duration_ms: Date.now() - start,
    })
  }
}
