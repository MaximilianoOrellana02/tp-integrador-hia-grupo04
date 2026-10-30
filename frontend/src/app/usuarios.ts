import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { AvatarVista } from './avatar';
import { Barra } from './barra';

interface Cuenta {
  id: number;
  email: string;
  nombre: string;
  rol: string;
  creada: string;
  ultimoAcceso: string | null;
  perfiles: { id: number; nombre: string; avatar: string; avatarUrl?: string | null }[];
}

type Filtro = 'todas' | 'semana' | 'nunca';

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

/** Administración: las cuentas, sus perfiles y cuándo entraron. Solo lectura. */
@Component({
  selector: 'app-usuarios',
  imports: [Barra, AvatarVista],
  template: `
    <app-barra />
    <main class="pagina con-barra">
      <div class="titulo-seccion">
        <div>
          <span class="etiqueta">Administración</span>
          <h1>Usuarios</h1>
          <p class="nota">{{ cuentas().length }} cuentas · {{ perfilesTotal() }} perfiles</p>
        </div>
        <button class="secundario" (click)="cargar()">Actualizar</button>
      </div>
      <div class="filtros">
        @for (f of filtros; track f.valor) {
          <button class="chip-filtro" [class.activo]="filtro() === f.valor" (click)="filtro.set(f.valor)">{{ f.nombre }} · {{ cantidad(f.valor) }}</button>
        }
      </div>
      @if (error()) {
        <p class="aviso">No se pudieron cargar las cuentas.</p>
      }
      <div class="cuentas">
        @for (c of visibles(); track c.id) {
          <article class="tarjeta-cuenta">
            <div class="cuenta-cabecera">
              <b>{{ c.nombre }}</b>
              @if (c.rol === 'admin') {
                <span class="chip chip-mejor">Admin</span>
              }
              <span class="espacio"></span>
              <button class="enlace" (click)="copiar(c.email)">{{ copiado() === c.email ? '✓ Copiado' : 'Copiar email' }}</button>
            </div>
            <span class="nota">{{ c.email }}</span>
            <span class="nota">Alta {{ fecha(c.creada) }} · {{ ultimoAcceso(c) }}</span>
            <div class="perfiles-cuenta">
              @for (p of c.perfiles; track p.id) {
                <span class="perfil-mini">
                  <app-avatar [nombre]="p.nombre" [avatar]="p.avatar" [url]="p.avatarUrl" [tamano]="26" />
                  {{ p.nombre }}
                </span>
              }
            </div>
          </article>
        }
      </div>
    </main>
  `,
})
export class Usuarios {
  private readonly http = inject(HttpClient);
  protected readonly filtros: { valor: Filtro; nombre: string }[] = [
    { valor: 'todas', nombre: 'Todas' },
    { valor: 'semana', nombre: 'Entraron esta semana' },
    { valor: 'nunca', nombre: 'Nunca entraron' },
  ];
  protected readonly cuentas = signal<Cuenta[]>([]);
  protected readonly filtro = signal<Filtro>('todas');
  protected readonly error = signal(false);
  protected readonly copiado = signal<string | null>(null);
  protected readonly perfilesTotal = computed(() => this.cuentas().reduce((n, c) => n + c.perfiles.length, 0));
  protected readonly visibles = computed(() => this.cuentas().filter((c) => this.cumple(c, this.filtro())));

  constructor() {
    this.cargar();
  }

  protected cargar() {
    this.error.set(false);
    this.http.get<{ cuentas: Cuenta[] }>('/api/admin/cuentas').subscribe({ next: (r) => this.cuentas.set(r.cuentas), error: () => this.error.set(true) });
  }

  private cumple(c: Cuenta, f: Filtro) {
    if (f === 'nunca') return !c.ultimoAcceso;
    if (f === 'semana') return !!c.ultimoAcceso && Date.now() - new Date(c.ultimoAcceso).getTime() < SEMANA_MS;
    return true;
  }

  protected cantidad(f: Filtro) {
    return this.cuentas().filter((c) => this.cumple(c, f)).length;
  }

  protected fecha(iso: string) {
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected ultimoAcceso(c: Cuenta) {
    if (!c.ultimoAcceso) return 'nunca entró';
    const min = Math.round((Date.now() - new Date(c.ultimoAcceso).getTime()) / 60000);
    if (min < 1) return 'último acceso recién';
    if (min < 60) return 'último acceso hace ' + min + ' min';
    if (min < 60 * 24) return 'último acceso hace ' + Math.round(min / 60) + ' h';
    const dias = Math.round(min / 1440);
    return dias === 1 ? 'último acceso ayer' : 'último acceso hace ' + dias + ' días';
  }

  protected copiar(email: string) {
    navigator.clipboard?.writeText(email).then(() => {
      this.copiado.set(email);
      setTimeout(() => this.copiado() === email && this.copiado.set(null), 2000);
    });
  }
}
