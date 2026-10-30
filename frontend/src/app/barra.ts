import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Sesion } from './sesion';

/** La barra de arriba: cápsula de vidrio con las secciones, la lupa y el menú del perfil. */
@Component({
  selector: 'app-barra',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="barra-fija">
      <a class="marca chica" routerLink="/">Max<span>Flix</span></a>
      <nav class="capsula" aria-label="Secciones">
        <a routerLink="/" routerLinkActive="activa" [routerLinkActiveOptions]="{ exact: true }">Para ti</a>
        <a routerLink="/peliculas" routerLinkActive="activa">Películas</a>
        <a routerLink="/series" routerLinkActive="activa">Series</a>
        <a routerLink="/mi-lista" routerLinkActive="activa">Mi lista</a>
      </nav>
      <div class="barra-derecha">
        <a class="boton-icono" routerLink="/buscar" routerLinkActive="activa" aria-label="Buscar">🔍</a>
        <button class="avatar-chico" (click)="menu.set(!menu())" aria-haspopup="menu" [attr.aria-expanded]="menu()" aria-label="Menú del perfil">
          @if (sesion.perfil()?.avatarUrl; as url) {
            <img [src]="url" alt="" />
          } @else {
            {{ sesion.perfil()?.nombre?.[0] ?? '?' }}
          }
        </button>
        @if (menu()) {
          <div class="cortina" (click)="menu.set(false)"></div>
          <div class="menu-perfil vidrio" role="menu">
            <b>{{ sesion.perfil()?.nombre }}</b>
            <a role="menuitem" routerLink="/ajustes" (click)="menu.set(false)">Ajustes</a>
            <a role="menuitem" routerLink="/perfiles" (click)="menu.set(false)">Cambiar perfil</a>
            <button role="menuitem" (click)="salir()">Cerrar sesión</button>
          </div>
        }
      </div>
    </header>
  `,
})
export class Barra {
  protected readonly sesion = inject(Sesion);
  private readonly router = inject(Router);
  protected readonly menu = signal(false);

  protected salir() {
    this.sesion.cerrar();
    this.router.navigateByUrl('/entrar');
  }
}
