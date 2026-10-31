import { HttpClient } from '@angular/common/http';
import { Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Barra } from './barra';
import { EstiloFila, Fila, Plataforma, Progreso, terminado } from './datos';
import { Carrusel, FilaVista, Heroe } from './piezas';
import { Sesion } from './sesion';

type Seccion = 'inicio' | 'peliculas' | 'series' | 'genero' | 'originales' | 'marca';

const RUTAS = { inicio: '/api/inicio', peliculas: '/api/peliculas', series: '/api/series' } as const;
// Cuántos píxeles antes del final se pide la página siguiente
const ADELANTO_PX = 900;
// Cómo se dibujan, una tras otra, las filas de portadas del backend (las de pocos títulos quedan comunes)
const CICLO: EstiloFila[] = ['panoramica', 'comun', 'grande', 'apaisada', 'comun', 'vitrina'];
const MARCAS = [
  { id: 'disney', nombre: 'Disney', color: '#1546d8' },
  { id: 'marvel', nombre: 'Marvel', color: '#e62429' },
];

/**
 * Para ti, Películas, Series, un género, «Originales de» y una marca de Disney+: el mismo esqueleto
 * con otro origen de datos. Las filas llegan por páginas y la siguiente se pide al acercarse al final.
 * Solo Para ti suma «Seguir viendo» y los catálogos de los addons que la cuenta eligió mostrar.
 */
@Component({
  selector: 'app-explorar',
  imports: [RouterLink, Barra, Heroe, FilaVista, Carrusel],
  template: `
    <app-barra />
    @if (destacados().length) {
      <app-heroe [destacados]="destacados()" />
    } @else {
      <div class="espacio-barra"></div>
    }
    <main class="filas">
      @if (titulo(); as t) {
        <div class="titulo-pantalla">
          <span class="etiqueta">{{ t.etiqueta }}</span>
          <h1>{{ t.nombre }}</h1>
        </div>
      }
      @if (plataformas().length) {
        <nav class="plataformas" aria-label="Plataformas">
          @for (p of plataformas(); track p.id) {
            <a class="plataforma" [class.activa]="p.id === plataforma()?.id" [routerLink]="['/originales', p.id]">
              <span class="punto-color" [style.background]="p.color"></span>{{ p.nombre }}
            </a>
          }
        </nav>
        @if (plataforma(); as p) {
          <p class="nota datos-plataforma">
            {{ p.peliculas }} películas · {{ p.series }} series · {{ p.estrenos }} estrenos {{ p.anio }}
          </p>
          @if (p.id === 'disney') {
            <div class="pista">
              @for (m of marcas; track m.id) {
                <a class="tarjeta-marca" [style.border-color]="m.color" [routerLink]="['/marca', m.id]">{{ m.nombre }}</a>
              }
            </div>
          }
        }
      }
      @if (error()) {
        <p class="aviso centrado-texto">No se pudo cargar. Probá de nuevo en un momento.</p>
      }
      @if (seguir().length) {
        <app-carrusel>
          <span titulo>Seguir viendo</span>
            @for (p of seguir(); track p.idVideo) {
              <a class="tarjeta-seguir" [routerLink]="['/titulo', p.titulo.tipo, p.titulo.id]">
                <div class="imagen-seguir" [style.background-image]="imagen(p.episodio?.miniatura ?? p.titulo.fondo ?? p.titulo.poster)">
                  <span class="reproducir">▶</span>
                  <div class="barra-avance"><div [style.width.%]="avance(p)"></div></div>
                </div>
                <b>{{ p.titulo.nombre }}</b>
                @if (p.episodio) {
                  <span class="nota">T{{ p.episodio.temporada }} E{{ p.episodio.numero }}</span>
                }
              </a>
            }
        </app-carrusel>
      }
      @for (fila of filas(); track $index) {
        <app-fila [fila]="fila" />
      }
      @if (cargandoMas()) {
        <p class="nota centrado-texto">Cargando más…</p>
      }
      <div #final></div>
      <p class="credito">Este producto usa la API de TMDB, pero TMDB no lo avala ni lo certifica.</p>
    </main>
  `,
})
export class Explorar {
  private readonly sesion = inject(Sesion);
  private readonly http = inject(HttpClient);
  private readonly instantanea = inject(ActivatedRoute).snapshot;
  private readonly seccion = this.instantanea.data['seccion'] as Seccion;
  private readonly final = viewChild.required<ElementRef<HTMLElement>>('final');

  protected readonly marcas = MARCAS;
  private readonly delBackend = signal<Fila[]>([]);
  private readonly deAddons = signal<Fila[]>([]);
  private readonly progresos = signal<Progreso[]>([]);
  protected readonly plataformas = signal<Plataforma[]>([]);
  protected readonly plataforma = signal<Plataforma | null>(null);
  protected readonly error = signal(false);
  protected readonly cargandoMas = signal(false);
  private proxima: number | null = 1;
  private pidiendo = false;
  private destruido = false;

  /** El título de las pantallas que no son Para ti, Películas ni Series. */
  protected readonly titulo = computed(() => {
    const p = this.instantanea.paramMap;
    const q = this.instantanea.queryParamMap;
    switch (this.seccion) {
      case 'genero':
        return { etiqueta: p.get('tipo') === 'series' ? 'Series · Género' : 'Películas · Género', nombre: q.get('n') ?? p.get('genero') ?? '' };
      case 'originales':
        return { etiqueta: 'Originales de', nombre: this.plataforma()?.nombre ?? '' };
      case 'marca':
        return { etiqueta: 'Disney+', nombre: MARCAS.find((m) => m.id === p.get('id'))?.nombre ?? '' };
      default:
        return null;
    }
  });

  protected readonly destacados = computed(() => {
    const d = this.delBackend().find((f) => f.tipo === 'destacado' && f.titulo?.imdbId);
    return d ? [d, ...(d.mas ?? [])].filter((f) => f.titulo?.imdbId) : [];
  });
  // Una tarjeta por título: la lista llega de lo más reciente a lo más viejo
  protected readonly seguir = computed(() => {
    if (this.seccion !== 'inicio') return [];
    const vistos = new Set<string>();
    return this.progresos().filter((p) => {
      if (terminado(p) || vistos.has(p.titulo.id)) return false;
      vistos.add(p.titulo.id);
      return true;
    });
  });
  protected readonly filas = computed<Fila[]>(() => {
    const propias = this.seccion === 'inicio' ? this.deAddons() : [];
    let n = 0;
    const delServidor = this.delBackend()
      .filter((f) => f.tipo !== 'destacado')
      .map((f) => (f.tipo === 'posters' && (f.items?.filter((t) => t.imdbId).length ?? 0) >= 5 ? { ...f, estilo: CICLO[n++ % CICLO.length] } : f));
    return [...propias, ...delServidor].filter((f) => f.tipo === 'banner' || (f.tipo === 'generos' ? f.generos?.length : f.tipo === 'sagas' ? f.sagas?.length : f.items?.some((t) => t.imdbId)));
  });

  constructor() {
    const perfil = this.sesion.perfil();
    if (!perfil) {
      inject(Router).navigateByUrl('/perfiles');
      return;
    }
    this.pedirPagina();
    if (this.seccion === 'inicio') {
      this.http.get<{ filas: Fila[] }>('/api/mis/filas').subscribe({ next: (r) => this.deAddons.set(r.filas), error: () => undefined });
      this.http.get<{ progreso: Progreso[] }>('/api/perfiles/' + perfil.id + '/progreso').subscribe((r) => this.progresos.set(r.progreso));
    }
    const revisar = () => this.revisar();
    window.addEventListener('scroll', revisar, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      this.destruido = true;
      window.removeEventListener('scroll', revisar);
    });
  }

  private ruta(): string {
    const p = this.instantanea.paramMap;
    switch (this.seccion) {
      case 'genero':
        return '/api/genero/' + encodeURIComponent(p.get('tipo') ?? '') + '/' + encodeURIComponent(p.get('genero') ?? '');
      case 'originales':
        return '/api/originales/' + encodeURIComponent(p.get('id') ?? '');
      case 'marca':
        return '/api/marcas/' + encodeURIComponent(p.get('id') ?? '');
      default:
        return RUTAS[this.seccion];
    }
  }

  /** Pide la página siguiente si el final ya está cerca de la pantalla. */
  private revisar() {
    if (this.destruido) return;
    const fin = this.final().nativeElement.getBoundingClientRect().top;
    if (fin < window.innerHeight + ADELANTO_PX) this.pedirPagina();
  }

  private pedirPagina() {
    if (this.pidiendo || this.proxima === null) return;
    const pagina = this.proxima;
    this.pidiendo = true;
    this.cargandoMas.set(pagina > 1);
    this.http
      .get<{ filas?: Fila[]; destacado?: Fila; plataformas?: Plataforma[]; plataforma?: Plataforma; siguiente?: number | null }>(this.ruta() + (pagina > 1 ? '?pagina=' + pagina : ''))
      .subscribe({
        next: (r) => {
          // «Originales de» trae el destacado y las pestañas aparte, solo en la primera página
          if (r.plataformas) this.plataformas.set(r.plataformas);
          if (r.plataforma) this.plataforma.set(r.plataforma);
          const nuevas = [...(r.destacado ? [r.destacado] : []), ...(r.filas ?? [])];
          const conocidas = new Set(this.delBackend().map((f) => f.nombre).filter(Boolean));
          this.delBackend.update((a) => [...a, ...nuevas.filter((f) => !f.nombre || !conocidas.has(f.nombre))]);
          this.proxima = r.siguiente ?? null;
          this.pidiendo = false;
          this.cargandoMas.set(false);
          // Si el contenido todavía no llena la pantalla, el scroll no va a avisar
          setTimeout(() => this.revisar());
        },
        error: () => {
          this.pidiendo = false;
          this.cargandoMas.set(false);
          this.proxima = null;
          if (pagina === 1) this.error.set(true);
        },
      });
  }

  protected imagen(url?: string | null) {
    return url ? 'url("' + url + '")' : 'none';
  }

  protected avance(p: Progreso) {
    return p.duracionMs ? Math.min(100, (p.posicionMs / p.duracionMs) * 100) : 0;
  }
}
