import { Component, computed, ElementRef, forwardRef, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ControlScale, fromRatio, keyValue, toRatio } from '../../utils/scale';

/**
 * Vertical fader, used by the equalizer bands. Click or drag on the slot,
 * or use the keyboard (arrows, Page keys, Home, End). Works with Reactive Forms.
 */
@Component({
  selector: 'app-fader',
  template: `
    <output>{{ display() }}</output>
    <div
      #slot
      class="slot"
      role="slider"
      tabindex="0"
      aria-orientation="vertical"
      [attr.aria-label]="label()"
      [attr.aria-valuemin]="min()"
      [attr.aria-valuemax]="max()"
      [attr.aria-valuenow]="value()"
      [attr.aria-valuetext]="display()"
      (pointerdown)="startDrag($event)"
      (pointermove)="drag($event)"
      (pointerup)="endDrag($event)"
      (pointercancel)="endDrag($event)"
      (keydown)="onKey($event)"
    >
      <span class="cap" [style.bottom.%]="position()"></span>
    </div>
    <small>{{ shortLabel() }}</small>
  `,
  styles: `
    :host { display: inline-grid; justify-items: center; gap: 0.3rem; user-select: none; }
    .slot { position: relative; width: 10px; height: var(--fader-height, 150px); background: var(--ink); border-radius: 5px; cursor: pointer; touch-action: none; }
    /* Trait du 0 dB au milieu. */
    .slot::before { content: ''; position: absolute; left: -6px; right: -6px; top: 50%; border-top: 2px dashed var(--muted); }
    .slot:focus-visible { outline: 3px solid var(--magenta); outline-offset: 6px; }
    .cap { position: absolute; left: 50%; width: 30px; height: 16px; margin: 0 0 -8px -15px; background: var(--magenta); border: var(--line); border-radius: 3px; pointer-events: none; }
    small { font-weight: 800; font-size: 0.72rem; }
    output { font: 700 0.7rem ui-monospace, Consolas, monospace; color: var(--muted); }
    /* Sur mobile les 10 valeurs se chevauchent : la position du curseur suffit, aria-valuetext reste lu. */
    @media (max-width: 640px) {
      .cap { width: 22px; margin-left: -11px; }
      output { visibility: hidden; }
    }
  `,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FaderComponent), multi: true }],
})
export class FaderComponent implements ControlValueAccessor {
  /** Full name for the screen readers ("Égaliseur 1 kHz"). */
  readonly label = input.required<string>();
  /** Short name under the fader ("1k"). */
  readonly shortLabel = input('');
  readonly min = input(-12);
  readonly max = input(12);
  readonly step = input(0.5);
  readonly format = input<(value: number) => string>((v) => String(v));

  readonly value = signal(0);
  protected readonly display = computed(() => this.format()(this.value()));
  protected readonly position = computed(() => toRatio(this.value(), this.scale()) * 100);
  private readonly scale = computed<ControlScale>(() => ({ min: this.min(), max: this.max(), step: this.step() }));
  private readonly slot = viewChild.required<ElementRef<HTMLElement>>('slot');

  private dragging = false;
  private onChange: (value: number) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: number | null): void {
    this.value.set(value ?? 0);
  }
  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  protected startDrag(event: PointerEvent): void {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.dragging = true;
    this.moveTo(event.clientY);
  }

  protected drag(event: PointerEvent): void {
    if (this.dragging) this.moveTo(event.clientY);
  }

  protected endDrag(event: PointerEvent): void {
    if (!this.dragging) return;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    this.dragging = false;
    this.onTouched();
  }

  protected onKey(event: KeyboardEvent): void {
    const next = keyValue(event.key, this.value(), this.scale());
    if (next === null) return;
    event.preventDefault();
    this.commit(next);
    this.onTouched();
  }

  /** Top of the slot = max, bottom = min. */
  private moveTo(clientY: number): void {
    const rect = this.slot().nativeElement.getBoundingClientRect();
    if (!rect.height) return;
    this.commit(fromRatio(1 - (clientY - rect.top) / rect.height, this.scale()));
  }

  private commit(value: number): void {
    if (value === this.value()) return;
    this.value.set(value);
    this.onChange(value);
  }
}
