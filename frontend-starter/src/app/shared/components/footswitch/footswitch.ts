import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Pedal footswitch with its LED: a real button with role="switch",
 * so Space and Enter work and screen readers announce on / off. Works with Reactive Forms.
 */
@Component({
  selector: 'app-footswitch',
  template: `
    <span class="led" [class.lit]="on()" aria-hidden="true"></span>
    <button
      type="button"
      role="switch"
      class="foot"
      [attr.aria-checked]="on()"
      [attr.aria-label]="label()"
      (click)="toggle()"
    ></button>
  `,
  styles: `
    :host { display: inline-grid; justify-items: center; gap: 0.6rem; }
    .led { width: 14px; height: 14px; border-radius: 50%; background: #5a1010; border: 2px solid var(--ink); }
    .led.lit { background: #ff2a2a; box-shadow: 0 0 10px #ff2a2a; }
    /* Bouton métal rond : on écrase le style penché des boutons du site. */
    .foot {
      width: 54px;
      height: 54px;
      padding: 0;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #eeeeee, #888888);
      border: var(--line);
      box-shadow: 0 4px 0 var(--ink);
      transform: none;
    }
    .foot:hover:not(:disabled) { transform: none; box-shadow: 0 4px 0 var(--ink); filter: brightness(1.08); }
    .foot:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 1px 0 var(--ink); }
  `,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FootswitchComponent), multi: true }],
})
export class FootswitchComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly on = signal(false);

  private onChange: (value: boolean) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: boolean | null): void {
    this.on.set(!!value);
  }
  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  protected toggle(): void {
    this.on.update((on) => !on);
    this.onChange(this.on());
    this.onTouched();
  }
}
