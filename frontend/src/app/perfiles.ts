import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Perfil, Sesion } from './sesion';

/** «¿Quién está mirando?». */
@Component({
  selector: 'app-perfiles',
  template: `
    <main class="centrado">
      <h1 class="marca">Max<span>Flix</span></h1>
      <h2 class="pregunta">¿Quién está mirando?</h2>
      <div class="perfiles">
        @for (p of perfiles(); track p.id) {
          <button class="perfil" (click)="elegir(p)">
            @if (p.avatarUrl) {
              <img [src]="p.avatarUrl" alt="" />
            } @else {
              <span class="inicial">{{ p.nombre[0] }}</span>
            }
            {{ p.nombre }}
          </button>
        }
      </div>
      <button class="enlace" (click)="salir()">Cerrar sesión</button>
    </main>
  `,
})
export class Perfiles {
  private readonly sesion = inject(Sesion);
  private readonly router = inject(Router);
  protected readonly perfiles = signal<Perfil[]>([]);

  constructor() {
    inject(HttpClient)
      .get<{ perfiles: Perfil[] }>('/api/perfiles')
      .subscribe((r) => this.perfiles.set(r.perfiles));
  }

  protected elegir(perfil: Perfil) {
    this.sesion.elegirPerfil(perfil);
    this.router.navigateByUrl('/');
  }

  protected salir() {
    this.sesion.cerrar();
    this.router.navigateByUrl('/entrar');
  }
}
