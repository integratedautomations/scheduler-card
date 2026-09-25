import { computeDomain } from "../../lib/entity";
import { HomeAssistant } from "../../lib/types";
import { Schedule } from "../../types";
import { actionTargetEntities } from "../actions/target";

/**
 * Every entity a schedule acts on, across all entries, slots and actions.
 * Dynamic targets (area/floor/label/device) are resolved from the local
 * registry mirrors, so this is the same approximation used for display
 * elsewhere in the card; the backend remains the source of truth at
 * execution time.
 */
export const computeScheduleEntities = (schedule: Schedule, hass: HomeAssistant): string[] => {
  const entities = new Set<string>();
  schedule.entries.forEach(entry =>
    entry.slots.forEach(slot =>
      slot.actions.forEach(action => {
        let list = actionTargetEntities(hass, action);
        // a direct script call (script.my_script) targets the script itself
        if (!list.length && computeDomain(action.service) == 'script' && action.service.split('.')[1] != 'turn_on')
          list = [action.service];
        list.forEach(e => entities.add(e));
      })
    )
  );
  return [...entities];
};
