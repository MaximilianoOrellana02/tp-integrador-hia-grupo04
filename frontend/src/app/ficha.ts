import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, HostListener, inject, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Barra } from './barra';
import { Copia, Episodio, Fuente, Progreso, quedan, Reproduccion, sePuedeContinuar, terminado, Titulo } from './datos';
import { Sesion } from './sesion';

interface Video {
  id: string;
  season: number;
  episode?: number;
  number?: number;
  name?: string;
  title?: string;
  thumbnail?: string;
  released?: string;
}

interface Meta {
  name: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  runtime?: string;
  imdbRating?: string;
  genres?: string[];
  director?: string[];
  trailers?: { source?: string; type?: string }[];
  videos?: Video[];
}

interface Actor {
  id: number;
  nombre: string;
  personaje?: string;
  foto?: string | null;
}

/** Qué hace el botón principal: continuar, el siguiente episodio o empezar. */
interface Accion {
  texto: string;
  detalle: string | null;
  video: Video | null;
  posicionMs: number;
}

const CINEMETA = 'https://v3-cinemeta.strem.io/meta/';
const ID_YOUTUBE = /^[\w-]{11}$/;

const numeroDe = (v: Video) => v.episode ?? v.number ?? 0;
const etiquetaDe = (v: Video) => 'T' + v.season + ' E' + numeroDe(v);

/** La ficha: datos, botón principal inteligente, tráiler, episodios con avance, fuentes, elenco y parecidos. */
@Component({
  selector: 'app-ficha',
  imports: [Barra, RouterLink],
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
          <p class="nota">{{ datos() }}</p>
          <div class="chips">
            @for (g of copia().generos?.slice(0, 4); track g) {
              <span class="chip">{{ g }}</span>
            }
          </div>
          <p class="sinopsis">{{ copia().descripcion }}</p>
          @if (meta()?.director?.length) {
            <p class="nota">Dirección: {{ meta()?.director?.join(', ') }}</p>
          }
          <div class="botones">
            @if (accion(); as a) {
              <button class="principal" (click)="buscar(a.video, a.posicionMs)">
                ▶ {{ a.texto }}@if (a.detalle) {<span class="detalle-boton"> · {{ a.detalle }}</span>}
              </button>
              @if (a.posicionMs > 0) {
                <button class="secundario" (click)="buscar(a.video, 0)">↺ Desde el inicio</button>
              }
            } @else if (esSerie) {
              <button class="principal" disabled>Cargando…</button>
            }
            @if (idTrailer()) {
              <button class="secundario" (click)="trailerAbierto.set(true)">▷ Tráiler</button>
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
            <div class="botones">
              <button class="secundario chico" (click)="descendente.set(!descendente())" [attr.aria-label]="descendente() ? 'Orden de la última a la primera' : 'Orden de la primera a la última'">
                {{ descendente() ? 'N → 1' : '1 → N' }}
              </button>
              <select aria-label="Temporada" (change)="temporada.set(+$any($event.target).value)">
                @for (t of temporadas(); track t) {
                  <option [value]="t" [selected]="t === temporada()">{{ t === 0 ? 'Especiales' : 'Temporada ' + t }}</option>
                }
              </select>
            </div>
          </div>
          <div class="episodios">
            @for (v of episodios(); track v.id) {
              <button class="episodio" (click)="buscar(v)">
                <div class="miniatura" [style.background-image]="v.thumbnail ? 'url(&quot;' + v.thumbnail + '&quot;)' : 'none'">
                  @if (progresoDe(v); as p) {
                    <div class="barra-avance"><div [style.width.%]="porcentaje(p)"></div></div>
                  }
                </div>
                <b>{{ numero(v) }}. {{ v.name ?? v.title }}</b>
                <span class="nota">{{ detalleEpisodio(v) }}</span>
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
                <span class="chip" [attr.data-nivel]="f.nivel">{{ nombreNivel[f.nivel] }}</span>
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

      @if (elenco().length) {
        <section>
          <h2>Elenco</h2>
          <div class="pista interna">
            @for (a of elenco(); track a.id) {
              <a class="actor" [routerLink]="['/persona', a.id]">
                @if (a.foto) {
                  <img [src]="a.foto" [alt]="a.nombre" loading="lazy" />
                } @else {
                  <span class="inicial">{{ a.nombre[0] }}</span>
                }
                <b>{{ a.nombre }}</b>
                <span class="nota">{{ a.personaje }}</span>
              </a>
            }
          </div>
        </section>
      }

      @if (parecidos().length) {
        <section>
          <h2>Más como esta</h2>
          <div class="pista interna">
            @for (t of parecidos(); track t.imdbId) {
              <a class="poster" [routerLink]="['/titulo', t.tipo, t.imdbId]" [attr.aria-label]="t.titulo">
                @if (t.poster) {
                  <img [src]="t.poster" [alt]="t.titulo" loading="lazy" />
                } @else {
                  <span class="sin-poster">{{ t.titulo }}</span>
                }
              </a>
            }
          </div>
        </section>
      }
    </main>

    @if (urlTrailer(); as url) {
      <div class="cortina-trailer" (click)="trailerAbierto.set(false)">
        <div class="marco-trailer" (click)="$event.stopPropagation()">
          <button class="cerrar" (click)="trailerAbierto.set(false)" aria-label="Cerrar el tráiler">✕</button>
          <iframe [src]="url" title="Tráiler" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
        </div>
      </div>
    }
  `,
})
export class Ficha {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly sesion = inject(Sesion);
  private readonly reproduccion = inject(Reproduccion);
  private readonly sanitizador = inject(DomSanitizer);
  private readonly ruta = inject(ActivatedRoute).snapshot.paramMap;

  private readonly tipo = this.ruta.get('tipo') === 'series' ? 'series' : 'movie';
  private readonly id = this.ruta.get('id') ?? '';
  protected readonly esSerie = this.tipo === 'series';
  protected readonly meta = signal<Meta | null>(null);
  private readonly espanol = signal<Partial<{ nombre: string; descripcion: string; generos: string[] }>>({});
  private readonly progresos = signal<Progreso[]>([]);
  protected readonly elenco = signal<Actor[]>([]);
  protected readonly parecidos = signal<Titulo[]>([]);
  protected readonly enLista = signal(false);
  protected readonly temporada = signal(1);
  protected readonly descendente = signal(false);
  protected readonly trailerAbierto = signal(false);
  protected readonly fuentes = signal<Fuente[]>([]);
  protected readonly avisos = signal<string[]>([]);
  protected readonly buscando = signal(false);
  protected readonly buscada = signal(false);
  protected readonly aviso = signal<string | null>(null);
  protected readonly nombreNivel = { compatible: 'Compatible', desconocida: 'Sin datos', dudosa: 'Puede fallar', no: 'No compatible' };
  private elegido: Episodio | null = null;
  private posicionElegida = 0;
  private temporadaFijada = false;

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
      puntajeImdb: m?.imdbRating ?? null,
    };
  });
  protected readonly fondo = computed(() => (this.copia().fondo ? 'url("' + this.copia().fondo + '")' : 'none'));
  protected readonly logo = computed(() => this.meta()?.logo ?? null);
  protected readonly datos = computed(() => {
    const m = this.meta();
    const duracion = m?.runtime && /\d+/.test(m.runtime) && !this.esSerie ? m.runtime : null;
    const puntaje = m?.imdbRating && m.imdbRating !== '0' ? '★ ' + m.imdbRating : null;
    return [m?.releaseInfo, duracion, puntaje].filter(Boolean).join('  ·  ');
  });
  protected readonly idTrailer = computed(() => {
    const lista = this.meta()?.trailers ?? [];
    const elegido = lista.find((t) => t.type === 'Trailer') ?? lista[0];
    return elegido?.source && ID_YOUTUBE.test(elegido.source) ? elegido.source : null;
  });
  protected readonly urlTrailer = computed(() => {
    const id = this.idTrailer();
    return this.trailerAbierto() && id ? this.sanitizador.bypassSecurityTrustResourceUrl('https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0') : null;
  });

  private readonly ordenados = computed(() =>
    [...(this.meta()?.videos ?? [])].sort((a, b) => (a.season || 999) - (b.season || 999) || numeroDe(a) - numeroDe(b)),
  );
  protected readonly temporadas = computed(() => [...new Set(this.ordenados().map((v) => v.season))]);
  protected readonly episodios = computed(() => {
    const lista = this.ordenados().filter((v) => v.season === this.temporada());
    return this.descendente() ? [...lista].reverse() : lista;
  });

  protected readonly accion = computed<Accion | null>(() => {
    const mios = this.progresos().filter((p) => p.titulo.id === this.id);
    if (!this.esSerie) {
      const p = mios.find((x) => x.idVideo === this.id);
      return p && sePuedeContinuar(p)
        ? { texto: 'Continuar', detalle: quedan(p), video: null, posicionMs: p.posicionMs }
        : { texto: 'Reproducir', detalle: null, video: null, posicionMs: 0 };
    }
    const videos = this.ordenados();
    if (!videos.length) return null;
    const ultimo = mios[0];
    const actual = ultimo ? videos.find((v) => v.id === ultimo.episodio?.id) : undefined;
    if (ultimo && actual) {
      if (sePuedeContinuar(ultimo)) return { texto: 'Continuar', detalle: etiquetaDe(actual) + ' · ' + quedan(ultimo), video: actual, posicionMs: ultimo.posicionMs };
      if (!terminado(ultimo)) return { texto: 'Reproducir', detalle: etiquetaDe(actual), video: actual, posicionMs: 0 };
      const siguiente = videos.slice(videos.indexOf(actual) + 1).find((v) => actual.season === 0 || v.season !== 0);
      if (siguiente) return { texto: 'Siguiente', detalle: etiquetaDe(siguiente), video: siguiente, posicionMs: 0 };
    }
    const primero = videos.find((v) => v.season !== 0) ?? videos[0];
    return { texto: 'Reproducir', detalle: etiquetaDe(primero), video: primero, posicionMs: 0 };
  });

  constructor() {
    // Al abrir una serie, la temporada es la del episodio que sigue
    effect(() => {
      const video = this.accion()?.video;
      if (video && !this.temporadaFijada) {
        this.temporadaFijada = true;
        this.temporada.set(video.season);
      }
    });
    this.http.get<{ meta: Meta }>(CINEMETA + this.tipo + '/' + this.id + '.json').subscribe({
      next: (r) => {
        this.meta.set(r.meta);
        const primera = this.ordenados().find((v) => v.season !== 0)?.season ?? this.temporadas()[0];
        if (primera !== undefined && !this.temporadaFijada) this.temporada.set(primera);
      },
      error: () => this.aviso.set('No se pudo cargar la ficha.'),
    });
    this.http.get<{ titulo: { nombre?: string; descripcion?: string; generos?: string[] } }>('/api/titulo/' + this.tipo + '/' + this.id).subscribe({
      next: (r) => {
        const { nombre, descripcion, generos } = r.titulo ?? {};
        this.espanol.set({ ...(nombre && { nombre }), ...(descripcion && { descripcion }), ...(generos?.length && { generos }) });
      },
      error: () => undefined,
    });
    this.http.get<{ elenco: Actor[] }>('/api/elenco/' + this.tipo + '/' + this.id).subscribe({ next: (r) => this.elenco.set(r.elenco), error: () => undefined });
    this.http.get<{ titulos: Titulo[] }>('/api/recomendaciones/' + this.tipo + '/' + this.id).subscribe({ next: (r) => this.parecidos.set(r.titulos), error: () => undefined });
    const perfil = this.sesion.perfil();
    if (perfil) {
      this.http.get<{ progreso: Progreso[] }>('/api/perfiles/' + perfil.id + '/progreso').subscribe((r) => this.progresos.set(r.progreso));
      this.http.get<{ lista: { titulo: Copia }[] }>('/api/perfiles/' + perfil.id + '/lista').subscribe((r) => this.enLista.set(r.lista.some((x) => x.titulo.id === this.id)));
    }
  }

  @HostListener('document:keydown.escape')
  protected cerrarTrailer() {
    this.trailerAbierto.set(false);
  }

  protected numero(v: Video) {
    return numeroDe(v);
  }

  protected progresoDe(v: Video) {
    return this.progresos().find((p) => p.idVideo === v.id);
  }

  protected porcentaje(p: Progreso) {
    return p.duracionMs ? Math.min(100, (p.posicionMs / p.duracionMs) * 100) : 0;
  }

  protected detalleEpisodio(v: Video) {
    const p = this.progresoDe(v);
    const fecha = v.released && !isNaN(Date.parse(v.released)) ? new Date(v.released).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
    const estado = p ? (terminado(p) ? 'Visto' : sePuedeContinuar(p) ? quedan(p) : null) : null;
    return [fecha, estado].filter(Boolean).join(' · ');
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

  /** Busca las fuentes del título o del episodio y las muestra abajo. `posicionMs`: desde dónde seguir. */
  protected buscar(video: Video | null, posicionMs?: number) {
    this.elegido = video ? { id: video.id, temporada: video.season, numero: numeroDe(video), nombre: video.name ?? video.title, miniatura: video.thumbnail ?? null } : null;
    const p = video ? this.progresoDe(video) : this.progresos().find((x) => x.idVideo === this.id);
    this.posicionElegida = posicionMs ?? (p && sePuedeContinuar(p) ? p.posicionMs : 0);
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
    this.reproduccion.pedido.set({
      titulo: this.copia(),
      episodio: this.elegido,
      episodios: this.ordenados().map((v) => ({ id: v.id, temporada: v.season, numero: numeroDe(v), nombre: v.name ?? v.title, miniatura: v.thumbnail ?? null })),
      fuente,
      posicionMs: this.posicionElegida,
    });
    this.router.navigateByUrl('/reproducir');
  }
}
