import { Component, input } from '@angular/core';

/** Íconos de trazo fino (24 × 24) para los botones: toman el color del texto. */
@Component({
  selector: 'app-icono',
  host: { style: 'display: inline-flex' },
  template: `
    <svg viewBox="0 0 24 24" [attr.width]="tamano()" [attr.height]="tamano()" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @switch (nombre()) {
        @case ('play') {
          <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />
        }
        @case ('trailer') {
          <path d="M8 5v14l11-7z" />
        }
        @case ('mas') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('check') {
          <path d="M5 13l4 4L19 7" />
        }
        @case ('menu') {
          <path d="M4 7h16M4 12h16M4 17h16" />
        }
        @case ('reiniciar') {
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        }
        @case ('atras') {
          <path d="M15 5l-7 7 7 7" />
        }
      }
    </svg>
  `,
})
export class Icono {
  readonly nombre = input.required<'play' | 'trailer' | 'mas' | 'check' | 'menu' | 'reiniciar' | 'atras'>();
  readonly tamano = input(20);
}
