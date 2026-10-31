import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Apariencia } from './apariencia';
import { Fila, Titulo } from './datos';

const CADA_MS = 8000;
const SALTO_FLECHAS = 0.85;

/** Arranca y frena suave (ease in-out cúbica). */
const suavizar = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** La imagen más grande de TMDB, para las portadas que se muestran en grande. */
const masGrande = (url?: string | null) => (url ? url.replace('/w342/', '/w500/') : null);
/** El fondo horizontal de un título: el que mandó el backend o el de metahub por ID de IMDb. */
const fondoDe = (t: Titulo) => t.fondo ?? (t.imdbId ? 'https://images.metahub.space/background/medium/' + t.imdbId + '/img' : (t.poster ?? null));

function datosDe(t: Titulo): string {
  const puntaje = t.puntajeImdb ?? t.puntaje;
  return [t.tipo === 'series' ? 'Serie' : 'Película', t.generos?.slice(0, 2).join(' · '), t.anio, puntaje && Number(puntaje) ? '★ ' + (+puntaje).toFixed(1) : null].filter(Boolean).join(' · ');
}

/** El destacado de arriba: hasta 3 títulos que pasan solos cada 8 s, con puntitos para elegir. */
@Component({
  selector: 'app-heroe',
  imports: [RouterLink],
  template: `
    @if (actual(); as d) {
      <section class="heroe" [style.background-image]="d.titulo?.fondo ? 'url(&quot;' + d.titulo?.fondo + '&quot;)' : 'none'">
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
        @if (destacados().length > 1) {
          <div class="puntos">
            @for (p of destacados(); track $index) {
              <button [class.activo]="$index === indice()" (click)="indice.set($index)" [attr.aria-label]="'Destacado ' + ($index + 1)"></button>
            }
          </div>
        }
      </section>
    }
  `,
})
export class Heroe {
  readonly destacados = input.required<Fila[]>();
  protected readonly indice = signal(0);
  protected readonly actual = computed(() => this.destacados()[this.indice()] ?? this.destacados()[0] ?? null);

  constructor() {
    const apariencia = inject(Apariencia);
    const reloj = setInterval(() => {
      const n = this.destacados().length;
      if (n > 1 && !document.hidden && !apariencia.reducido()) this.indice.set((this.indice() + 1) % n);
    }, CADA_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }
}

/**
 * Una fila que se desliza: título a la izquierda y flechas ‹ › a la derecha, que se apagan en los
 * extremos y no aparecen si todo entra. `[titulo]` es el encabezado, `[panel]` algo fijo a la
 * izquierda de las portadas y el resto es lo que se desliza.
 */
@Component({
  selector: 'app-carrusel',
  template: `
    <section class="fila" [class.top10]="top10()" [class.interna]="interna()">
      <div class="fila-cabecera">
        <h2><ng-content select="[titulo]" /></h2>
        @if (izquierda() || derecha()) {
          <div class="flechas">
            <button class="flecha" [disabled]="!izquierda()" (click)="mover(-1)" aria-label="Ver anteriores">‹</button>
            <button class="flecha" [disabled]="!derecha()" (click)="mover(1)" aria-label="Ver siguientes">›</button>
          </div>
        }
      </div>
      <div class="cuerpo-fila">
        <ng-content select="[panel]" />
        <div class="pista" #pista (scroll)="medir()" (wheel)="detener()" (touchstart)="detener()" (pointerdown)="detener()"><ng-content /></div>
      </div>
    </section>
  `,
})
export class Carrusel {
  readonly top10 = input(false);
  readonly interna = input(false);
  private readonly pista = viewChild.required<ElementRef<HTMLElement>>('pista');
  protected readonly izquierda = signal(false);
  protected readonly derecha = signal(false);
  private animacion = 0;
  private readonly apariencia = inject(Apariencia);

  constructor() {
    const destruir = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.pista().nativeElement;
      // El contenido llega de a poco (imágenes, filas nuevas) y la ventana cambia de tamaño
      const cambios = new MutationObserver(() => this.medir());
      cambios.observe(el, { childList: true, subtree: true });
      const tamano = new ResizeObserver(() => this.medir());
      tamano.observe(el);
      destruir.onDestroy(() => {
        this.detener();
        cambios.disconnect();
        tamano.disconnect();
      });
      this.medir();
    });
  }

  protected medir() {
    const el = this.pista().nativeElement;
    this.izquierda.set(el.scrollLeft > 4);
    this.derecha.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  /** Desliza hasta la próxima tanda con una animación propia: más larga cuanto más lejos va. */
  protected mover(sentido: number) {
    const el = this.pista().nativeElement;
    const destino = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + sentido * el.clientWidth * SALTO_FLECHAS));
    this.detener();
    const inicio = el.scrollLeft;
    const distancia = destino - inicio;
    if (!distancia) return;
    if (this.apariencia.reducido()) {
      el.scrollLeft = destino;
      return;
    }
    const duracion = Math.min(750, 380 + Math.abs(distancia) * 0.25);
    const desde = performance.now();
    // Mientras se anima, el ajuste por tramos del navegador se aparta
    el.classList.add('animando');
    const paso = (ahora: number) => {
      const avance = Math.min(1, (ahora - desde) / duracion);
      el.scrollLeft = inicio + distancia * suavizar(avance);
      if (avance < 1) this.animacion = requestAnimationFrame(paso);
      else el.classList.remove('animando');
    };
    this.animacion = requestAnimationFrame(paso);
  }

  /** Si la persona toca, usa la rueda o arrastra, manda ella. */
  protected detener() {
    cancelAnimationFrame(this.animacion);
    this.pista().nativeElement.classList.remove('animando');
  }
}

/** Una fila del backend. Cada estilo muestra las portadas de otra manera. */
@Component({
  selector: 'app-fila',
  imports: [RouterLink, Carrusel],
  template: `
    @if (fila().tipo === 'banner' && fila().titulo; as t) {
      <a class="banner" [routerLink]="['/titulo', t.tipo, t.imdbId]" [style.background-image]="t.fondo ? 'url(&quot;' + t.fondo + '&quot;)' : 'none'">
        <div class="banner-texto">
          <span class="etiqueta">{{ fila().etiqueta }}</span>
          <h2>{{ t.titulo }}</h2>
          <p class="nota">{{ fila().detalle }}</p>
        </div>
      </a>
    } @else if (fila().tipo === 'generos' && fila().generos?.length) {
      <app-carrusel>
        <span titulo>{{ fila().nombre }}</span>
        @for (g of fila().generos; track g.genero + g.tipo) {
          <a class="tarjeta-genero" [style.border-left-color]="g.color" [routerLink]="['/genero', g.tipo, g.genero]" [queryParams]="{ n: g.nombre }">{{ g.nombre }}</a>
        }
      </app-carrusel>
    } @else if (fila().tipo === 'sagas' && fila().sagas?.length) {
      <app-carrusel>
        <span titulo>{{ fila().nombre }}<span class="nota"> · {{ fila().detalle }}</span></span>
        @for (s of fila().sagas; track s.id) {
          <a class="tarjeta-saga" [routerLink]="['/saga', s.id]" [style.background-image]="s.fondo ? 'url(&quot;' + s.fondo + '&quot;)' : 'none'">
            <span class="tarjeta-saga-texto">
              <b>{{ s.nombre }}</b>
              <span class="nota">{{ s.cantidad }} películas · {{ s.anios }}</span>
            </span>
          </a>
        }
      </app-carrusel>
    } @else if (validos().length) {
      <app-carrusel [top10]="fila().tipo === 'top10'">
        <span titulo>
          {{ fila().nombre }}
          @if (fila().plataforma; as p) {
            <a class="ver-todo" [routerLink]="['/originales', p]">Ver todo ›</a>
          }
        </span>
        @if (estilo() === 'vitrina' && elegido(); as e) {
          <a panel class="vitrina" [routerLink]="['/titulo', e.tipo, e.imdbId]">
            <img class="vitrina-fondo" [src]="fondoDe(e)" (error)="alFallar($event, e)" alt="" />
            <span class="pano-texto">
              @if (e.logo) {
                <img class="pano-logo" [src]="e.logo" [alt]="e.titulo" />
              } @else {
                <b class="pano-titulo">{{ e.titulo }}</b>
              }
              <span class="pano-datos">{{ datos(e) }}</span>
              <span class="pano-sinopsis">{{ e.descripcion }}</span>
              <span class="principal chico">▶ Ver ahora</span>
            </span>
          </a>
        }
        @switch (estilo()) {
          @case ('panoramica') {
            @for (t of validos(); track t.imdbId) {
              <a class="tarjeta-pano" [routerLink]="['/titulo', t.tipo, t.imdbId]" [attr.aria-label]="t.titulo">
                <img class="pano-fondo" [src]="fondoDe(t)" (error)="alFallar($event, t)" alt="" loading="lazy" />
                <span class="pano-texto">
                  @if (logoDe(t); as logo) {
                    <img class="pano-logo" [src]="logo" [alt]="t.titulo" loading="lazy" (error)="sinLogo(t)" />
                  } @else {
                    <b class="pano-titulo">{{ t.titulo }}</b>
                  }
                </span>
              </a>
            }
          }
          @case ('apaisada') {
            @for (t of validos(); track t.imdbId) {
              <a class="tarjeta-apaisada" [routerLink]="['/titulo', t.tipo, t.imdbId]" [attr.aria-label]="t.titulo">
                <img class="pano-fondo" [src]="fondoDe(t)" (error)="alFallar($event, t)" alt="" loading="lazy" />
                <span class="pano-texto">
                  @if (logoDe(t); as logo) {
                    <img class="pano-logo" [src]="logo" [alt]="t.titulo" loading="lazy" (error)="sinLogo(t)" />
                  } @else {
                    <b class="pano-titulo">{{ t.titulo }}</b>
                  }
                </span>
              </a>
            }
          }
          @case ('grande') {
            @for (t of validos(); track t.imdbId) {
              <a class="poster grande" [routerLink]="['/titulo', t.tipo, t.imdbId]" [attr.aria-label]="t.titulo">
                @if (t.poster) {
                  <img [src]="masGrande(t.poster)" [alt]="t.titulo" loading="lazy" />
                } @else {
                  <span class="sin-poster">{{ t.titulo }}</span>
                }
              </a>
            }
          }
          @default {
            @for (t of validos(); track t.imdbId; let i = $index) {
              <a class="poster" [routerLink]="['/titulo', t.tipo, t.imdbId]" [attr.aria-label]="t.titulo" (mouseenter)="elegir(i)" (focus)="elegir(i)">
                @if (fila().tipo === 'top10') {
                  <span class="puesto">{{ i + 1 }}</span>
                }
                @if (t.poster) {
                  <img [src]="t.poster" [alt]="t.titulo" loading="lazy" />
                } @else {
                  <span class="sin-poster">{{ t.titulo }}</span>
                }
              </a>
            }
          }
        }
      </app-carrusel>
    }
  `,
})
export class FilaVista {
  readonly fila = input.required<Fila>();
  protected readonly validos = computed(() => (this.fila().items ?? []).filter((t) => t.imdbId));
  protected readonly estilo = computed(() => (this.fila().tipo === 'top10' ? 'comun' : (this.fila().estilo ?? 'comun')));
  private readonly posicion = signal(0);
  protected readonly elegido = computed(() => this.validos()[this.posicion()] ?? this.validos()[0] ?? null);

  // Los logos que no existen en ningún lado (404): se muestra el título en texto
  private readonly logosCaidos = signal<ReadonlySet<string>>(new Set());

  /** El logo del título: el del backend o el de metahub; null si no cargó. */
  protected logoDe(t: Titulo): string | null {
    if (!t.imdbId || this.logosCaidos().has(t.imdbId)) return null;
    return t.logo ?? 'https://images.metahub.space/logo/medium/' + t.imdbId + '/img';
  }

  protected sinLogo(t: Titulo) {
    if (t.imdbId) this.logosCaidos.update((conjunto) => new Set(conjunto).add(t.imdbId!));
  }

  protected readonly fondoDe = fondoDe;
  protected readonly masGrande = masGrande;
  protected readonly datos = datosDe;

  /** En la vitrina, pasar el mouse por una portada la pone en el panel grande. */
  protected elegir(indice: number) {
    if (this.estilo() === 'vitrina') this.posicion.set(indice);
  }

  /** Si el fondo horizontal no existe, se usa la portada. */
  protected alFallar(evento: Event, t: Titulo) {
    const img = evento.target as HTMLImageElement;
    if (t.poster && img.src !== t.poster) img.src = t.poster;
  }
}
