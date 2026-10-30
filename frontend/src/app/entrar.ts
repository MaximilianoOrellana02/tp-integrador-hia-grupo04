import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Sesion } from './sesion';

/** Iniciar sesión o crear una cuenta. El backend dice si el registro está abierto. */
@Component({
  selector: 'app-entrar',
  imports: [FormsModule],
  template: `
    <div class="mosaico" aria-hidden="true">
      @for (p of posters(); track $index) {
        <img [src]="p" alt="" />
      }
    </div>
    <main class="centrado sobre-mosaico">
      <h1 class="marca"><span class="logo-cuadro" aria-hidden="true"></span>MaxFlix</h1>
      <form class="tarjeta vidrio" (ngSubmit)="enviar()">
        <h2>{{ creando() ? 'Crear cuenta' : 'Iniciar sesión' }}</h2>
        @if (creando()) {
          <input name="nombre" placeholder="Nombre" aria-label="Nombre" autocomplete="name" required [(ngModel)]="nombre" />
        }
        <input name="email" type="email" placeholder="Email" aria-label="Email" autocomplete="email" required [(ngModel)]="email" />
        <input name="password" type="password" placeholder="Contraseña" aria-label="Contraseña" required minlength="8" [(ngModel)]="password" />
        <button class="principal" [disabled]="enviando()">{{ creando() ? 'Crear cuenta' : 'Entrar' }}</button>
        @if (registroAbierto()) {
          <button type="button" class="enlace" (click)="creando.set(!creando()); aviso.set(null)">
            {{ creando() ? 'Ya tengo cuenta' : 'Crear una cuenta' }}
          </button>
        }
        @if (aviso(); as texto) {
          <p class="aviso">{{ texto }}</p>
        }
      </form>
    </main>
  `,
})
export class Entrar {
  private readonly http = inject(HttpClient);
  private readonly sesion = inject(Sesion);
  private readonly router = inject(Router);

  protected readonly creando = signal(false);
  protected readonly registroAbierto = signal(false);
  protected readonly posters = signal<string[]>([]);
  protected readonly enviando = signal(false);
  protected readonly aviso = signal<string | null>(null);
  protected nombre = '';
  protected email = '';
  protected password = '';

  constructor() {
    this.http.get<{ posters: string[] }>('/api/bienvenida').subscribe((r) => this.posters.set((r.posters ?? []).slice(0, 24)));
    this.http.get<{ habilitado: boolean }>('/api/auth/registro').subscribe((r) => this.registroAbierto.set(r.habilitado));
  }

  protected enviar() {
    this.enviando.set(true);
    this.aviso.set(null);
    const pedido = this.creando()
      ? this.http.post<{ token: string }>('/api/auth/registro', { nombre: this.nombre, email: this.email, password: this.password })
      : this.http.post<{ token: string }>('/api/auth/login', { email: this.email, password: this.password });
    pedido.subscribe({
      next: (r) => {
        this.sesion.iniciar(r.token);
        this.router.navigateByUrl('/perfiles');
      },
      error: (e: HttpErrorResponse) => {
        this.aviso.set(e.error?.error ?? 'No se pudo conectar con el servidor.');
        this.enviando.set(false);
      },
    });
  }
}
