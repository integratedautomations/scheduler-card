import { capitalizeFirstLetter } from "../../lib/capitalize_first_letter";
import { computeDomain, computeEntity } from "../../lib/entity";
import { HomeAssistant } from "../../lib/types";
import { hassLocalize } from "../../localize/hassLocalize";
import { localize } from "../../localize/localize";
import { Action } from "../../types";
import { actionTargetEntities } from "../actions/target";

// generic services act on whatever they target, so name the target's domain
const GENERIC_DOMAINS = ['homeassistant'];

const domainName = (domain: string, hass: HomeAssistant) =>
  hassLocalize(`component.${domain}.title`, hass, false) || capitalizeFirstLetter(domain.replace(/_/g, " "));

const verb = (action: Action, domain: string, hass: HomeAssistant) => {
  const service = computeEntity(action.service);
  const key = (k: string) => localize(`ui.panel.overview.short_action.${k}`, hass);
  if (service == 'turn_on') return key('on');
  if (service == 'turn_off') return key('off');
  if (service == 'toggle') return key('toggle');
  if (service.startsWith('set_')) return key('set');
  // script.<name> and notify.<target> name the thing, not the verb
  if (domain == 'script') return key('run');
  if (domain == 'notify') return key('send');
  return capitalizeFirstLetter(service.split('_')[0]);
};

/**
 * Compact label for an action, e.g. "Light: On", "Climate: Set".
 */
export const formatActionShort = (action: Action, hass: HomeAssistant): string => {
  let domain = computeDomain(action.service);
  if (GENERIC_DOMAINS.includes(domain)) {
    const entity = actionTargetEntities(hass, action)[0];
    if (entity) domain = computeDomain(entity);
  }
  return `${domainName(domain, hass)}: ${verb(action, computeDomain(action.service), hass)}`;
};

/** labels of all actions of a slot, joined; '' for a slot without actions */
export const formatActionsShort = (actions: Action[], hass: HomeAssistant): string =>
  actions.map(action => formatActionShort(action, hass)).join(', ');
