import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { FaderComponent } from './fader';

@Component({
  imports: [FaderComponent, ReactiveFormsModule],
  template: `<app-fader [formControl]="control" label="Égaliseur 1kHz" shortLabel="1k" />`,
})
class HostComponent {
  readonly control = new FormControl(0, { nonNullable: true });
}

describe('FaderComponent', () => {
  let host: HostComponent;
  let slot: HTMLElement;

  beforeEach(async () => {
    const fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await fixture.whenStable();
    slot = fixture.nativeElement.querySelector('[role="slider"]');
  });

  it('est un slider vertical accessible, de -12 à +12 dB', () => {
    expect(slot.getAttribute('aria-orientation')).toBe('vertical');
    expect(slot.getAttribute('aria-valuemin')).toBe('-12');
    expect(slot.getAttribute('aria-valuemax')).toBe('12');
    expect(slot.getAttribute('aria-label')).toBe('Égaliseur 1kHz');
  });

  it('se règle par demi-décibel au clavier', () => {
    slot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    slot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(host.control.value).toBe(1);
    slot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(host.control.value).toBe(-12);
  });

  it("prend la valeur de l'endroit cliqué (haut = +12, bas = -12)", () => {
    vi.spyOn(slot, 'getBoundingClientRect').mockReturnValue({ top: 100, height: 200 } as DOMRect);
    slot.dispatchEvent(new PointerEvent('pointerdown', { clientY: 150, pointerId: 1 }));
    slot.dispatchEvent(new PointerEvent('pointerup', { clientY: 150, pointerId: 1 }));
    expect(host.control.value).toBe(6);
  });
});
