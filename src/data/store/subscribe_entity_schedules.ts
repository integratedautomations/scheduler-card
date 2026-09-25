import { UnsubscribeFunc } from "home-assistant-js-websocket";
import { HomeAssistant } from "../../lib/types";

/**
 * Backend contract for entity mode (scheduler-component README,
 * "scheduler/entity_schedules" and "scheduler/subscribe_entity_schedules"):
 * - the subscription pushes `{ schedules: [...] }` with the complete current
 *   list for the entity, straight away and again whenever it may have
 *   changed (schedule add/edit/rename/delete/toggle, next-trigger change,
 *   storage reload, relevant registry changes), coalesced by ~0.25 s
 * - matched_via.type is the most specific reason:
 *   entity > device > area > floor > label
 */

export type EntityMatchType = 'entity' | 'device' | 'area' | 'floor' | 'label';

export interface EntityScheduleMatch {
  type: EntityMatchType;
  id?: string;
  name?: string;
}

export interface EntityScheduleSummary {
  schedule_id: string;
  /** the schedule's switch entity; null until the switch is created */
  entity_id?: string | null;
  name?: string | null;
  enabled?: boolean;
  next_trigger?: string | null;
  matched_via?: EntityScheduleMatch;
}

const normalizeSummaries = (payload: any): EntityScheduleSummary[] => {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.schedules) ? payload.schedules : [];
  return list.filter((e: any) => e && typeof e.schedule_id === 'string');
};

export const subscribeEntitySchedules = (
  hass: HomeAssistant,
  entityId: string,
  callback: (summaries: EntityScheduleSummary[]) => void
): Promise<UnsubscribeFunc> =>
  hass.connection.subscribeMessage(
    (payload: any) => callback(normalizeSummaries(payload)),
    { type: 'scheduler/subscribe_entity_schedules', entity_id: entityId }
  );
