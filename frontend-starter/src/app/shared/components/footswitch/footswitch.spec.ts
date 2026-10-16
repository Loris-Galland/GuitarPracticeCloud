import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { FootswitchComponent } from './footswitch';

@Component({
  imports: [FootswitchComponent, ReactiveFormsModule],
  template: `<app-footswitch [formControl]="control" label="Distorsion" />`,
})
class HostComponent {
  readonly control = new FormControl(false, { nonNullable: true });
}

describe('FootswitchComponent', () => {
  it("allume et éteint la pédale, avec l'état annoncé et la LED", async () => {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    const led = fixture.nativeElement.querySelector('.led') as HTMLElement;

    expect(button.getAttribute('role')).toBe('switch');
    expect(button.getAttribute('aria-checked')).toBe('false');

    button.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.control.value).toBe(true);
    expect(button.getAttribute('aria-checked')).toBe('true');
    expect(led.classList).toContain('lit');

    button.click();
    expect(fixture.componentInstance.control.value).toBe(false);
  });

  it('suit une valeur posée par le formulaire', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.control.setValue(true);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button').getAttribute('aria-checked')).toBe('true');
  });
});
