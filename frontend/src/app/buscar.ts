import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, Injectable, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, merge, Observable, of, Subject, switchMap, tap } from 'rxjs';
import { Barra } from './barra';
import { SagaResumen, Titulo } from './datos';

interface Resultado {
  id: string;
  type: string;
  name: string;
  poster?: string;
}

interface Persona {
  id: number;
  nombre: string;
  foto?: string | null;
  conocidoPor?: string[];
}

interface SagaBuscada {
  saga: SagaResumen;
  peliculas: Titulo[];
}

type Filtro = 'todo' | 'movie' | 'series' | 'sagas';

const CINEMETA = 'https://v3-cinemeta.strem.io/catalog/';
const ESPERA_MS = 350;
const MAXIMO_ACTORES = 8;
const MAXIMO_RECIENTES = 30;
const CLAVE_RECIENTES = 'maxflix.busquedas';

const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Cada palabra escrita tiene que empezar alguna palabra del nombre: «tom han» encuentra a Tom Hanks. */
function coincideNombre(nombre: string, consulta: string) {
  const palabras = sinTildes(nombre).split(/[^a-z0-9]+/);
  return sinTildes(consulta)
    .split(/\s+/)
    .filter(Boolean)
    .every((c) => palabras.some((p) => p.startsWith(c)));
}

function leerRecientes(): string[] {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) ?? '[]');
    return Array.isArray(lista) ? lista.filter((x) => typeof x === 'string').slice(0, MAXIMO_RECIENTES) : [];
  } catch {
    return [];
  }
}

/**
 * La búsqueda, fuera de la pantalla: al abrir una ficha y volver, queda lo escrito y los resultados.
 * Cinemeta (películas y series), personas y sagas se piden a la vez y cada parte se muestra al llegar.
 */
@Injectable({ providedIn: 'root' })
export class EstadoBusqueda {
  private readonly http = inject(HttpClient);
  readonly texto = signal('');
  readonly peliculas = signal<Resultado[]>([]);
  readonly series = signal<Resultado[]>([]);
  readonly personas = signal<Persona[]>([]);
  readonly sagas = signal<SagaBuscada[]>([]);
  readonly pendientes = signal(0);
  readonly recientes = signal<string[]>(leerRecientes());
  private readonly entrada = new Subject<string>();
  private generacion = 0;

  constructor() {
    this.entrada
      .pipe(
        map((t) => t.trim()),
        debounceTime(ESPERA_MS),
        distinctUntilChanged(),
        switchMap((t) => this.buscar(t)),
      )
      .subscribe();
  }

  escribir(texto: string) {
    this.texto.set(texto);
    this.entrada.next(texto);
  }

  private limpiar() {
    this.peliculas.set([]);
    this.series.set([]);
    this.personas.set([]);
    this.sagas.set([]);
  }

  private buscar(t: string): Observable<unknown> {
    const generacion = ++this.generacion;
    this.limpiar();
    if (t.length < 2) {
      this.pendientes.set(0);
      return of(null);
    }
    this.pendientes.set(4);
    const parte = <T>(origen: Observable<T>, alLlegar: (x: T) => void) =>
      origen.pipe(
        tap(alLlegar),
        catchError(() => of(null)),
        finalize(() => generacion === this.generacion && this.pendientes.update((n) => Math.max(0, n - 1))),
      );
    const titulos = (tipo: string) => this.http.get<{ metas: Resultado[] }>(CINEMETA + tipo + '/top/search=' + encodeURIComponent(t) + '.json');
    return merge(
      parte(titulos('movie'), (r) => this.peliculas.set((r.metas ?? []).filter((x) => /^tt\d+$/.test(x.id)))),
      parte(titulos('series'), (r) => this.series.set((r.metas ?? []).filter((x) => /^tt\d+$/.test(x.id)))),
      parte(this.http.get<{ personas: Persona[] }>('/api/personas?q=' + encodeURIComponent(t)), (r) =>
        this.personas.set((r.personas ?? []).filter((p) => coincideNombre(p.nombre, t)).slice(0, MAXIMO_ACTORES)),
      ),
      parte(this.http.get<{ sagas: SagaBuscada[] }>('/api/sagas?q=' + encodeURIComponent(t)), (r) => this.sagas.set(r.sagas ?? [])),
    ).pipe(
      finalize(() => {
        if (generacion === this.generacion && this.peliculas().length + this.series().length + this.sagas().length > 0) this.recordar(t);
      }),
    );
  }

  private recordar(t: string) {
    const lista = [t, ...this.recientes().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAXIMO_RECIENTES);
    this.recientes.set(lista);
    try {
      localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista));
    } catch {
      // Sin almacenamiento: no se recuerdan
    }
  }

  borrarRecientes() {
    this.recientes.set([]);
    try {
      localStorage.removeItem(CLAVE_RECIENTES);
    } catch {
      // Sin almacenamiento
    }
  }
}

/** Buscar: títulos, sagas y actores, con filtros y las últimas búsquedas. */
@Component({
  selector: 'app-buscar',
  imports: [RouterLink, Barra],
  template: `
    <app-barra />
    <main class="pagina con-barra">
      <input class="ancho buscador" type="search" placeholder="Película, serie, saga o actor" aria-label="Buscar" autofocus [value]="b.texto()" (input)="b.escribir($any($event.target).value)" />

      @if (!consulta() && b.recientes().length) {
        <div class="recientes">
          <span class="etiqueta">Búsquedas recientes</span>
          @for (r of b.recientes(); track r) {
            <button class="chip-filtro" (click)="b.escribir(r)">{{ r }}</button>
          }
          <button class="enlace" (click)="b.borrarRecientes()">Borrar</button>
        </div>
      }

      @if (consulta()) {
        <div class="filtros">
          @for (f of filtros; track f.valor) {
            <button class="chip-filtro" [class.activo]="!soloActores() && filtro() === f.valor" (click)="elegirFiltro(f.valor)">{{ f.nombre }} · {{ cantidad(f.valor) }}</button>
          }
          @if (b.personas().length) {
            <button class="chip-filtro" [class.activo]="soloActores()" (click)="soloActores.set(!soloActores())">Actores y actrices · {{ b.personas().length }}</button>
          }
        </div>
        @if (b.pendientes() > 0) {
          <p class="nota">Buscando…</p>
        } @else if (!hayAlgo()) {
          <p class="nota">Sin resultados para «{{ consulta() }}».</p>
        }
      }

      @if (soloActores()) {
        <div class="grilla actores">
          @for (p of b.personas(); track p.id) {
            <a class="actor" [routerLink]="['/persona', p.id]">
              @if (p.foto) {
                <img [src]="p.foto" [alt]="p.nombre" loading="lazy" />
              } @else {
                <span class="inicial">{{ p.nombre[0] }}</span>
              }
              <b>{{ p.nombre }}</b>
              @if (p.conocidoPor?.length) {
                <span class="nota">{{ p.conocidoPor?.slice(0, 2)?.join(', ') }}</span>
              }
            </a>
          }
        </div>
      } @else {
        @for (s of sagasVisibles(); track s.saga.id) {
          <a class="tarjeta-saga-grande" [routerLink]="['/saga', s.saga.id]" [style.background-image]="s.saga.fondo ? 'url(&quot;' + s.saga.fondo + '&quot;)' : 'none'">
            <span class="tarjeta-saga-texto">
              <span class="etiqueta">{{ s.saga.cantidad === 3 ? 'Trilogía' : 'Saga completa' }}</span>
              <b>{{ s.saga.nombre }}</b>
              <span class="nota">{{ s.saga.cantidad }} películas · {{ s.saga.anios }}</span>
              <span class="principal chico">▶ Explorar saga completa</span>
            </span>
          </a>
        }
        <div class="grilla">
          @for (r of titulosVisibles(); track r.type + r.id) {
            <a class="poster" [routerLink]="['/titulo', r.type, r.id]" [attr.aria-label]="r.name">
              @if (r.poster) {
                <img [src]="r.poster" [alt]="r.name" loading="lazy" />
              } @else {
                <span class="sin-poster">{{ r.name }}</span>
              }
            </a>
          }
        </div>
      }
    </main>
  `,
})
export class Buscar {
  protected readonly b = inject(EstadoBusqueda);
  protected readonly filtros: { valor: Filtro; nombre: string }[] = [
    { valor: 'todo', nombre: 'Todo' },
    { valor: 'movie', nombre: 'Películas' },
    { valor: 'series', nombre: 'Series' },
    { valor: 'sagas', nombre: 'Colecciones y sagas' },
  ];
  protected readonly filtro = signal<Filtro>('todo');
  protected readonly soloActores = signal(false);
  protected readonly consulta = computed(() => this.b.texto().trim().length >= 2 ? this.b.texto().trim() : '');

  // Películas y series entreveradas, sin repetir
  private readonly mezcla = computed(() => {
    const m = this.b.peliculas();
    const s = this.b.series();
    const todo: Resultado[] = [];
    for (let i = 0; i < Math.max(m.length, s.length); i++) {
      if (m[i]) todo.push(m[i]);
      if (s[i]) todo.push(s[i]);
    }
    return todo.filter((r, i) => todo.findIndex((x) => x.id === r.id) === i);
  });
  protected readonly titulosVisibles = computed(() => {
    switch (this.filtro()) {
      case 'movie':
        return this.b.peliculas();
      case 'series':
        return this.b.series();
      case 'sagas':
        return [];
      default:
        return this.mezcla();
    }
  });
  // En «Todo» solo la primera saga; en «Colecciones y sagas», todas
  protected readonly sagasVisibles = computed(() => (this.filtro() === 'todo' ? this.b.sagas().slice(0, 1) : this.filtro() === 'sagas' ? this.b.sagas() : []));
  protected readonly hayAlgo = computed(() => this.mezcla().length + this.b.sagas().length + this.b.personas().length > 0);

  protected cantidad(f: Filtro) {
    switch (f) {
      case 'movie':
        return this.b.peliculas().length;
      case 'series':
        return this.b.series().length;
      case 'sagas':
        return this.b.sagas().length;
      default:
        return this.mezcla().length + this.b.sagas().length;
    }
  }

  protected elegirFiltro(f: Filtro) {
    this.soloActores.set(false);
    this.filtro.set(f);
  }
}
