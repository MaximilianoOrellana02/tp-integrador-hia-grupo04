import { HttpClient } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AvatarVista } from './avatar';
import { Icono } from './iconos';
import { Sesion } from './sesion';

/** La barra de arriba: cápsula de vidrio con las secciones, la lupa y el menú del perfil. */
@Component({
  selector: 'app-barra',
  imports: [RouterLink, RouterLinkActive, AvatarVista, Icono],
  template: `
    <header class="barra-fija">
      <div class="barra-izquierda">
        @if (atras()) {
          <button class="boton-cuadrado" (click)="volver()" aria-label="Volver"><app-icono nombre="atras" [tamano]="22" /></button>
        }
        <a class="marca chica" routerLink="/"><span class="logo-cuadro" aria-hidden="true"></span>MaxFlix</a>
      </div>
      <nav class="capsula" aria-label="Secciones">
        <a routerLink="/" routerLinkActive="activa" [routerLinkActiveOptions]="{ exact: true }">Para ti</a>
        <a routerLink="/peliculas" routerLinkActive="activa">Películas</a>
        <a routerLink="/series" routerLinkActive="activa">Series</a>
        <a routerLink="/mi-lista" routerLinkActive="activa">Mi lista</a>
      </nav>
      <div class="barra-derecha">
        <a class="boton-icono" routerLink="/buscar" routerLinkActive="activa" aria-label="Buscar">🔍</a>
        <button class="avatar-chico" (click)="menu.set(!menu())" aria-haspopup="menu" [attr.aria-expanded]="menu()" aria-label="Menú del perfil">
          <app-avatar [nombre]="sesion.perfil()?.nombre ?? ''" [avatar]="sesion.perfil()?.avatar ?? 'avatar_01'" [url]="sesion.perfil()?.avatarUrl" [tamano]="38" [redondo]="true" />
        </button>
        @if (menu()) {
          <div class="cortina" (click)="menu.set(false)"></div>
          <div class="menu-perfil vidrio" role="menu">
            <b>{{ sesion.perfil()?.nombre }}</b>
            <a role="menuitem" routerLink="/ajustes" (click)="menu.set(false)">Ajustes</a>
            <a role="menuitem" routerLink="/perfiles" (click)="menu.set(false)">Cambiar perfil</a>
            @if (sesion.esAdmin()) {
              <span class="separador"></span>
              <a role="menuitem" routerLink="/admin/usuarios" (click)="menu.set(false)">Usuarios</a>
              <a role="menuitem" routerLink="/admin/avatares" (click)="menu.set(false)">Avatares</a>
            }
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
  /** Muestra un botón cuadrado de volver a la izquierda del logo (en la ficha). */
  readonly atras = input(false);
  protected readonly menu = signal(false);

  constructor() {
    if (this.sesion.token() && !this.sesion.rolCargado) {
      this.sesion.rolCargado = true;
      inject(HttpClient)
        .get<{ cuenta: { rol: string } }>('/api/auth/me')
        .subscribe({
          next: (r) => this.sesion.esAdmin.set(r.cuenta.rol === 'admin'),
          error: () => (this.sesion.rolCargado = false),
        });
    }
  }

  protected volver() {
    history.length > 1 ? history.back() : this.router.navigateByUrl('/');
  }

  protected salir() {
    this.sesion.cerrar();
    this.router.navigateByUrl('/entrar');
  }
}
