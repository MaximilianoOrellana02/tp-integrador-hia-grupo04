import { HttpClient } from '@angular/common/http';
import { Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Barra } from './barra';
import { Copia, Fila, Progreso, terminado } from './datos';
import { FilaVista, Heroe } from './piezas';
import { Sesion } from './sesion';

type Seccion = 'inicio' | 'peliculas' | 'series';

const RUTAS: Record<Seccion, string> = { inicio: '/api/inicio', peliculas: '/api/peliculas', series: '/api/series' };
// Cuántos píxeles antes del final se pide la página siguiente
const ADELANTO_PX = 900;

/**
 * Para ti, Películas y Series: el mismo esqueleto con otro origen de datos. Las filas llegan por
 * páginas y la siguiente se pide al acercarse al final. Géneros y sagas llegan con sus pantallas.
 * Solo Para ti suma «Seguir viendo», las películas libres, Mi lista y los catálogos de los addons.
 */
@Component({
  selector: 'app-explorar',
  imports: [RouterLink, Barra, Heroe, FilaVista],
  template: `
    <app-barra />
    @if (destacados().length) {
      <app-heroe [destacados]="destacados()" />
    } @else {
      <div class="espacio-barra"></div>
    }
    <main class="filas">
      @if (error()) {
        <p class="aviso centrado-texto">No se pudo cargar. Probá de nuevo en un momento.</p>
      }
      @if (seguir().length) {
        <section class="fila">
          <h2>Seguir viendo</h2>
          <div class="pista">
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
          </div>
        </section>
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
  private readonly seccion = inject(ActivatedRoute).snapshot.data['seccion'] as Seccion;
  private readonly final = viewChild.required<ElementRef<HTMLElement>>('final');

  private readonly delBackend = signal<Fila[]>([]);
  private readonly deAddons = signal<Fila[]>([]);
  private readonly libres = signal<Copia[]>([]);
  private readonly lista = signal<Copia[]>([]);
  private readonly progresos = signal<Progreso[]>([]);
  protected readonly error = signal(false);
  protected readonly cargandoMas = signal(false);
  private proxima: number | null = 1;
  private pidiendo = false;
  private destruido = false;

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
    const aFila = (nombre: string, copias: Copia[]): Fila => ({
      tipo: 'posters',
      nombre,
      items: copias.map((c) => ({ titulo: c.nombre, tipo: c.tipo, imdbId: c.id, poster: c.poster })),
    });
    const propias = this.seccion === 'inicio' ? [aFila('Películas libres', this.libres()), aFila('Mi lista', this.lista()), ...this.deAddons()] : [];
    const delServidor = this.delBackend().filter((f) => !['destacado', 'generos', 'sagas'].includes(f.tipo));
    return [...propias, ...delServidor].filter((f) => f.tipo === 'banner' || f.items?.some((t) => t.imdbId));
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
      this.http.get<{ videos: Copia[] }>('/api/videos').subscribe((r) => this.libres.set(r.videos));
      this.http.get<{ lista: { titulo: Copia }[] }>('/api/perfiles/' + perfil.id + '/lista').subscribe((r) => this.lista.set(r.lista.map((x) => x.titulo)));
      this.http.get<{ progreso: Progreso[] }>('/api/perfiles/' + perfil.id + '/progreso').subscribe((r) => this.progresos.set(r.progreso));
    }
    const revisar = () => this.revisar();
    window.addEventListener('scroll', revisar, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      this.destruido = true;
      window.removeEventListener('scroll', revisar);
    });
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
    this.http.get<{ filas: Fila[]; siguiente?: number | null }>(RUTAS[this.seccion] + (pagina > 1 ? '?pagina=' + pagina : '')).subscribe({
      next: (r) => {
        const conocidas = new Set(this.delBackend().map((f) => f.nombre).filter(Boolean));
        this.delBackend.update((a) => [...a, ...(r.filas ?? []).filter((f) => !f.nombre || !conocidas.has(f.nombre))]);
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
