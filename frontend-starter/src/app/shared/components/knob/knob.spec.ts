import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { KnobComponent } from './knob';
import { formatPercent } from '../../utils/format';

@Component({
  imports: [KnobComponent, ReactiveFormsModule],
  template: `<app-knob [formControl]="control" label="Volume" [defaultValue]="0.8" [format]="format" />`,
})
class HostComponent {
  readonly control = new FormControl(0.5, { nonNullable: true });
  readonly format = formatPercent;
}

describe('KnobComponent', () => {
  let host: HostComponent;
  let dial: HTMLElement;
  let render: () => Promise<void>;

  beforeEach(async () => {
    const fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    render = () => fixture.whenStable();
    await render();
    dial = fixture.nativeElement.querySelector('[role="slider"]');
  });

  const key = (k: string) => dial.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  it('affiche la valeur du formulaire et la décrit aux lecteurs d\'écran', () => {
    expect(dial.getAttribute('aria-label')).toBe('Volume');
    expect(dial.getAttribute('aria-valuenow')).toBe('0.5');
    expect(dial.getAttribute('aria-valuetext')).toBe('50 %');
    // Middle of the range: the needle is straight up.
    expect(dial.style.getPropertyValue('--angle')).toBe('0deg');
  });

  it('se règle au clavier et met à jour le formulaire', async () => {
    key('ArrowUp');
    expect(host.control.value).toBe(0.51);
    key('End');
    expect(host.control.value).toBe(1);
    await render();
    expect(dial.getAttribute('aria-valuetext')).toBe('100 %');
  });

  it('se règle en glissant vers le haut', () => {
    dial.dispatchEvent(new PointerEvent('pointerdown', { clientY: 300, pointerId: 1 }));
    dial.dispatchEvent(new PointerEvent('pointermove', { clientY: 250, pointerId: 1 }));
    dial.dispatchEvent(new PointerEvent('pointerup', { clientY: 250, pointerId: 1 }));
    // 50 px out of 200 px = a quarter of the range.
    expect(host.control.value).toBe(0.75);
    expect(host.control.touched).toBe(true);
  });

  it('revient à sa valeur par défaut au double-clic', () => {
    dial.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(host.control.value).toBe(0.8);
  });

  it("ne bouge plus quand le contrôle est désactivé", async () => {
    host.control.disable();
    await render();
    key('ArrowUp');
    expect(host.control.value).toBe(0.5);
    expect(dial.getAttribute('aria-disabled')).toBe('true');
  });
});
