import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Barra } from './barra';
import { Carrusel } from './piezas';
import { Copia, Titulo } from './datos';
import { Sesion } from './sesion';

interface Guardado {
  titulo: Copia;
  agregado: string;
}

type Filtro = 'todo' | 'movie' | 'series';
type Orden = 'agregado' | 'nombre' | 'puntaje' | 'anio';

const NUEVO_MS = 48 * 60 * 60 * 1000;

/** Mi lista: filtros por tipo, cuatro órdenes, «Al azar» y sugerencias a partir de lo último agregado. */
@Component({
  selector: 'app-mi-lista',
  imports: [RouterLink, Barra, Carrusel],
  template: `
    <app-barra />
    <main class="pagina con-barra">
      <div class="titulo-seccion">
        <div>
          <h1>Mi lista</h1>
          <p class="nota">{{ cantidad('movie') }} películas · {{ cantidad('series') }} series</p>
        </div>
        @if (guardados().length) {
          <button class="secundario" (click)="alAzar()">🔀 Al azar</button>
        }
      </div>

      @if (guardados().length) {
        <div class="filtros">
          @for (f of filtros; track f.valor) {
            <button class="chip-filtro" [class.activo]="filtro() === f.valor" (click)="filtro.set(f.valor)">
              {{ f.nombre }} · {{ cantidad(f.valor) }}
            </button>
          }
          <select aria-label="Ordenar" (change)="orden.set($any($event.target).value)">
            @for (o of ordenes; track o.valor) {
              <option [value]="o.valor" [selected]="orden() === o.valor">{{ o.nombre }}</option>
            }
          </select>
        </div>
      }

      <div class="grilla">
        @for (g of visibles(); track g.titulo.id) {
          <div class="tarjeta-lista">
            <a class="poster" [routerLink]="['/titulo', g.titulo.tipo, g.titulo.id]" [attr.aria-label]="g.titulo.nombre">
              @if (esNuevo(g)) {
                <span class="insignia">Nuevo</span>
              }
              @if (g.titulo.poster) {
                <img [src]="g.titulo.poster" [alt]="g.titulo.nombre" loading="lazy" />
              } @else {
                <span class="sin-poster">{{ g.titulo.nombre }}</span>
              }
            </a>
            <button class="quitar" (click)="quitar(g)" [attr.aria-label]="'Quitar ' + g.titulo.nombre + ' de Mi lista'">✕</button>
          </div>
        }
      </div>
      @if (cargada() && !guardados().length) {
        <p class="nota">Todavía no guardaste nada. Tocá «＋ Mi lista» en la ficha de una película o serie.</p>
      }

      @if (sugeridos().length) {
        <app-carrusel [interna]="true" class="sugeridos">
          <span titulo>Para sumar a tu lista</span>
            @for (t of sugeridos(); track t.imdbId) {
              <a class="poster" [routerLink]="['/titulo', t.tipo, t.imdbId]" [attr.aria-label]="t.titulo">
                @if (t.poster) {
                  <img [src]="t.poster" [alt]="t.titulo" loading="lazy" />
                } @else {
                  <span class="sin-poster">{{ t.titulo }}</span>
                }
              </a>
            }
        </app-carrusel>
      }
    </main>
  `,
})
export class MiLista {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly perfil = inject(Sesion).perfil();

  protected readonly filtros: { valor: Filtro; nombre: string }[] = [
    { valor: 'todo', nombre: 'Todo' },
    { valor: 'movie', nombre: 'Películas' },
    { valor: 'series', nombre: 'Series' },
  ];
  protected readonly ordenes: { valor: Orden; nombre: string }[] = [
    { valor: 'agregado', nombre: 'Agregado recientemente' },
    { valor: 'nombre', nombre: 'Nombre' },
    { valor: 'puntaje', nombre: 'Puntaje IMDb' },
    { valor: 'anio', nombre: 'Año' },
  ];
  protected readonly guardados = signal<Guardado[]>([]);
  protected readonly parecidos = signal<Titulo[]>([]);
  protected readonly cargada = signal(false);
  protected readonly filtro = signal<Filtro>('todo');
  protected readonly orden = signal<Orden>('agregado');

  protected readonly visibles = computed(() => {
    const f = this.filtro();
    const lista = this.guardados().filter((g) => f === 'todo' || g.titulo.tipo === f);
    const numero = (v?: string | null) => parseFloat(v ?? '') || 0;
    switch (this.orden()) {
      case 'nombre':
        return [...lista].sort((a, b) => a.titulo.nombre.localeCompare(b.titulo.nombre, 'es'));
      case 'puntaje':
        return [...lista].sort((a, b) => numero(b.titulo.puntajeImdb) - numero(a.titulo.puntajeImdb));
      case 'anio':
        return [...lista].sort((a, b) => numero(b.titulo.anio) - numero(a.titulo.anio));
      default:
        return lista;
    }
  });
  protected readonly sugeridos = computed(() => {
    const enLista = new Set(this.guardados().map((g) => g.titulo.id));
    return this.parecidos().filter((t) => t.imdbId && !enLista.has(t.imdbId));
  });

  constructor() {
    if (!this.perfil) {
      this.router.navigateByUrl('/perfiles');
      return;
    }
    this.http.get<{ lista: Guardado[] }>('/api/perfiles/' + this.perfil.id + '/lista').subscribe({
      next: (r) => {
        this.guardados.set(r.lista);
        this.cargada.set(true);
        const ultimo = r.lista[0]?.titulo;
        if (ultimo) {
          this.http
            .get<{ titulos: Titulo[] }>('/api/recomendaciones/' + ultimo.tipo + '/' + ultimo.id)
            .subscribe({ next: (x) => this.parecidos.set(x.titulos), error: () => undefined });
        }
      },
      error: () => this.cargada.set(true),
    });
  }

  protected cantidad(f: Filtro) {
    return f === 'todo' ? this.guardados().length : this.guardados().filter((g) => g.titulo.tipo === f).length;
  }

  protected esNuevo(g: Guardado) {
    return Date.now() - new Date(g.agregado).getTime() < NUEVO_MS;
  }

  protected alAzar() {
    const lista = this.visibles();
    if (!lista.length) return;
    const g = lista[Math.floor(Math.random() * lista.length)];
    this.router.navigate(['/titulo', g.titulo.tipo, g.titulo.id]);
  }

  /** Se quita al instante; si el backend falla, vuelve. */
  protected quitar(g: Guardado) {
    if (!this.perfil) return;
    const antes = this.guardados();
    this.guardados.set(antes.filter((x) => x !== g));
    this.http.delete('/api/perfiles/' + this.perfil.id + '/lista/' + g.titulo.id).subscribe({ error: () => this.guardados.set(antes) });
  }
}
