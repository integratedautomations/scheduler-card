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
 * Summary of all conditions of a timeslot, joined by the configured logic mode.
 * A single condition renders as plain text, e.g. "Issur Melucha = On".
 * Multiple conditions render as one row per condition ("if" on the first row,
 * the logic word on every row after) so long conditions no longer get cut
 * off by being squeezed onto a single line - the markup is picked up by
 * scheduler-item-row's unsafeHTML rendering, styled by its '.condition-*' CSS.
 */
export const formatConditionsDisplay = (conditions: ConditionConfig | undefined, hass: HomeAssistant, customize?: CustomConfig): string => {
  const items = conditions?.items || [];
  const parts = items
    .map(condition => formatConditionDisplay(condition, hass, customize))
    .filter(e => e.length);

  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];

  const ifWord = localize('ui.panel.options.conditions.options.logic_if', hass);
  const joinWord = localize(
    conditions?.type == TConditionLogicType.Or
      ? 'ui.panel.options.conditions.options.logic_or_join'
      : 'ui.panel.options.conditions.options.logic_and_join',
    hass
  );

  const rows = parts
    .map((text, i) => `<div class="condition-row"><span class="condition-prefix">${i === 0 ? ifWord : joinWord}</span><span class="condition-text">${text}</span></div>`)
    .join('');

  return `<div class="conditions-list">${rows}</div>`;
}
