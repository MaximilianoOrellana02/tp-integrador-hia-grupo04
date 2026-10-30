import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Fila } from './datos';

const CADA_MS = 8000;

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
    const reloj = setInterval(() => {
      const n = this.destacados().length;
      if (n > 1 && !document.hidden) this.indice.set((this.indice() + 1) % n);
    }, CADA_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }
}

/** Una fila de pósters, un Top 10 con números grandes o el banner de nueva temporada. */
@Component({
  selector: 'app-fila',
  imports: [RouterLink],
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
      <section class="fila">
        <h2>{{ fila().nombre }}</h2>
        <div class="pista">
          @for (g of fila().generos; track g.genero + g.tipo) {
            <a class="tarjeta-genero" [style.border-left-color]="g.color" [routerLink]="['/genero', g.tipo, g.genero]" [queryParams]="{ n: g.nombre }">{{ g.nombre }}</a>
          }
        </div>
      </section>
    } @else if (fila().tipo === 'sagas' && fila().sagas?.length) {
      <section class="fila">
        <h2>{{ fila().nombre }}<span class="nota"> · {{ fila().detalle }}</span></h2>
        <div class="pista">
          @for (s of fila().sagas; track s.id) {
            <a class="tarjeta-saga" [routerLink]="['/saga', s.id]" [style.background-image]="s.fondo ? 'url(&quot;' + s.fondo + '&quot;)' : 'none'">
              <span class="tarjeta-saga-texto">
                <b>{{ s.nombre }}</b>
                <span class="nota">{{ s.cantidad }} películas · {{ s.anios }}</span>
              </span>
            </a>
          }
        </div>
      </section>
    } @else if (fila().items?.length) {
      <section class="fila" [class.top10]="fila().tipo === 'top10'">
        <h2>
          {{ fila().nombre }}
          @if (fila().plataforma; as p) {
            <a class="ver-todo" [routerLink]="['/originales', p]">Ver todo ›</a>
          }
        </h2>
        <div class="pista">
          @for (t of fila().items; track $index) {
            @if (t.imdbId) {
              <a class="poster" [routerLink]="['/titulo', t.tipo, t.imdbId]" [attr.aria-label]="t.titulo">
                @if (fila().tipo === 'top10') {
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
  `,
})
export class FilaVista {
  readonly fila = input.required<Fila>();
}
