import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel: string;
}

/**
 * Generic confirmation dialog. afterClosed() emits true when the user confirms,
 * and undefined when they cancel (button, Escape key or click outside).
 */
@Component({
  imports: [MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button type="button" class="secondary" mat-dialog-close cdkFocusInitial>Annuler</button>
      <button type="button" class="danger" [mat-dialog-close]="true">{{ data.confirmLabel }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .secondary { background: var(--white); }
    .danger { background: var(--magenta); }
    mat-dialog-actions { gap: 0.6rem; padding: 0 1.5rem 1.4rem; }
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
