import { LitElement, html, css, CSSResultGroup } from 'lit';
import { property, customElement, state } from 'lit/decorators.js';
import { CardConfig, ScheduleEntry } from '../types';
import { HomeAssistant } from '../lib/types';
import { computeActionIcon } from '../data/format/compute_action_icon';
import { formatTimeString } from '../data/format/compute_time_display';
import { formatActionsShort } from '../data/format/format_action_short';
import { localize } from '../localize/localize';

/**
 * List alternative to scheduler-timeslot-editor's timeline bar: one row per
 * timeslot (including the empty gap slots the timeline shows). Same contract:
 * takes `schedule` + `selectedSlot`, emits `update` with { selectedSlot }.
 * Selecting is all it does; times and actions are edited below it in the
 * main panel, exactly as with the timeline.
 */
@customElement('scheduler-timeslot-list')
export class SchedulerTimeslotList extends LitElement {
  public hass!: HomeAssistant;
  @property({ attribute: false }) public config!: CardConfig;

  @state() schedule?: ScheduleEntry;

  @state() selectedSlot: number | null = null;

  render() {
    if (!this.schedule) return html``;
    return html`
      <div class="list" role="listbox">
        ${this.schedule.slots.map((slot, i) => {
      const time = slot.stop
        ? `${formatTimeString(slot.start, this.hass)} - ${formatTimeString(slot.stop, this.hass)}`
        : formatTimeString(slot.start, this.hass);
      const empty = !slot.actions.length;
      return html`
          <div
            class="row ${i === this.selectedSlot ? 'selected' : ''} ${empty ? 'empty' : ''}"
            role="option"
            tabindex="0"
            aria-selected=${i === this.selectedSlot ? 'true' : 'false'}
            @click=${() => this._toggleSelect(i)}
            @keydown=${(ev: KeyboardEvent) => this._handleKey(ev, i)}
          >
            <span class="time">${time}</span>
            <span class="action">
              ${empty
          ? localize('ui.panel.editor.no_action', this.hass)
          : html`<ha-icon icon="${computeActionIcon(slot.actions[0], this.config.customize)}"></ha-icon>${formatActionsShort(slot.actions, this.hass)}`}
            </span>
          </div>
        `;
    })}
      </div>
    `;
  }

  private _toggleSelect(num: number) {
    // like the timeline: tapping the selected slot again deselects it
    this.selectedSlot = this.selectedSlot !== num ? num : null;
    this.dispatchEvent(new CustomEvent('update', { detail: { selectedSlot: this.selectedSlot } }));
  }

  private _handleKey(ev: KeyboardEvent, num: number) {
    if (ev.key != 'Enter' && ev.key != ' ') return;
    ev.preventDefault();
    this._toggleSelect(num);
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        display: block;
      }
      .list {
        display: grid;
        grid-template-columns: auto 1fr;
        border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
        border-radius: 8px;
        overflow: hidden;
      }
      .row {
        /* subgrid: each row stays a real (focusable, clickable) box while
           sharing the list's columns, so the times line up across rows */
        display: grid;
        grid-column: 1 / -1;
        grid-template-columns: subgrid;
        cursor: pointer;
        border-top: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
      }
      .row:first-child {
        border-top: none;
      }
      .row > span {
        padding: 10px 12px;
        display: flex;
        align-items: center;
        min-width: 0;
      }
      .time {
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .action {
        gap: 8px;
      }
      .action ha-icon {
        --mdc-icon-size: 20px;
        color: var(--state-icon-color);
        flex: none;
      }
      .row.empty > span {
        color: var(--secondary-text-color);
        font-style: italic;
      }
      .row:hover {
        background: rgba(var(--rgb-primary-color), 0.06);
      }
      .row.selected {
        background: rgba(var(--rgb-primary-color), 0.18);
      }
      .row.selected > span {
        color: var(--primary-text-color);
      }
      .row.selected .action ha-icon {
        color: var(--primary-color);
      }
      .row:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
    `;
  }
}
