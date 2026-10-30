import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Barra } from './barra';
import { Copia, Episodio, Fuente, Progreso, Reproduccion, terminado } from './datos';
import { Sesion } from './sesion';

interface Video {
  id: string;
  season: number;
  episode?: number;
  number?: number;
  name?: string;
  title?: string;
  thumbnail?: string;
}

interface Meta {
  name: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  genres?: string[];
  videos?: Video[];
}

const CINEMETA = 'https://v3-cinemeta.strem.io/meta/';

/** La ficha: datos de Cinemeta, español de TMDB, Mi lista y las fuentes de los addons. */
@Component({
  selector: 'app-ficha',
  imports: [Barra],
  template: `
    <app-barra />
    <section class="ficha-heroe" [style.background-image]="fondo()">
      <div class="ficha-contenido">
        @if (copia().poster; as poster) {
          <img class="ficha-poster" [src]="poster" alt="" />
        }
        <div class="ficha-datos">
          <button class="enlace volver" (click)="volver()">‹ Volver</button>
          @if (logo(); as l) {
            <img class="logo-titulo" [src]="l" [alt]="copia().nombre" />
          } @else {
            <h1>{{ copia().nombre }}</h1>
          }
          <p class="nota">{{ copia().anio }}</p>
          <div class="chips">
            @for (g of copia().generos?.slice(0, 4); track g) {
              <span class="chip">{{ g }}</span>
            }
          </div>
          <p class="sinopsis">{{ copia().descripcion }}</p>
          <div class="botones">
            @if (!esSerie) {
              <button class="principal" (click)="buscar(null)">▶ Ver fuentes</button>
            }
            <button class="secundario" (click)="alternarLista()">{{ enLista() ? '✓ En Mi lista' : '＋ Mi lista' }}</button>
          </div>
        </div>
      </div>
    </section>

    <main class="pagina">
      @if (esSerie && temporadas().length) {
        <section>
          <div class="titulo-seccion">
            <h2>Episodios</h2>
            <select aria-label="Temporada" (change)="temporada.set(+$any($event.target).value)">
              @for (t of temporadas(); track t) {
                <option [value]="t" [selected]="t === temporada()">{{ t === 0 ? 'Especiales' : 'Temporada ' + t }}</option>
              }
            </select>
          </div>
          <div class="episodios">
            @for (v of episodios(); track v.id) {
              <button class="episodio" (click)="buscar(v)">
                <div class="miniatura" [style.background-image]="v.thumbnail ? 'url(&quot;' + v.thumbnail + '&quot;)' : 'none'"></div>
                <b>{{ v.episode ?? v.number }}. {{ v.name ?? v.title }}</b>
              </button>
            }
          </div>
        </section>
      }

      @if (buscando()) {
        <p class="nota">Buscando fuentes…</p>
      }
      @if (aviso(); as texto) {
        <p class="aviso">{{ texto }}</p>
      }
      @if (buscada()) {
        <section id="fuentes">
          <h2>Fuentes</h2>
          @for (a of avisos(); track a) {
            <p class="nota">{{ a }}</p>
          }
          @if (!fuentes().length) {
            <p class="nota">No hay fuentes para este título. Podés cargar addons en Ajustes.</p>
          }
          <div class="fuentes">
            @for (f of fuentes(); track f.id; let primera = $first) {
              <button class="fuente" [class.apagada]="f.nivel === 'no'" [class.mejor]="primera && f.nivel === 'compatible'" (click)="reproducir(f)">
                <span class="chip" [class.chip-blanco]="f.nivel === 'compatible'">{{ nombreNivel[f.nivel] }}</span>
                <b>{{ f.nombre }}</b>
                <span class="nota">{{ f.addon }} · {{ f.detalle }}</span>
                @if (f.motivo) {
                  <span class="motivo">{{ f.motivo }}</span>
                }
              </button>
            }
          </div>
        </section>
      }
    </main>
  `,
})
export class Ficha {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly sesion = inject(Sesion);
  private readonly reproduccion = inject(Reproduccion);
  private readonly ruta = inject(ActivatedRoute).snapshot.paramMap;

  private readonly tipo = this.ruta.get('tipo') === 'series' ? 'series' : 'movie';
  private readonly id = this.ruta.get('id') ?? '';
  protected readonly esSerie = this.tipo === 'series';
  private readonly meta = signal<Meta | null>(null);
  private readonly espanol = signal<Partial<{ nombre: string; descripcion: string; generos: string[] }>>({});
  private readonly progresos = signal<Progreso[]>([]);
  protected readonly enLista = signal(false);
  protected readonly temporada = signal(1);
  protected readonly fuentes = signal<Fuente[]>([]);
  protected readonly avisos = signal<string[]>([]);
  protected readonly buscando = signal(false);
  protected readonly buscada = signal(false);
  protected readonly aviso = signal<string | null>(null);
  private elegido: Episodio | null = null;
  protected readonly nombreNivel = { compatible: 'Compatible', desconocida: 'Sin datos', dudosa: 'Puede fallar', no: 'No compatible' };
  protected readonly logo = computed(() => this.meta()?.logo ?? null);

  protected readonly copia = computed<Copia>(() => {
    const m = this.meta();
    const es = this.espanol();
    return {
      id: this.id,
      tipo: this.tipo,
      nombre: es.nombre ?? m?.name ?? '…',
      poster: m?.poster ?? null,
      fondo: m?.background ?? null,
      anio: m?.releaseInfo ?? null,
      generos: es.generos ?? m?.genres ?? [],
      descripcion: es.descripcion ?? m?.description ?? null,
    };
  });
  protected readonly fondo = computed(() => (this.copia().fondo ? 'url("' + this.copia().fondo + '")' : 'none'));
  protected readonly temporadas = computed(() => [...new Set((this.meta()?.videos ?? []).map((v) => v.season))].sort((a, b) => (a || 999) - (b || 999)));
  protected readonly episodios = computed(() =>
    (this.meta()?.videos ?? []).filter((v) => v.season === this.temporada()).sort((a, b) => (a.episode ?? a.number ?? 0) - (b.episode ?? b.number ?? 0)),
  );

  constructor() {
    this.http.get<{ meta: Meta }>(CINEMETA + this.tipo + '/' + this.id + '.json').subscribe({
      next: (r) => {
        this.meta.set(r.meta);
        const primera = this.temporadas()[0];
        if (primera !== undefined) this.temporada.set(primera);
      },
      error: () => this.aviso.set('No se pudo cargar la ficha.'),
    });
    this.http.get<{ titulo: Meta & { nombre: string; descripcion: string; generos: string[] } }>('/api/titulo/' + this.tipo + '/' + this.id).subscribe({
      next: (r) => {
        const { nombre, descripcion, generos } = r.titulo ?? {};
        this.espanol.set({ ...(nombre && { nombre }), ...(descripcion && { descripcion }), ...(generos?.length && { generos }) });
      },
      error: () => undefined,
    });
    const perfil = this.sesion.perfil();
    if (perfil) {
      this.http.get<{ progreso: Progreso[] }>('/api/perfiles/' + perfil.id + '/progreso').subscribe((r) => this.progresos.set(r.progreso));
      this.http.get<{ lista: { titulo: Copia }[] }>('/api/perfiles/' + perfil.id + '/lista').subscribe((r) => this.enLista.set(r.lista.some((x) => x.titulo.id === this.id)));
    }
  }

  private todosLosEpisodios(): Episodio[] {
    return (this.meta()?.videos ?? [])
      .map((v) => ({ id: v.id, temporada: v.season, numero: v.episode ?? v.number ?? 0, nombre: v.name ?? v.title, miniatura: v.thumbnail ?? null }))
      .sort((a, b) => (a.temporada || 999) - (b.temporada || 999) || a.numero - b.numero);
  }

  protected volver() {
    history.length > 1 ? history.back() : this.router.navigateByUrl('/');
  }

  protected alternarLista() {
    const perfil = this.sesion.perfil();
    if (!perfil) return;
    const ruta = '/api/perfiles/' + perfil.id + '/lista/' + this.id;
    const antes = this.enLista();
    this.enLista.set(!antes);
    const pedido = antes ? this.http.delete(ruta) : this.http.put(ruta, { titulo: this.copia() });
    pedido.subscribe({ error: () => this.enLista.set(antes) });
  }

  protected buscar(video: Video | null) {
    this.elegido = video
      ? { id: video.id, temporada: video.season, numero: video.episode ?? video.number ?? 0, nombre: video.name ?? video.title, miniatura: video.thumbnail ?? null }
      : null;
    this.buscando.set(true);
    this.buscada.set(false);
    this.aviso.set(null);
    this.http.get<{ fuentes: Fuente[]; avisos: string[] }>('/api/mis/fuentes/' + this.tipo + '/' + (video?.id ?? this.id)).subscribe({
      next: (r) => {
        this.fuentes.set(r.fuentes);
        this.avisos.set(r.avisos);
        this.buscando.set(false);
        this.buscada.set(true);
        setTimeout(() => document.getElementById('fuentes')?.scrollIntoView({ behavior: 'smooth' }));
      },
      error: (e: HttpErrorResponse) => {
        this.aviso.set(e.error?.error ?? 'No se pudieron buscar las fuentes.');
        this.buscando.set(false);
      },
    });
  }

  protected reproducir(fuente: Fuente) {
    const idVideo = this.elegido?.id ?? this.id;
    const p = this.progresos().find((x) => x.idVideo === idVideo);
    this.reproduccion.pedido.set({
      titulo: this.copia(),
      episodio: this.elegido,
      episodios: this.todosLosEpisodios(),
      fuente,
      posicionMs: p && !terminado(p) ? p.posicionMs : 0,
    });
    this.router.navigateByUrl('/reproducir');
  }
}
