import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, computed, ElementRef, HostListener, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import type Hls from 'hls.js';
import { Fuente, Pedido, Reproduccion } from './datos';
import { Sesion } from './sesion';

const GUARDAR_CADA_MS = 15000;
const OCULTAR_CONTROLES_MS = 3000;
const AVISO_SIGUIENTE_S = 30;
const CUENTA_SIGUIENTE_S = 8;
const VELOCIDADES = [0.75, 1, 1.25, 1.5, 2];
const CLAVE_VOLUMEN = 'maxflix.volumen';

/**
 * El `<video>` del navegador con controles propios. HLS va con hls.js donde no es nativo (Chrome,
 * Firefox). El progreso se guarda cada 15 s, al pausar, al ocultar la página y al salir, solo si el
 * video llegó a arrancar. En series ofrece el episodio siguiente al final y pasa solo a los 8 s.
 *
 * Atajos: espacio o K, ← → (10 s), ↑ ↓ (volumen), M (silencio), F (pantalla completa).
 */
@Component({
  selector: 'app-reproductor',
  template: `
    <main #contenedor class="reproductor" [class.sin-cursor]="!visibles() && jugando()" (mousemove)="mostrar()" (touchstart)="mostrar()">
      <video #video playsinline (click)="alternar()" (dblclick)="pantallaCompleta()"></video>

      @if (estado(); as texto) {
        <p class="nota centrado-texto capa-video">{{ texto }}</p>
      }
      @if (error(); as texto) {
        <div class="centrado-texto capa-video">
          <p class="aviso">{{ texto }}</p>
          <button class="principal" (click)="salir()">Elegir otra fuente</button>
        </div>
      }

      @if (siguiente(); as sig) {
        @if (cuenta() !== null || cercaDelFinal()) {
          <div class="tarjeta-siguiente vidrio">
            <span class="etiqueta">Siguiente episodio</span>
            <b>T{{ sig.temporada }} E{{ sig.numero }}{{ sig.nombre ? ' · ' + sig.nombre : '' }}</b>
            <div class="botones">
              <button class="principal" (click)="pasarAlSiguiente()">
                ▶ Ver ahora{{ cuenta() !== null ? ' (' + cuenta() + ')' : '' }}
              </button>
              @if (cuenta() !== null) {
                <button class="secundario" (click)="cancelarCuenta()">Cancelar</button>
              }
            </div>
          </div>
        }
      }

      <div class="controles" [class.ocultos]="!visibles()">
        <header class="reproductor-barra">
          <button class="secundario" (click)="salir()">‹ Volver</button>
          <b>{{ nombre() }}</b>
        </header>
        <footer class="controles-abajo">
          <input
            class="barra-tiempo"
            type="range"
            min="0"
            step="1"
            aria-label="Posición"
            [max]="duracion() || 0"
            [value]="tiempo()"
            [style.--lleno]="porcentaje() + '%'"
            (input)="mover(+$any($event.target).value)"
          />
          <div class="fila-controles">
            <button (click)="saltar(-10)" aria-label="Retroceder 10 segundos">↺ 10</button>
            <button class="grande" (click)="alternar()" [attr.aria-label]="jugando() ? 'Pausa' : 'Reproducir'">{{ jugando() ? '⏸' : '▶' }}</button>
            <button (click)="saltar(10)" aria-label="Adelantar 10 segundos">10 ↻</button>
            <span class="tiempo">{{ reloj(tiempo()) }} / {{ reloj(duracion()) }}</span>
            <span class="espacio"></span>
            <button (click)="silenciar()" [attr.aria-label]="silencio() ? 'Activar sonido' : 'Silenciar'">{{ silencio() || volumen() === 0 ? '🔇' : '🔊' }}</button>
            <input
              class="barra-volumen"
              type="range"
              min="0"
              max="1"
              step="0.05"
              aria-label="Volumen"
              [value]="silencio() ? 0 : volumen()"
              [style.--lleno]="(silencio() ? 0 : volumen() * 100) + '%'"
              (input)="cambiarVolumen(+$any($event.target).value)"
            />
            <button (click)="cambiarVelocidad()" aria-label="Velocidad">{{ velocidad() }}×</button>
            <button (click)="pantallaCompleta()" [attr.aria-label]="completa() ? 'Salir de pantalla completa' : 'Pantalla completa'">{{ completa() ? '⤡' : '⛶' }}</button>
          </div>
        </footer>
      </div>
    </main>
  `,
})
export class Reproductor implements AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly sesion = inject(Sesion);
  private readonly reproduccion = inject(Reproduccion);
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly contenedor = viewChild.required<ElementRef<HTMLElement>>('contenedor');

  protected readonly pedido = signal<Pedido | null>(this.reproduccion.pedido());
  protected readonly estado = signal<string | null>('Preparando la fuente…');
  protected readonly error = signal<string | null>(null);
  protected readonly jugando = signal(false);
  protected readonly tiempo = signal(0);
  protected readonly duracion = signal(0);
  protected readonly volumen = signal(1);
  protected readonly silencio = signal(false);
  protected readonly velocidad = signal(1);
  protected readonly completa = signal(false);
  protected readonly visibles = signal(true);
  protected readonly cercaDelFinal = signal(false);
  protected readonly cuenta = signal<number | null>(null);

  protected readonly nombre = computed(() => {
    const p = this.pedido();
    return p ? p.titulo.nombre + (p.episodio ? ' · T' + p.episodio.temporada + ' E' + p.episodio.numero : '') : '';
  });
  protected readonly porcentaje = computed(() => (this.duracion() ? (this.tiempo() / this.duracion()) * 100 : 0));
  /** El episodio que sigue: el próximo de la lista; los especiales solo siguen a otros especiales. */
  protected readonly siguiente = computed(() => {
    const p = this.pedido();
    if (!p?.episodio) return null;
    const i = p.episodios.findIndex((e) => e.id === p.episodio!.id);
    if (i < 0) return null;
    const actual = p.episodios[i];
    return p.episodios.slice(i + 1).find((e) => actual.temporada === 0 || e.temporada !== 0) ?? null;
  });

  private hls: Hls | null = null;
  private empezo = false;
  private cambiando = false;
  private temporizadorGuardado = 0;
  private temporizadorOcultar = 0;
  private temporizadorCuenta = 0;
  private escuchas: [EventTarget, string, EventListener][] = [];

  ngAfterViewInit() {
    const p = this.pedido();
    if (!p) {
      this.router.navigateByUrl('/');
      return;
    }
    const v = this.video().nativeElement;
    try {
      const guardado = Number(localStorage.getItem(CLAVE_VOLUMEN));
      if (localStorage.getItem(CLAVE_VOLUMEN) !== null && guardado >= 0 && guardado <= 1) this.volumen.set(guardado);
    } catch {
      // Sin almacenamiento: queda el volumen por defecto
    }
    v.volume = this.volumen();

    this.escuchar(v, 'loadedmetadata', () => {
      this.duracion.set(v.duration);
      const inicio = this.pedido()?.posicionMs ?? 0;
      if (inicio > 0) v.currentTime = inicio / 1000;
    });
    this.escuchar(v, 'durationchange', () => isFinite(v.duration) && this.duracion.set(v.duration));
    this.escuchar(v, 'timeupdate', () => {
      this.tiempo.set(v.currentTime);
      const falta = v.duration - v.currentTime;
      this.cercaDelFinal.set(v.duration > 120 && falta <= AVISO_SIGUIENTE_S);
    });
    this.escuchar(v, 'playing', () => {
      this.empezo = true;
      this.estado.set(null);
      this.jugando.set(true);
    });
    this.escuchar(v, 'waiting', () => this.empezo && this.estado.set('Cargando…'));
    this.escuchar(v, 'play', () => this.jugando.set(true));
    this.escuchar(v, 'pause', () => {
      this.jugando.set(false);
      this.visibles.set(true);
      this.guardar();
    });
    this.escuchar(v, 'ended', () => {
      this.jugando.set(false);
      this.guardar(true);
      if (this.siguiente()) this.empezarCuenta();
    });
    this.escuchar(v, 'volumechange', () => {
      this.volumen.set(v.volume);
      this.silencio.set(v.muted);
    });
    this.escuchar(v, 'ratechange', () => this.velocidad.set(v.playbackRate));
    this.escuchar(v, 'error', () => v.getAttribute('src') && this.falla('El navegador no pudo abrir esta fuente.'));
    this.escuchar(document, 'visibilitychange', () => document.hidden && this.guardar());
    this.escuchar(document, 'fullscreenchange', () => this.completa.set(!!document.fullscreenElement));
    this.escuchar(window, 'pagehide', () => this.guardar());
    this.temporizadorGuardado = window.setInterval(() => !v.paused && this.guardar(), GUARDAR_CADA_MS);

    this.empezar(p);
  }

  private escuchar(destino: EventTarget, evento: string, funcion: EventListener) {
    destino.addEventListener(evento, funcion);
    this.escuchas.push([destino, evento, funcion]);
  }

  private empezar(p: Pedido) {
    this.pedido.set(p);
    this.reproduccion.pedido.set(p);
    this.hls?.destroy();
    this.hls = null;
    this.empezo = false;
    this.cambiando = false;
    this.cercaDelFinal.set(false);
    this.error.set(null);
    this.tiempo.set(0);
    this.duracion.set(0);
    this.estado.set('Preparando la fuente…');
    const v = this.video().nativeElement;
    v.removeAttribute('src');
    v.load();
    this.http.post<{ url: string }>('/api/mis/fuentes/' + p.fuente.id + '/enlace', {}).subscribe({
      next: (r) => this.abrir(r.url),
      error: (e: HttpErrorResponse) => this.falla(e.error?.error ?? 'No se pudo abrir la fuente.'),
    });
  }

  private async abrir(url: string) {
    const v = this.video().nativeElement;
    this.estado.set('Cargando el video…');
    const esHls = /\.m3u8($|\?)/i.test(url);
    if (esHls && !v.canPlayType('application/vnd.apple.mpegurl')) {
      const { default: Hls } = await import('hls.js');
      if (!Hls.isSupported()) return this.falla('Este navegador no reproduce esta fuente.');
      this.hls = new Hls();
      this.hls.on(Hls.Events.ERROR, (_, datos) => datos.fatal && this.falla('El navegador no pudo abrir esta fuente.'));
      this.hls.loadSource(url);
      this.hls.attachMedia(v);
    } else {
      v.src = url;
    }
    v.play().catch(() => this.estado.set('Tocá ▶ para reproducir.'));
  }

  private falla(texto: string) {
    this.estado.set(null);
    this.error.set(texto);
  }

  private guardar(terminado = false) {
    const v = this.video().nativeElement;
    const perfil = this.sesion.perfil();
    const p = this.pedido();
    if (!p || !perfil || !this.empezo || !isFinite(v.duration) || !v.duration) return;
    const idVideo = p.episodio?.id ?? p.titulo.id;
    this.http
      .put('/api/perfiles/' + perfil.id + '/progreso/' + encodeURIComponent(idVideo), {
        titulo: p.titulo,
        episodio: p.episodio,
        siguiente: this.siguiente(),
        posicionMs: Math.round((terminado ? v.duration : v.currentTime) * 1000),
        duracionMs: Math.round(v.duration * 1000),
      })
      .subscribe({ error: () => undefined });
  }

  // --- controles
  protected alternar() {
    const v = this.video().nativeElement;
    v.paused ? v.play().catch(() => undefined) : v.pause();
    this.mostrar();
  }

  protected saltar(segundos: number) {
    const v = this.video().nativeElement;
    v.currentTime = Math.min(Math.max(0, v.currentTime + segundos), v.duration || Infinity);
    this.mostrar();
  }

  protected mover(segundo: number) {
    this.video().nativeElement.currentTime = segundo;
    this.tiempo.set(segundo);
  }

  protected cambiarVolumen(valor: number) {
    const v = this.video().nativeElement;
    v.muted = false;
    v.volume = Math.min(1, Math.max(0, valor));
    try {
      localStorage.setItem(CLAVE_VOLUMEN, String(v.volume));
    } catch {
      // Sin almacenamiento: no se recuerda
    }
  }

  protected silenciar() {
    const v = this.video().nativeElement;
    v.muted = !v.muted;
  }

  protected cambiarVelocidad() {
    const v = this.video().nativeElement;
    v.playbackRate = VELOCIDADES[(VELOCIDADES.indexOf(v.playbackRate) + 1) % VELOCIDADES.length];
  }

  protected pantallaCompleta() {
    if (document.fullscreenElement) document.exitFullscreen();
    else this.contenedor().nativeElement.requestFullscreen?.().catch(() => undefined);
  }

  /** Muestra los controles y los esconde a los 3 s si el video está andando. */
  protected mostrar() {
    this.visibles.set(true);
    clearTimeout(this.temporizadorOcultar);
    this.temporizadorOcultar = window.setTimeout(() => this.jugando() && this.visibles.set(false), OCULTAR_CONTROLES_MS);
  }

  protected reloj(segundos: number) {
    const s = Math.max(0, Math.floor(segundos || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const dos = (n: number) => (n < 10 ? '0' : '') + n;
    return (h ? h + ':' + dos(m) : String(m)) + ':' + dos(s % 60);
  }

  @HostListener('document:keydown', ['$event'])
  protected tecla(e: KeyboardEvent) {
    const destino = e.target as HTMLElement;
    if (e.ctrlKey || e.metaKey || e.altKey || destino.tagName === 'SELECT') return;
    const v = this.video().nativeElement;
    const enRango = destino.tagName === 'INPUT';
    const acciones: Record<string, () => void> = {
      ' ': () => !enRango && this.alternar(),
      k: () => this.alternar(),
      ArrowLeft: () => this.saltar(-10),
      ArrowRight: () => this.saltar(10),
      ArrowUp: () => this.cambiarVolumen(v.volume + 0.1),
      ArrowDown: () => this.cambiarVolumen(v.volume - 0.1),
      m: () => this.silenciar(),
      f: () => this.pantallaCompleta(),
    };
    const accion = acciones[e.key];
    if (!accion || (enRango && e.key.startsWith('Arrow'))) return;
    e.preventDefault();
    accion();
  }

  // --- episodio siguiente
  private empezarCuenta() {
    this.cuenta.set(CUENTA_SIGUIENTE_S);
    this.visibles.set(true);
    this.temporizadorCuenta = window.setInterval(() => {
      const quedan = (this.cuenta() ?? 1) - 1;
      if (quedan <= 0) this.pasarAlSiguiente();
      else this.cuenta.set(quedan);
    }, 1000);
  }

  protected cancelarCuenta() {
    clearInterval(this.temporizadorCuenta);
    this.cuenta.set(null);
  }

  /** Busca las fuentes del que sigue: la del mismo addon si es compatible; si no, la primera compatible. */
  protected pasarAlSiguiente() {
    const sig = this.siguiente();
    const p = this.pedido();
    if (!sig || !p || this.cambiando) return;
    this.cambiando = true;
    this.cancelarCuenta();
    this.guardar(true);
    this.estado.set('Buscando las fuentes del siguiente episodio…');
    this.http.get<{ fuentes: Fuente[] }>('/api/mis/fuentes/series/' + encodeURIComponent(sig.id)).subscribe({
      next: (r) => {
        const elegida =
          r.fuentes.find((f) => f.addon === p.fuente.addon && f.nivel === 'compatible') ??
          r.fuentes.find((f) => f.nivel === 'compatible') ??
          r.fuentes.find((f) => f.nivel === 'desconocida');
        if (!elegida) {
          this.cambiando = false;
          this.falla('No hay una fuente compatible para el siguiente episodio.');
          return;
        }
        this.empezar({ ...p, episodio: sig, fuente: elegida, posicionMs: 0 });
      },
      error: (e: HttpErrorResponse) => {
        this.cambiando = false;
        this.falla(e.error?.error ?? 'No se pudieron buscar las fuentes.');
      },
    });
  }

  protected salir() {
    history.back();
  }

  ngOnDestroy() {
    clearInterval(this.temporizadorGuardado);
    clearInterval(this.temporizadorCuenta);
    clearTimeout(this.temporizadorOcultar);
    this.guardar();
    for (const [destino, evento, funcion] of this.escuchas) destino.removeEventListener(evento, funcion);
    this.hls?.destroy();
    const v = this.video().nativeElement;
    v.removeAttribute('src');
    v.load();
  }
}
