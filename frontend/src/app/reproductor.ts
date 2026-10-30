import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import type Hls from 'hls.js';
import { Reproduccion } from './datos';
import { Sesion } from './sesion';

const GUARDAR_CADA_MS = 15000;

/**
 * El `<video>` del navegador. HLS va con hls.js donde no es nativo (Chrome, Firefox). El progreso se
 * guarda cada 15 s, al pausar, al ocultar la página y al salir, solo si el video llegó a arrancar.
 */
@Component({
  selector: 'app-reproductor',
  template: `
    <main class="reproductor">
      <header class="reproductor-barra">
        <button class="secundario" (click)="salir()">‹ Volver</button>
        <b>{{ nombre }}</b>
      </header>
      <video #video controls playsinline></video>
      @if (estado(); as texto) {
        <p class="nota centrado-texto capa-video">{{ texto }}</p>
      }
      @if (error(); as texto) {
        <div class="centrado-texto capa-video">
          <p class="aviso">{{ texto }}</p>
          <button class="principal" (click)="salir()">Elegir otra fuente</button>
        </div>
      }
    </main>
  `,
})
export class Reproductor implements AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly sesion = inject(Sesion);
  private readonly pedido = inject(Reproduccion).pedido();
  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly estado = signal<string | null>('Preparando la fuente…');
  protected readonly error = signal<string | null>(null);
  protected readonly nombre = this.pedido
    ? this.pedido.titulo.nombre + (this.pedido.episodio ? ' · T' + this.pedido.episodio.temporada + ' E' + this.pedido.episodio.numero : '')
    : '';
  private hls: Hls | null = null;
  private empezo = false;
  private cada = 0;
  private readonly alGuardar = () => this.guardar();
  private readonly alOcultar = () => document.hidden && this.guardar();

  ngAfterViewInit() {
    if (!this.pedido) {
      this.router.navigateByUrl('/');
      return;
    }
    const v = this.video().nativeElement;
    v.addEventListener('loadedmetadata', () => {
      if (this.pedido!.posicionMs > 0) v.currentTime = this.pedido!.posicionMs / 1000;
    });
    v.addEventListener('playing', () => {
      this.empezo = true;
      this.estado.set(null);
    });
    v.addEventListener('pause', this.alGuardar);
    v.addEventListener('error', () => {
      if (v.getAttribute('src')) this.falla('El navegador no pudo abrir esta fuente.');
    });
    document.addEventListener('visibilitychange', this.alOcultar);
    window.addEventListener('pagehide', this.alGuardar);
    this.cada = window.setInterval(() => !v.paused && this.guardar(), GUARDAR_CADA_MS);

    this.http.post<{ url: string }>('/api/mis/fuentes/' + this.pedido.fuente.id + '/enlace', {}).subscribe({
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

  private guardar() {
    const v = this.video().nativeElement;
    const perfil = this.sesion.perfil();
    const p = this.pedido;
    if (!p || !perfil || !this.empezo || !isFinite(v.duration) || !v.duration) return;
    const idVideo = p.episodio?.id ?? p.titulo.id;
    this.http
      .put('/api/perfiles/' + perfil.id + '/progreso/' + encodeURIComponent(idVideo), {
        titulo: p.titulo,
        episodio: p.episodio,
        siguiente: null,
        posicionMs: Math.round(v.currentTime * 1000),
        duracionMs: Math.round(v.duration * 1000),
      })
      .subscribe({ error: () => undefined });
  }

  protected salir() {
    history.back();
  }

  ngOnDestroy() {
    clearInterval(this.cada);
    document.removeEventListener('visibilitychange', this.alOcultar);
    window.removeEventListener('pagehide', this.alGuardar);
    this.guardar();
    this.hls?.destroy();
    const v = this.video().nativeElement;
    v.removeEventListener('pause', this.alGuardar);
    v.removeAttribute('src');
    v.load();
  }
}
