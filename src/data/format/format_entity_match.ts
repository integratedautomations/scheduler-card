import { HomeAssistant } from "../../lib/types";
import { localize } from "../../localize/localize";
import { EntityScheduleMatch } from "../store/subscribe_entity_schedules";

const matchKeys: Record<string, string> = {
  device: 'match_device',
  area: 'match_area',
  floor: 'match_floor',
  label: 'match_label',
};

// registry lookup used only when the backend didn't include a display name
const lookupName = (match: EntityScheduleMatch, hass: HomeAssistant): string | undefined => {
  if (!match.id) return undefined;
  const h = hass as any;
  switch (match.type) {
    case 'device':
      return h.devices?.[match.id]?.name_by_user || h.devices?.[match.id]?.name;
    case 'area':
      return h.areas?.[match.id]?.name;
    case 'floor':
      return h.floors?.[match.id]?.name;
    case 'label':
      return h.labels?.[match.id]?.name;
  }
  return undefined;
};

/**
 * Why a schedule matched the entity in entity mode, e.g. "Direct",
 * "Area: Kitchen". Empty for an unknown or missing match reason.
 */
export const formatEntityMatch = (match: EntityScheduleMatch | undefined, hass: HomeAssistant): string => {
  if (!match || !match.type) return '';
  // the entity is targeted explicitly
  if (match.type == 'entity') return localize('ui.panel.overview.entity_mode.match_direct', hass);
  const key = matchKeys[match.type];
  if (!key) return '';
  const name = match.name || lookupName(match, hass) || match.id || '';
  return localize(`ui.panel.overview.entity_mode.${key}`, hass, '{name}', name);
};
