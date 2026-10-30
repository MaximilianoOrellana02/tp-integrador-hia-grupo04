import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Barra } from './barra';
import { Copia, Progreso, terminado } from './datos';
import { Sesion } from './sesion';

interface Titulo {
  titulo: string;
  tipo: string;
  imdbId?: string;
  poster?: string | null;
  fondo?: string | null;
  logo?: string | null;
  anio?: string | null;
  descripcion?: string | null;
  generos?: string[];
}

interface Fila {
  tipo: string;
  nombre?: string;
  etiqueta?: string;
  titulo?: Titulo;
  items?: Titulo[];
}

/** Inicio: el destacado, «Seguir viendo», las películas libres, Mi lista, los addons y las filas del backend. */
@Component({
  selector: 'app-inicio',
  imports: [RouterLink, Barra],
  template: `
    <app-barra />
    @if (destacado(); as d) {
      <section class="heroe" [style.background-image]="imagen(d.titulo?.fondo)">
        <div class="heroe-texto">
          @if (d.etiqueta) {
            <span class="etiqueta">{{ d.etiqueta }}</span>
          }
          @if (d.titulo?.logo; as logo) {
            <img class="logo-titulo" [src]="logo" [alt]="d.titulo?.titulo" />
          } @else {
            <h1>{{ d.titulo?.titulo }}</h1>
          }
          <p class="nota">{{ d.titulo?.anio }} {{ d.titulo?.generos?.slice(0, 3)?.join(' · ') }}</p>
          <p class="sinopsis">{{ d.titulo?.descripcion }}</p>
          <a class="principal boton-enlace" [routerLink]="['/titulo', d.titulo?.tipo, d.titulo?.imdbId]">▶ Ver ahora</a>
        </div>
      </section>
    } @else {
      <div class="espacio-barra"></div>
    }
    <main class="filas">
      @if (error()) {
        <p class="aviso">No se pudo cargar el inicio.</p>
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
        <section class="fila" [class.top10]="fila.tipo === 'top10'">
          <h2>{{ fila.nombre }}</h2>
          <div class="pista">
            @for (t of fila.items; track $index) {
              @if (t.imdbId) {
                <a class="poster" [routerLink]="['/titulo', t.tipo, t.imdbId]" [attr.aria-label]="t.titulo">
                  @if (fila.tipo === 'top10') {
                    <span class="puesto">{{ $index + 1 }}</span>
                  }
                  @if (t.poster) {
                    <img [src]="t.poster" [alt]="t.titulo" loading="lazy" />
                  } @else {
                    <span class="sin-poster">{{ t.titulo }}</span>
                  }
                </a>
              }
            }
          </div>
        </section>
      }
      <p class="credito">Este producto usa la API de TMDB, pero TMDB no lo avala ni lo certifica.</p>
    </main>
  `,
})
export class Inicio {
  private readonly sesion = inject(Sesion);
  private readonly http = inject(HttpClient);
  private readonly delBackend = signal<Fila[]>([]);
  private readonly deAddons = signal<Fila[]>([]);
  private readonly libres = signal<Copia[]>([]);
  private readonly lista = signal<Copia[]>([]);
  private readonly progresos = signal<Progreso[]>([]);
  protected readonly error = signal(false);

  protected readonly destacado = computed(() => this.delBackend().find((f) => f.tipo === 'destacado' && f.titulo?.imdbId));
  // Una tarjeta por título: la lista llega de lo más reciente a lo más viejo
  protected readonly seguir = computed(() => {
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
    return [
      aFila('Películas libres', this.libres()),
      aFila('Mi lista', this.lista()),
      ...this.deAddons(),
      ...this.delBackend().filter((f) => f.tipo === 'top10' || f.tipo === 'posters'),
    ].filter((f) => f.items?.some((t) => t.imdbId));
  });

  constructor() {
    const perfil = this.sesion.perfil();
    if (!perfil) {
      inject(Router).navigateByUrl('/perfiles');
      return;
    }
    this.http.get<{ filas: Fila[] }>('/api/inicio').subscribe({ next: (r) => this.delBackend.set(r.filas), error: () => this.error.set(true) });
    this.http.get<{ filas: Fila[] }>('/api/mis/filas').subscribe({ next: (r) => this.deAddons.set(r.filas), error: () => undefined });
    this.http.get<{ videos: Copia[] }>('/api/videos').subscribe((r) => this.libres.set(r.videos));
    this.http.get<{ lista: { titulo: Copia }[] }>('/api/perfiles/' + perfil.id + '/lista').subscribe((r) => this.lista.set(r.lista.map((x) => x.titulo)));
    this.http.get<{ progreso: Progreso[] }>('/api/perfiles/' + perfil.id + '/progreso').subscribe((r) => this.progresos.set(r.progreso));
  }

  protected imagen(url?: string | null) {
    return url ? 'url("' + url + '")' : 'none';
  }

  protected avance(p: Progreso) {
    return p.duracionMs ? Math.min(100, (p.posicionMs / p.duracionMs) * 100) : 0;
  }
}
