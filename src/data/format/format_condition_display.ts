import { capitalizeFirstLetter } from "../../lib/capitalize_first_letter";
import { HomeAssistant } from "../../lib/types";
import { localize } from "../../localize/localize";
import { Condition, ConditionConfig, CustomConfig, TConditionLogicType, TConditionMatchType } from "../../types";
import { computeStatesForEntity } from "../compute_states_for_entity";
import { formatSelectorDisplay } from "../selectors/format_selector_display";
import { computeEntityDisplay } from "./compute_entity_display";

// the display pipeline renders these strings through unsafeHTML (it carries the
// <tag> and <relative-time> markers), so the comparison symbols for above/below
// must be escaped or the browser parses them as the start of a tag
const matchTypeSymbol = {
  [TConditionMatchType.Equal]: '=',
  [TConditionMatchType.Unequal]: '≠',
  [TConditionMatchType.Above]: '&gt;',
  [TConditionMatchType.Below]: '&lt;',
};

/**
 * Compact rendering of a single condition, e.g. "Issur Melucha = On".
 */
export const formatConditionDisplay = (condition: Partial<Condition>, hass: HomeAssistant, customize?: CustomConfig): string => {
  if (!condition || !condition.entity_id) return '';

  const entityDisplay = computeEntityDisplay(condition.entity_id, hass, customize);
  const selector = computeStatesForEntity(condition.entity_id, hass, customize);
  const value = formatSelectorDisplay(condition.value, selector, hass);
  const matchSymbol = matchTypeSymbol[condition.match_type!] || matchTypeSymbol[TConditionMatchType.Equal];

  const valueDisplay = value === undefined || value === null ? '' : capitalizeFirstLetter(String(value));
  if (!valueDisplay.length) return '';

  return `${capitalizeFirstLetter(entityDisplay)} ${matchSymbol} ${valueDisplay}`;
}

/**
 * Summary of all conditions of a timeslot, joined by the configured logic mode,
 * e.g. "Issur Melucha = On and Sun = Above horizon".
 */
export const formatConditionsDisplay = (conditions: ConditionConfig | undefined, hass: HomeAssistant, customize?: CustomConfig): string => {
  const items = conditions?.items || [];
  const parts = items
    .map(condition => formatConditionDisplay(condition, hass, customize))
    .filter(e => e.length);

  if (!parts.length) return '';

  const separator = localize(
    conditions?.type == TConditionLogicType.Or
      ? 'ui.panel.options.conditions.options.logic_or_join'
      : 'ui.panel.options.conditions.options.logic_and_join',
    hass
  );

  return parts.join(` ${separator} `);
}
