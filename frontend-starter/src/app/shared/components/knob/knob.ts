import { Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ControlScale, fromRatio, keyValue, toRatio } from '../../utils/scale';

/** The needle turns over 270°, from -135° (min) to +135° (max), like a real pot. */
const SWEEP = 270;
/** Dragging 200 px vertically covers the whole range. */
const DRAG_RANGE_PX = 200;

/**
 * Rotary knob. Drag up/down, scroll, or use the keyboard (arrows, Page keys, Home, End).
 * Double-click puts it back to its default value. Works with Reactive Forms.
 */
@Component({
  selector: 'app-knob',
  template: `
    <div
      class="dial"
      role="slider"
      tabindex="0"
      [attr.aria-label]="label()"
      [attr.aria-valuemin]="min()"
      [attr.aria-valuemax]="max()"
      [attr.aria-valuenow]="value()"
      [attr.aria-valuetext]="display()"
      [attr.aria-disabled]="disabled() || null"
      [style.--angle.deg]="angle()"
      (pointerdown)="startDrag($event)"
      (pointermove)="drag($event)"
      (pointerup)="endDrag($event)"
      (pointercancel)="endDrag($event)"
      (wheel)="onWheel($event)"
      (keydown)="onKey($event)"
      (dblclick)="reset()"
    ></div>
    <span class="name">{{ label() }}</span>
    <output>{{ display() }}</output>
  `,
  styleUrl: './knob.css',
  host: { '[class]': '"size-" + size()' },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => KnobComponent), multi: true }],
})
export class KnobComponent implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly min = input(0);
  readonly max = input(1);
  readonly step = input(0.01);
  /** Logarithmic scale, for frequencies. */
  readonly log = input(false);
  /** Value restored by a double-click. */
  readonly defaultValue = input<number | null>(null);
  /** Turns the value into text for the display and the screen readers. */
  readonly format = input<(value: number) => string>((v) => String(v));
  readonly size = input<'lg' | 'sm'>('lg');

  readonly value = signal(0);
  readonly disabled = signal(false);
  protected readonly display = computed(() => this.format()(this.value()));
  protected readonly angle = computed(() => toRatio(this.value(), this.scale()) * SWEEP - SWEEP / 2);
  private readonly scale = computed<ControlScale>(() => ({
    min: this.min(),
    max: this.max(),
    step: this.step(),
    log: this.log(),
  }));

  private dragStart: { y: number; ratio: number } | null = null;
  private onChange: (value: number) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: number | null): void {
    this.value.set(value ?? this.min());
  }
  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected startDrag(event: PointerEvent): void {
    if (this.disabled()) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.dragStart = { y: event.clientY, ratio: toRatio(this.value(), this.scale()) };
  }

  protected drag(event: PointerEvent): void {
    if (!this.dragStart) return;
    // Up = more, like every hardware knob emulation.
    const delta = (this.dragStart.y - event.clientY) / DRAG_RANGE_PX;
    this.commit(fromRatio(this.dragStart.ratio + delta, this.scale()));
  }

  protected endDrag(event: PointerEvent): void {
    if (!this.dragStart) return;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    this.dragStart = null;
    this.onTouched();
  }

  protected onWheel(event: WheelEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    const ratio = toRatio(this.value(), this.scale()) + (event.deltaY < 0 ? 0.03 : -0.03);
    this.commit(fromRatio(ratio, this.scale()));
  }

  protected onKey(event: KeyboardEvent): void {
    if (this.disabled()) return;
    const next = keyValue(event.key, this.value(), this.scale());
    if (next === null) return;
    event.preventDefault();
    this.commit(next);
    this.onTouched();
  }

  protected reset(): void {
    const value = this.defaultValue();
    if (value !== null && !this.disabled()) this.commit(value);
  }

  private commit(value: number): void {
    if (value === this.value()) return;
    this.value.set(value);
    this.onChange(value);
  }
}
