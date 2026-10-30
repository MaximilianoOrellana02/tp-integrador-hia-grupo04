import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Barra } from './barra';
import { SagaResumen, Titulo } from './datos';

/** Una saga: sus películas en orden, para verlas de principio a fin. */
@Component({
  selector: 'app-saga',
  imports: [RouterLink, Barra],
  template: `
    <app-barra />
    @if (datos(); as d) {
      <section class="ficha-heroe" [style.background-image]="d.saga.fondo ? 'url(&quot;' + d.saga.fondo + '&quot;)' : 'none'">
        <div class="ficha-contenido">
          <div class="ficha-datos">
            <button class="enlace volver" (click)="volver()">‹ Volver</button>
            <span class="etiqueta">{{ d.saga.cantidad === 3 ? 'Trilogía' : 'Saga completa' }}</span>
            <h1>{{ d.saga.nombre }}</h1>
            <p class="nota">{{ d.saga.cantidad }} películas · {{ d.saga.anios }}</p>
            <p class="sinopsis">{{ d.saga.descripcion }}</p>
            @if (primera(); as p) {
              <a class="principal boton-enlace" [routerLink]="['/titulo', 'movie', p.imdbId]">▶ Empezar por la primera</a>
            }
          </div>
        </div>
      </section>
      <main class="pagina">
        <h2>Películas de la saga</h2>
        <div class="grilla">
          @for (p of d.peliculas; track p.imdbId; let i = $index) {
            <a class="obra" [routerLink]="['/titulo', p.tipo, p.imdbId]">
              <span class="poster">
                <span class="insignia">{{ i + 1 }}</span>
                @if (p.poster) {
                  <img [src]="p.poster" [alt]="p.titulo" loading="lazy" />
                } @else {
                  <span class="sin-poster">{{ p.titulo }}</span>
                }
              </span>
              <span class="nota">{{ p.anio }}</span>
            </a>
          }
        </div>
      </main>
    } @else if (error()) {
      <div class="espacio-barra"></div>
      <p class="aviso centrado-texto">No se pudo cargar la saga.</p>
    } @else {
      <div class="espacio-barra"></div>
      <p class="nota centrado-texto">Cargando…</p>
    }
  `,
})
export class Saga {
  private readonly router = inject(Router);
  protected readonly datos = signal<{ saga: SagaResumen; peliculas: Titulo[] } | null>(null);
  protected readonly error = signal(false);
  protected readonly primera = computed(() => this.datos()?.peliculas[0] ?? null);

  constructor() {
    const id = inject(ActivatedRoute).snapshot.paramMap.get('id');
    inject(HttpClient)
      .get<{ saga: SagaResumen; peliculas: Titulo[] }>('/api/sagas/' + encodeURIComponent(id ?? ''))
      .subscribe({ next: (r) => this.datos.set(r), error: () => this.error.set(true) });
  }

  protected volver() {
    history.length > 1 ? history.back() : this.router.navigateByUrl('/peliculas');
  }
}
