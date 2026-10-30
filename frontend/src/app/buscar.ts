import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Barra } from './barra';
import { catchError, debounceTime, distinctUntilChanged, forkJoin, map, of, Subject, switchMap } from 'rxjs';

interface Resultado {
  id: string;
  type: string;
  name: string;
  poster?: string;
}

const CINEMETA = 'https://v3-cinemeta.strem.io/catalog/';
const ESPERA_MS = 350;

/** Busca películas y series en Cinemeta, 350 ms después de la última tecla. */
@Component({
  selector: 'app-buscar',
  imports: [RouterLink, Barra],
  template: `
    <app-barra />
    <main class="pagina con-barra">
      <input class="ancho buscador" type="search" placeholder="Buscá una película o serie" aria-label="Buscar" autofocus (input)="texto.next($any($event.target).value)" />
      @if (estado(); as t) {
        <p class="nota">{{ t }}</p>
      }
      <div class="grilla">
        @for (r of resultados(); track r.type + r.id) {
          <a class="poster" [routerLink]="['/titulo', r.type, r.id]" [attr.aria-label]="r.name">
            @if (r.poster) {
              <img [src]="r.poster" [alt]="r.name" loading="lazy" />
            } @else {
              <span class="sin-poster">{{ r.name }}</span>
            }
          </a>
        }
      </div>
    </main>
  `,
})
export class Buscar {
  private readonly http = inject(HttpClient);
  protected readonly texto = new Subject<string>();
  protected readonly resultados = signal<Resultado[]>([]);
  protected readonly estado = signal<string | null>(null);

  constructor() {
    this.texto
      .pipe(
        map((t) => t.trim()),
        debounceTime(ESPERA_MS),
        distinctUntilChanged(),
        switchMap((t) => {
          if (t.length < 2) return of(null);
          this.estado.set('Buscando…');
          const pedir = (tipo: string) =>
            this.http.get<{ metas: Resultado[] }>(CINEMETA + tipo + '/top/search=' + encodeURIComponent(t) + '.json').pipe(
              map((r) => r.metas ?? []),
              catchError(() => of<Resultado[]>([])),
            );
          return forkJoin([pedir('movie'), pedir('series')]).pipe(map(([p, s]) => [...p, ...s]));
        }),
      )
      .subscribe((lista) => {
        this.resultados.set((lista ?? []).filter((r) => /^tt\d+$/.test(r.id)));
        this.estado.set(lista && !lista.length ? 'Sin resultados.' : null);
      });
  }
}
