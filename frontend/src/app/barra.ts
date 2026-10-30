import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Sesion } from './sesion';

/** La barra de arriba: una cápsula de vidrio que queda fija al bajar. */
@Component({
  selector: 'app-barra',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="barra-fija">
      <a class="marca chica" routerLink="/">Max<span>Flix</span></a>
      <nav class="capsula" aria-label="Secciones">
        <a routerLink="/" routerLinkActive="activa" [routerLinkActiveOptions]="{ exact: true }">Inicio</a>
        <a routerLink="/buscar" routerLinkActive="activa">Buscar</a>
        <a routerLink="/ajustes" routerLinkActive="activa">Ajustes</a>
      </nav>
      <a class="avatar-chico" routerLink="/perfiles" [attr.aria-label]="'Cambiar perfil: ' + (sesion.perfil()?.nombre ?? '')">
        @if (sesion.perfil()?.avatarUrl; as url) {
          <img [src]="url" alt="" />
        } @else {
          {{ sesion.perfil()?.nombre?.[0] ?? '?' }}
        }
      </a>
    </header>
  `,
})
export class Barra {
  protected readonly sesion = inject(Sesion);
}
