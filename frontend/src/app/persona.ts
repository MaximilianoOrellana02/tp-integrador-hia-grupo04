import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Barra } from './barra';

interface Obra {
  imdbId: string;
  tipo: string;
  titulo: string;
  anio?: string | null;
  poster?: string | null;
  personaje?: string | null;
}

interface Datos {
  nombre: string;
  foto?: string | null;
  oficio?: string | null;
  edad?: number | null;
  lugarNacimiento?: string | null;
  biografia?: string | null;
}

type Filtro = 'todo' | 'movie' | 'series';

/** La pantalla de un actor: foto, datos, biografía y su filmografía con filtros. */
@Component({
  selector: 'app-persona',
  imports: [RouterLink, Barra],
  template: `
    <app-barra />
    <main class="pagina con-barra">
      @if (datos(); as d) {
        <div class="persona-cabecera">
          @if (d.foto) {
            <img class="persona-foto" [src]="d.foto" [alt]="d.nombre" />
          }
          <div>
            <h1>{{ d.nombre }}</h1>
            <p class="nota">{{ detalle() }}</p>
            @if (d.biografia) {
              <p class="biografia" [class.abierta]="abierta()">{{ d.biografia }}</p>
              <button class="enlace" (click)="abierta.set(!abierta())">{{ abierta() ? 'Leer menos' : 'Leer más' }}</button>
            }
          </div>
        </div>

        <div class="filtros">
          @for (f of filtros; track f.valor) {
            <button class="chip-filtro" [class.activo]="filtro() === f.valor" (click)="filtro.set(f.valor)">{{ f.nombre }} · {{ cantidad(f.valor) }}</button>
          }
        </div>
        <div class="grilla">
          @for (o of visibles(); track o.imdbId) {
            <a class="obra" [routerLink]="['/titulo', o.tipo, o.imdbId]">
              <span class="poster">
                @if (o.poster) {
                  <img [src]="o.poster" [alt]="o.titulo" loading="lazy" />
                } @else {
                  <span class="sin-poster">{{ o.titulo }}</span>
                }
              </span>
              @if (o.personaje) {
                <span class="nota">como {{ o.personaje }}</span>
              }
            </a>
          }
        </div>
      } @else if (error()) {
        <p class="aviso">No se pudo cargar a esta persona.</p>
      } @else {
        <p class="nota">Cargando…</p>
      }
    </main>
  `,
})
export class Persona {
  protected readonly filtros: { valor: Filtro; nombre: string }[] = [
    { valor: 'todo', nombre: 'Todo' },
    { valor: 'movie', nombre: 'Películas' },
    { valor: 'series', nombre: 'Series' },
  ];
  protected readonly datos = signal<Datos | null>(null);
  protected readonly obras = signal<Obra[]>([]);
  protected readonly error = signal(false);
  protected readonly abierta = signal(false);
  protected readonly filtro = signal<Filtro>('todo');
  protected readonly visibles = computed(() => this.obras().filter((o) => this.filtro() === 'todo' || o.tipo === this.filtro()));
  protected readonly detalle = computed(() => {
    const d = this.datos();
    return [d?.oficio, d?.edad ? d.edad + ' años' : null, d?.lugarNacimiento].filter(Boolean).join(' · ');
  });

  constructor() {
    const id = inject(ActivatedRoute).snapshot.paramMap.get('id');
    inject(HttpClient)
      .get<{ persona: Datos; titulos: Obra[] }>('/api/personas/' + encodeURIComponent(id ?? ''))
      .subscribe({
        next: (r) => {
          this.datos.set(r.persona);
          this.obras.set(r.titulos.filter((o) => o.imdbId));
        },
        error: () => this.error.set(true),
      });
  }

  protected cantidad(f: Filtro) {
    return f === 'todo' ? this.obras().length : this.obras().filter((o) => o.tipo === f).length;
  }
}
