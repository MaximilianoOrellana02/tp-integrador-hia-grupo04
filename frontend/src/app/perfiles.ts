import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AvatarVista } from './avatar';
import { Perfil, Sesion } from './sesion';

interface AvatarElegible {
  clave: string;
  url: string | null;
}

const MAXIMO_PERFILES = 5;

/** «¿Quién está mirando?», con «Agregar perfil» (hasta 5) y selector de avatar. */
@Component({
  selector: 'app-perfiles',
  imports: [FormsModule, AvatarVista],
  template: `
    <main class="centrado">
      <h1 class="marca"><span class="logo-cuadro" aria-hidden="true"></span>MaxFlix</h1>
      <h2 class="pregunta">¿Quién está mirando?</h2>
      <div class="perfiles">
        @for (p of perfiles(); track p.id) {
          <button class="perfil" (click)="elegir(p)">
            <app-avatar [nombre]="p.nombre" [avatar]="p.avatar" [url]="p.avatarUrl" [tamano]="128" />
            {{ p.nombre }}
          </button>
        }
        @if (cargado() && perfiles().length < maximo) {
          <button class="perfil agregar" (click)="abrir()">
            <span class="mas">＋</span>
            Agregar perfil
          </button>
        }
      </div>
      @if (aviso(); as texto) {
        <p class="aviso">{{ texto }}</p>
      }
      <button class="enlace" (click)="salir()">Cerrar sesión</button>
    </main>

    @if (dialogo()) {
      <div class="cortina-dialogo" (click)="cerrar()">
        <form class="tarjeta vidrio dialogo" (click)="$event.stopPropagation()" (ngSubmit)="crear()">
          <h2>Nuevo perfil</h2>
          <div class="previa"><app-avatar [nombre]="nombre" [avatar]="avatarElegido()" [url]="urlDe(avatarElegido())" [tamano]="96" /></div>
          <input name="nombre" maxlength="30" placeholder="Nombre" aria-label="Nombre del perfil" required [(ngModel)]="nombre" />
          <div class="selector-avatar" role="radiogroup" aria-label="Avatar">
            @for (a of avatares(); track a.clave) {
              <button type="button" role="radio" [attr.aria-checked]="a.clave === avatarElegido()" [class.elegido]="a.clave === avatarElegido()" (click)="avatarElegido.set(a.clave)" [attr.aria-label]="'Avatar ' + a.clave">
                <app-avatar [nombre]="nombre" [avatar]="a.clave" [url]="a.url" [tamano]="52" />
              </button>
            }
          </div>
          @if (errorDialogo(); as texto) {
            <p class="aviso">{{ texto }}</p>
          }
          <div class="botones">
            <button class="principal" [disabled]="guardando()">Crear perfil</button>
            <button type="button" class="secundario" (click)="cerrar()">Cancelar</button>
          </div>
        </form>
      </div>
    }
  `,
})
export class Perfiles {
  private readonly http = inject(HttpClient);
  private readonly sesion = inject(Sesion);
  private readonly router = inject(Router);

  protected readonly maximo = MAXIMO_PERFILES;
  protected readonly perfiles = signal<Perfil[]>([]);
  protected readonly cargado = signal(false);
  protected readonly aviso = signal<string | null>(null);
  protected readonly dialogo = signal(false);
  protected readonly avatares = signal<AvatarElegible[]>([]);
  protected readonly avatarElegido = signal('avatar_01');
  protected readonly errorDialogo = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected nombre = '';

  constructor() {
    this.http.get<{ perfiles: Perfil[] }>('/api/perfiles').subscribe({
      next: (r) => {
        this.perfiles.set(r.perfiles);
        this.cargado.set(true);
      },
      error: () => this.aviso.set('No se pudieron cargar los perfiles.'),
    });
  }

  protected elegir(perfil: Perfil) {
    this.sesion.elegirPerfil(perfil);
    this.router.navigateByUrl('/');
  }

  protected salir() {
    this.sesion.cerrar();
    this.router.navigateByUrl('/entrar');
  }

  protected abrir() {
    this.nombre = '';
    this.errorDialogo.set(null);
    this.dialogo.set(true);
    if (!this.avatares().length) {
      this.http.get<{ avatares: AvatarElegible[] }>('/api/avatares').subscribe({ next: (r) => this.avatares.set(r.avatares), error: () => undefined });
    }
    // Arranca en el primer avatar que nadie usa
    const usados = new Set(this.perfiles().map((p) => p.avatar));
    this.avatarElegido.set(Array.from({ length: 12 }, (_, i) => 'avatar_' + String(i + 1).padStart(2, '0')).find((c) => !usados.has(c)) ?? 'avatar_01');
  }

  protected cerrar() {
    this.dialogo.set(false);
  }

  protected urlDe(clave: string) {
    return this.avatares().find((a) => a.clave === clave)?.url ?? null;
  }

  protected crear() {
    const nombre = this.nombre.trim();
    if (!nombre) return;
    if (this.perfiles().some((p) => p.nombre.toLowerCase() === nombre.toLowerCase())) {
      this.errorDialogo.set('Ya hay un perfil con ese nombre.');
      return;
    }
    this.guardando.set(true);
    this.errorDialogo.set(null);
    this.http.post<{ perfil: Perfil }>('/api/perfiles', { nombre, avatar: this.avatarElegido() }).subscribe({
      next: (r) => {
        this.perfiles.update((lista) => [...lista, r.perfil]);
        this.guardando.set(false);
        this.dialogo.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.errorDialogo.set(e.error?.error ?? 'No se pudo crear el perfil.');
        this.guardando.set(false);
      },
    });
  }
}
