import { css, html, LitElement, nothing, PropertyValues } from "lit";
import { loadHaForm } from './lib/load_ha_form';
import { customElement, property, state } from "lit/decorators";
import { SchedulerDialogParams } from "./dialogs/dialog-scheduler-editor";
import { fetchItems } from "./data/store/fetch_items";
import { UnsubscribeFunc } from "home-assistant-js-websocket";
import { CardConfig, CustomConfig, EditorMode, Schedule, SchedulerEventData, ScheduleStorageEntry } from "./types";
import { parseTimeBar } from "./data/time/parse_time_bar";
import { HomeAssistant } from "./lib/types";
import { CARD_VERSION, defaultSingleTimerConfig, defaultTimeSchemeConfig } from "./const";
import { validateConfig } from "./data/validate_config";
import { localize } from "./localize/localize";
import { isIncludedSchedule } from "./data/schedule/is_included_schedule";
import { sortSchedules } from "./data/schedule/sort_schedules";
import { fetchScheduleItem } from "./data/store/fetch_item";
import { fireEvent } from "./lib/fire_event";
import { hassLocalize } from "./localize/hassLocalize";
import { loadConfigFromEntityRegistry } from "./data/load_config_from_entity_registry";
import { isDefined } from "./lib/is_defined";
import { EntityScheduleMatch, EntityScheduleSummary, subscribeEntitySchedules } from "./data/store/subscribe_entity_schedules";

import './scheduler-card-editor';
import "./dialogs/dialog-scheduler-editor";
import "./components/scheduler-item-row";
import { entityIncludedByConfig } from "./data/actions/entity_included_by_config";

@customElement('scheduler-card')
export class SchedulerCard extends LitElement {

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() _config: CardConfig = {};

  @state() public schedules?: ScheduleStorageEntry[];

  @state() showDiscovered: boolean = false;

  translationsLoaded = false;
  connectionError = false;

  private __unsubs?: Array<UnsubscribeFunc | Promise<UnsubscribeFunc>>;

  // entity mode state
  @state() private _entityMatches: Record<string, EntityScheduleMatch | undefined> = {};
  private _entityLoadId = 0;
  private _subscribedEntity?: string;

  async setConfig(userConfig: CardConfig) {
    userConfig = validateConfig(userConfig);
    this._config = { ...userConfig };

    // an embedding container may reuse the card for another entity:
    // drop the old entity's subscription and data, then subscribe afresh
    if (this.__unsubs !== undefined && this._subscribedEntity !== (this._config.entity_id || undefined)) {
      this.__unsubscribeAll();
      this.schedules = undefined;
      this._entityMatches = {};
      this.__checkSubscribed();
    }
  }

  private get _entityMode(): boolean {
    return Boolean(this._config.entity_id);
  }

  async firstUpdated() {
    await loadHaForm();
    const el = document.querySelector('home-assistant') as HTMLElement & { _loadFragmentTranslations: any };
    el._loadFragmentTranslations(this.hass.language, 'config');

    await loadConfigFromEntityRegistry(this.hass)
      .then(extraConfig => {
        extraConfig = Object.fromEntries(
          Object.entries(extraConfig).filter(([k]) => entityIncludedByConfig(k, this._config))
        );
        this._config = {
          ...this._config,
          customize: { ...extraConfig, ...(this._config.customize || {}) }
        };
      });
  }

  protected willUpdate(): void {
    (this.hass as any).loadBackendTranslation("services");
  }

  private __checkSubscribed(): void {
    if (this.__unsubs !== undefined || !((this as unknown) as Element).isConnected || this.hass === undefined) {
      return;
    }
    this.__unsubs = this.hassSubscribe();
  }

  public connectedCallback() {
    super.connectedCallback();
    this.__checkSubscribed();
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this.__unsubscribeAll();
  }

  private __unsubscribeAll() {
    this._entityLoadId++; // discard fetches still in flight for the old subscription
    if (this.__unsubs) {
      while (this.__unsubs.length) {
        const unsub = this.__unsubs.pop()!;
        if (unsub instanceof Promise) {
          unsub.then(unsubFunc => unsubFunc());
        } else {
          unsub();
        }
      }
      this.__unsubs = undefined;
    }
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    if (changedProps.has('hass')) {
      this.__checkSubscribed();
    }
    // entity mode: flag "nothing to show" (also while still loading, so an
    // embedding container never flashes an empty card)
    if (this._entityMode) this.toggleAttribute('empty', !this.schedules?.length);
    else if (this.hasAttribute('empty')) this.removeAttribute('empty');
  }

  public hassSubscribe(): Promise<UnsubscribeFunc>[] {
    if (this._entityMode) return this.hassSubscribeEntity();
    this._subscribedEntity = undefined;
    this.loadSchedules();
    return [
      this.hass!.connection.subscribeMessage((ev: SchedulerEventData) => this.handleScheduleItemUpdated(ev), {
        type: 'scheduler_updated',
      }),
    ];
  }

  // entity mode: the backend decides which schedules act on the entity (it
  // can resolve area/floor/label/device membership, which local
  // include/exclude filtering can't). It also pushes a fresh list on every
  // schedule edit, toggle and trigger change, so no scheduler_updated
  // listener is needed here.
  private hassSubscribeEntity(): Promise<UnsubscribeFunc>[] {
    const entityId = this._config.entity_id!;
    this._subscribedEntity = entityId;
    return [
      subscribeEntitySchedules(this.hass!, entityId, summaries => this._handleEntitySchedules(summaries))
        .catch(err => {
          // e.g. a backend without the entity commands: render nothing
          console.warn(`scheduler-card: could not load schedules for ${entityId}`, err);
          this._entityMatches = {};
          this.schedules = [];
          return () => { };
        }),
    ];
  }

  private _handleEntitySchedules(summaries: EntityScheduleSummary[]) {
    const loadId = ++this._entityLoadId;
    const matches = Object.fromEntries(summaries.map(e => [e.schedule_id, e.matched_via]));
    // rows need the full schedule, which the summaries don't carry
    Promise.all(summaries.map(e => fetchScheduleItem(this.hass!, e.schedule_id).catch(() => null)))
      .then(items => {
        if (loadId !== this._entityLoadId) return; // superseded by a newer push or unsubscribed
        this._entityMatches = matches;
        this.schedules = sortSchedules(items.filter(isDefined) as ScheduleStorageEntry[], this._config, this.hass);
      });
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {

    const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
    const oldConfig = changedProps.get('_config') as CardConfig | undefined;

    if (oldConfig && this._config) {
      const changedKeys = Object.keys(oldConfig).filter(e => oldConfig[e] !== this._config![e]);
      if (changedKeys.some(e => ['tags', 'discover_existing', 'sort_by', 'display_options'].includes(e))) {
        // entity mode must not load the full list; its membership comes from the subscription
        if (this._entityMode) {
          if (this.schedules) this.schedules = sortSchedules([...this.schedules], this._config, this.hass);
        }
        else (async () => await this.loadSchedules())();
      }
    }

    if (!this.translationsLoaded
      && hassLocalize(`component.input_boolean.services.turn_on.name`, this.hass, false).length
      && hassLocalize('ui.panel.config.automation.editor.conditions.type.sun.sunrise', this.hass, false).length
    ) {
      this.translationsLoaded = true;
      return true;
    }

    //only reload card if a schedule entity has changed
    if (oldHass && changedProps.size == 1 && this.schedules) {
      return Object.values(this.schedules).some(
        e => JSON.stringify(oldHass.states[e.entity_id!]) !== JSON.stringify(this.hass!.states[e.entity_id!])
      );
    }

    return true;
  }

  render() {
    if (this._entityMode) return this.renderEntityMode();

    let items: ScheduleStorageEntry[] = [...this.schedules || []];
    let includedItems = items.filter(e => isIncludedSchedule(e, this._config, this.hass));
    let excludedItems = items.filter(e => !isIncludedSchedule(e, this._config, this.hass));

    const headerToggleState = this.showDiscovered
      ? items.some(el => ['on', 'triggered'].includes(this.hass!.states[el.entity_id]?.state || ''))
      : includedItems.some(el => ['on', 'triggered'].includes(this.hass!.states[el.entity_id]?.state || ''));

    return html`
      <ha-card>
        <div class="card-header">
          <div class="name">
            ${!isDefined(this._config.title) || (typeof this._config.title === 'boolean' && this._config.title)
        ? localize('ui.panel.common.title', this.hass)
        : typeof this._config.title == 'boolean'
          ? ''
          : this._config.title
      }
          </div>

          ${Object.keys(this.schedules || {}).length && this._config.show_header_toggle
        ? html`
          <ha-switch
            ?checked=${headerToggleState}
            @change=${this.toggleDisableAll}
          >
          </ha-switch>
          `
        : ''}
        </div>

        <div class="card-content" id="states">

    ${this.connectionError
        ? html`
        <div>
          <hui-warning .hass=${this.hass}>
            <span style="white-space: normal">
              ${localize('ui.panel.overview.backend_error', this.hass)}
            </span>
          </hui-warning>
        </div>
      `
        : !Object.keys(items).length
          ? html`
        <div>
          ${localize('ui.panel.overview.no_entries', this.hass)}
        </div>
        `
          : includedItems.map(scheduleItem => html`
            <scheduler-item-row
              .hass=${this.hass}
              .config=${this._config}
              .schedule_id=${scheduleItem.schedule_id}
              .schedule=${scheduleItem}
              @editClick=${(ev: Event) => { this._handleEditClick(ev, scheduleItem) }}
            >
            </scheduler-item-row>
          `
          )
      }

      ${Object.keys(items).length > includedItems.length && this._config.discover_existing !== false
        ? !this.showDiscovered
          ? html`
              <div>
                <ha-button
                  appearance="plain"
                  @click=${() => {
              this.showDiscovered = true;
            }}
                >
                  +
                  ${localize('ui.panel.overview.excluded_items', this.hass, '{number}', Object.keys(items).length - includedItems.length)}
                </ha-button>
              </div>
            `
          : html`

          ${excludedItems.map(scheduleItem => html`
                <scheduler-item-row
                  .hass=${this.hass}
                  .config=${this._config}
                  .schedule_id=${scheduleItem.schedule_id}
                  .schedule=${scheduleItem}
              @editClick=${(ev: Event) => { this._handleEditClick(ev, scheduleItem) }}
                >
                </scheduler-item-row>
              `
          )
            }

              <div>
                <ha-button
                  appearance="plain"
                  @click=${() => {
              this.showDiscovered = false;
            }}
                >
                  ${localize('ui.panel.overview.hide_excluded', this.hass)}
                </ha-button>
              </div>
            `
        : ''}
        </div>
        ${this._config.show_add_button !== false ? html`
        <div class="card-actions">
          ${this.connectionError
          ? html`
          <ha-button appearance="plain" variant="warning" @click=${this._retryConnection}
            >${hassLocalize('ui.common.refresh', this.hass)}
          </ha-button>
            `
          : html`
          <ha-button appearance="plain" @click=${this._addClick}
            >${hassLocalize('ui.common.add', this.hass)}
          </ha-button>
          `}
        </div>` : ''}
      </ha-card>
    `;
  }

  // compact list for embedding (e.g. in the more-info dialog): no title,
  // header toggle, add button or excluded-items expander, and no card
  // border/shadow. With nothing to show it renders nothing at all, so the
  // container can treat an empty card as "hide me" (see also the [empty]
  // host attribute and getCardSize() == 0)
  private renderEntityMode() {
    const items = this.schedules || [];
    if (!items.length) return nothing;
    return html`
      <ha-card class="entity-mode">
        <div class="card-content" id="states">
          ${items.map(scheduleItem => html`
            <scheduler-item-row
              .hass=${this.hass}
              .config=${this._config}
              .schedule_id=${scheduleItem.schedule_id}
              .schedule=${scheduleItem}
              .matchedVia=${this._entityMatches[scheduleItem.schedule_id]}
              @editClick=${(ev: Event) => { this._handleEditClick(ev, scheduleItem) }}
            >
            </scheduler-item-row>
          `)}
        </div>
      </ha-card>
    `;
  }

  private async loadSchedules(): Promise<void> {
    fetchItems(this.hass!)
      .then(res => {
        this.schedules = sortSchedules(res, this._config, this.hass);
      })
      .catch(_e => {
        this.schedules = [];
        this.connectionError = true;
      })
  }

  public async getCardSize() {
    return new Promise(res => {
      let retries = 0;
      const wait = setInterval(() => {
        retries++;
        if (!this._config || (!this.schedules && !this.connectionError && retries < 50)) return;
        if (this._entityMode) {
          const rows = this.schedules?.length || 0;
          const entityRowSize = (([this._config.display_options?.secondary_info || []].flat().length || 2) + 2) / 2;
          clearInterval(wait);
          res(Math.round(rows * entityRowSize));
          return;
        }
        let cardSize = this._config!.title || this._config!.show_header_toggle ? 3 : 1;
        if (this._config.show_add_button) cardSize += 1;
        const rowSize = (([this._config.display_options?.secondary_info || []].flat().length || 2) + 1) / 2;
        if (this.schedules)
          cardSize += this.showDiscovered
            ? Object.keys(this.schedules).length * rowSize
            : Object.values(this.schedules).filter(e => isIncludedSchedule(e, this._config, this.hass)).length * rowSize;
        clearInterval(wait);
        res(Math.round(cardSize));
      }, 50);
    });
  }

  _retryConnection() {
    setTimeout(async () => {
      await this.loadSchedules();
    }, 100);
    this.connectionError = false;
    this.requestUpdate();
  }

  private async handleScheduleItemUpdated(ev: SchedulerEventData): Promise<void> {
    //only update single schedule
    if (ev.event == 'scheduler_item_removed') {
      this.schedules = (this.schedules || []).filter(e => e.schedule_id !== ev.schedule_id);
      return;
    }
    fetchScheduleItem(this.hass!, ev.schedule_id).then(schedule => {
      const oldScheduleIdx = this.schedules!.findIndex(e => e.schedule_id == ev.schedule_id);
      const oldSchedule = oldScheduleIdx >= 0 ? this.schedules![oldScheduleIdx] : null;
      let schedules = [...(this.schedules || [])];

      if (!schedule || (this._config.discover_existing === false && !isIncludedSchedule(schedule, this._config!, this.hass))) {
        //schedule is not in the list, remove if it was in the list
        if (oldSchedule) {
          schedules = schedules.filter(e => e.schedule_id !== ev.schedule_id);
        }
      } else if (!oldSchedule) {
        //add a new schedule and sort the list
        schedules = sortSchedules([...schedules, schedule], this._config, this.hass);
      } else if (oldSchedule.timestamps[oldSchedule.next_entries[0] || 0] == schedule.timestamps[schedule.next_entries[0] || 0]) {
        //only overwrite the existing schedule
        schedules = Object.assign(schedules, { [oldScheduleIdx]: schedule });
      } else {
        //overwrite the existing schedule and sort
        schedules = Object.assign(schedules, { [oldScheduleIdx]: schedule });
        schedules = sortSchedules(schedules, this._config, this.hass);
      }
      this.schedules = [...schedules];
    });
  }

  private _handleEditClick(ev: Event, item: Schedule) {
    if (!this.schedules) return;

    const params: SchedulerDialogParams = {
      schedule: parseTimeBar(item, this.hass),
      cardConfig: this._config,
      editItem: item.schedule_id!
    };

    fireEvent(ev.target as HTMLElement, 'show-dialog', {
      dialogTag: 'dialog-scheduler-editor',
      dialogImport: () => import('./dialogs/dialog-scheduler-editor'),
      dialogParams: params,
    });
  }

  private _addClick(_ev: Event) {
    const defaultTags = [this._config.tags || []].flat().filter(e => !['none', 'disabled', 'enabled'].includes(e));
    let clonedConfig: Schedule = this._config.default_editor == EditorMode.Scheme
      ? JSON.parse(JSON.stringify(defaultTimeSchemeConfig))
      : JSON.parse(JSON.stringify(defaultSingleTimerConfig));
    const params: SchedulerDialogParams = {
      schedule: { ...clonedConfig, tags: defaultTags.length == 1 ? defaultTags : [] },
      cardConfig: this._config
    };

    fireEvent(this, 'show-dialog', {
      dialogTag: 'dialog-scheduler-editor',
      dialogImport: () => import('./dialogs/dialog-scheduler-editor'),
      dialogParams: params,
    });
  }

  toggleDisableAll(ev: Event) {
    if (!this.hass || !this.schedules) return;
    const checked = (ev.target as HTMLInputElement).checked;

    const items = Object.values(this.schedules).filter(el => this.showDiscovered || isIncludedSchedule(el, this._config, this.hass));
    items.forEach(el => {
      this.hass!.callService('switch', checked ? 'turn_on' : 'turn_off', { entity_id: el.entity_id });
    });
  }

  // card configuration
  public static getConfigElement() {
    return document.createElement('scheduler-card-editor');
  }

  static styles = css`
    :host([empty]) {
      display: none;
    }
    ha-card.entity-mode {
      --ha-card-border-width: 0;
      --ha-card-box-shadow: none;
      border: none;
      box-shadow: none;
      background: none;
    }
    ha-card.entity-mode .card-content {
      padding: 0;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
    }
    .card-header .name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
    }
    .card-header ha-switch {
      display: flex;
      align-self: center;
      margin: 0px 6px;
      line-height: 24px;
    }

    #states > * {
      margin: 8px 0;
    }
    #states > *:first-child {
      margin-top: 0;
    }
    #states > *:last-child {
      margin-bottom: 0;
    }
  
    button.show-more {
      color: var(--primary-color);
      text-align: left;
      cursor: pointer;
      background: none;
      border-width: initial;
      border-style: none;
      border-color: initial;
      border-image: initial;
      font: inherit;
    }
    button.show-more:focus {
      outline: none;
      text-decoration: underline;
    }
    .card-actions, .card-actions > * { 
      display: flex;
    }
  `;
}

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'scheduler-card',
  name: 'Scheduler Card',
  description: 'Card to manage schedule entities made with scheduler-component.',
});

console.info(
  `%c  SCHEDULER-CARD  \n%c  Version: ${CARD_VERSION.padEnd(7, ' ')}`,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray'
);