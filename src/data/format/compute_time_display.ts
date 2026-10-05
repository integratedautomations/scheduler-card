import { capitalizeFirstLetter } from "../../lib/capitalize_first_letter";
import { HomeAssistant } from "../../lib/types";
import { useAmPm } from "../../lib/use_am_pm";
import { hassLocalize } from "../../localize/hassLocalize";
import { localize } from "../../localize/localize";
import { Time, TimeMode } from "../../types";
import { parseTimeString } from "../time/parse_time_string";
import { timeToString } from "../time/time_to_string";

const formatRelativeTimeString = (input: Time, hass: HomeAssistant) => {
  let eventString =
    input.mode == TimeMode.Sunrise
      ? hassLocalize('ui.panel.config.automation.editor.conditions.type.sun.sunrise', hass)
      : hassLocalize('ui.panel.config.automation.editor.conditions.type.sun.sunset', hass);
  if (hass.language != 'de') eventString = eventString.toLowerCase();

  const offset = input.hours * 3600 + input.minutes * 60;
  if (Math.abs(offset) <= 60)
    return localize('ui.components.time.at_sun_event', hass, '{sunEvent}', eventString);

  let signString = offset < 0
    ? hassLocalize('ui.panel.config.automation.editor.conditions.type.sun.before', hass)
    : hassLocalize('ui.panel.config.automation.editor.conditions.type.sun.after', hass);
  signString = signString.replace(/[^a-z]/gi, '').toLowerCase();

  let timeString = timeToString(input, { seconds: false }).split(/\+|\-/).pop();
  return `${timeString} ${signString} ${eventString}`;
};

/**
 * A single time without surrounding wording: "17:00", "5:00 PM" or
 * "00:15 before sunset".
 */
export const formatTimeString = (time: string, hass: HomeAssistant) => {
  const ts = parseTimeString(time);
  return ts.mode == TimeMode.Fixed
    ? timeToString(ts, { am_pm: useAmPm(hass.locale) })
    : formatRelativeTimeString(ts, hass);
}

export const computeTimeDisplay = (startTime: string, stopTime: string | undefined, hass: HomeAssistant) => {
  if (stopTime) {
    const startTimeString = formatTimeString(startTime, hass);
    const stopTimeString = formatTimeString(stopTime, hass);
    return capitalizeFirstLetter(localize('ui.components.time.interval', hass, ['{startTime}', '{endTime}'], [startTimeString, stopTimeString]));
  }
  else {
    const startTimeString = formatTimeString(startTime, hass);
    return capitalizeFirstLetter(localize('ui.components.time.absolute', hass, '{time}', startTimeString));
  }
}