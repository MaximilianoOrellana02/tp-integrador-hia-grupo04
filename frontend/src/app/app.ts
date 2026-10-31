import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Apariencia } from './apariencia';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  template: '<router-outlet />',
})
export class App {
  constructor() {
    // Aplica el modo de animaciones guardado apenas arranca
    inject(Apariencia);
  }
}
