import { LitElement, html, css, CSSResultGroup, PropertyValues } from 'lit';
import { property, customElement } from 'lit/decorators.js';

/**
 * Card-owned replacements for HA's ha-list / ha-list-item.
 *
 * The card's picker dialogs used ha-list-item, which the card never loads
 * itself: it only worked while some other part of HA happened to have loaded
 * it. From HA 2026.10 that's no longer the case, so the element stayed
 * undefined and every row collapsed into one line of inline text. These
 * elements keep the same slots and attributes the dialogs already use
 * (graphic / default / secondary / meta, twoline, disabled, noninteractive)
 * and honour the --mdc-list-* sizing variables the dialogs set, so the
 * dialogs only need their tag names swapped.
 */

@customElement('scheduler-list')
export class SchedulerList extends LitElement {
  render() {
    return html`<slot></slot>`;
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        display: block;
        padding: var(--mdc-list-vertical-padding, 8px) 0;
      }
    `;
  }
}

@customElement('scheduler-list-item')
export class SchedulerListItem extends LitElement {
  /** reserve the icon column (also when no icon is slotted, to keep rows aligned) */
  @property({ reflect: true }) graphic?: string;
  @property({ type: Boolean, reflect: true }) twoline = false;
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property({ type: Boolean, reflect: true }) noninteractive = false;
  /** show the trailing meta slot (as with ha-list-item, only when set) */
  @property({ type: Boolean }) hasMeta = false;

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('keydown', this._handleKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('keydown', this._handleKeydown);
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    if (changedProps.has('disabled') || changedProps.has('noninteractive')) {
      const interactive = !this.disabled && !this.noninteractive;
      if (interactive) {
        this.setAttribute('role', 'option');
        this.tabIndex = 0;
      } else {
        this.removeAttribute('role');
        this.removeAttribute('tabindex');
      }
      this.setAttribute('aria-disabled', String(this.disabled));
    }
  }

  private _handleKeydown = (ev: KeyboardEvent) => {
    // only the row itself: keys pressed on controls inside it (checkboxes,
    // buttons in the meta slot) keep their own behaviour
    if (ev.target !== this || this.disabled || this.noninteractive) return;
    if (ev.key == 'Enter' || ev.key == ' ') {
      ev.preventDefault();
      this.click();
    }
  };

  render() {
    return html`
      ${this.graphic !== undefined ? html`<span class="graphic"><slot name="graphic"></slot></span>` : ''}
      <span class="text">
        <span class="primary"><slot></slot></span>
        ${this.twoline ? html`<span class="secondary"><slot name="secondary"></slot></span>` : ''}
      </span>
      ${this.hasMeta ? html`<span class="meta"><slot name="meta"></slot></span>` : ''}
    `;
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        display: flex;
        align-items: center;
        box-sizing: border-box;
        min-height: 48px;
        padding-inline-start: var(--mdc-list-side-padding-left, var(--mdc-list-side-padding, 20px));
        padding-inline-end: var(--mdc-list-side-padding-right, var(--mdc-list-side-padding, 20px));
        color: var(--primary-text-color);
        font-size: 1rem;
        cursor: pointer;
        outline: none;
        -webkit-tap-highlight-color: transparent;
      }
      :host([twoline]) {
        min-height: 72px;
      }
      :host([noninteractive]) {
        cursor: default;
      }
      :host([disabled]) {
        cursor: default;
        color: var(--disabled-text-color);
        pointer-events: none;
      }
      :host(:not([noninteractive]):not([disabled]):hover) {
        background: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.04);
      }
      :host(:not([noninteractive]):not([disabled]):active) {
        background: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.12);
      }
      :host(:focus-visible) {
        background: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.08);
        box-shadow: inset 0 0 0 2px var(--primary-color);
      }
      .graphic {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        margin-inline-end: 32px;
        color: var(--secondary-text-color);
      }
      .text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      .primary,
      .secondary {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .secondary {
        font-size: 0.875rem;
        color: var(--secondary-text-color);
      }
      :host([disabled]) .secondary {
        color: inherit;
      }
      .meta {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        width: var(--mdc-list-item-meta-size, auto);
        margin-inline-start: 16px;
        color: var(--secondary-text-color);
      }
    `;
  }
}
