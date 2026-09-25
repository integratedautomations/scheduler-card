import { UnsubscribeFunc } from "home-assistant-js-websocket";
import { HomeAssistant } from "../../lib/types";

/**
 * Backend contract for entity mode (scheduler-component, pending):
 *   scheduler/entity_schedules           { entity_id } -> summaries
 *   scheduler/subscribe_entity_schedules { entity_id } -> summaries, pushed live
 *
 * ASSUMPTIONS to confirm once the backend lands (all shape handling for this
 * contract is kept in this file):
 * - every push carries the complete current list for the entity (not a delta)
 * - a push is either a bare list or an object with a `schedules` list
 * - matched_via.type is one of the EntityMatchType values below
 */

export type EntityMatchType = 'direct' | 'device' | 'area' | 'floor' | 'label';

export interface EntityScheduleMatch {
  type: EntityMatchType;
  id?: string;
  name?: string;
}

export interface EntityScheduleSummary {
  schedule_id: string;
  name?: string;
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
