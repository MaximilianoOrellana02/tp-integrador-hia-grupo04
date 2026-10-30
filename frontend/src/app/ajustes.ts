import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Barra } from './barra';

interface Addon {
  id: number;
  nombre: string;
}

/** Los addons de la cuenta. La dirección se guarda cifrada y no se vuelve a mostrar. */
@Component({
  selector: 'app-ajustes',
  imports: [FormsModule, Barra],
  template: `
    <app-barra />
    <main class="pagina con-barra">
      <h1>Ajustes</h1>
      <section class="tarjeta vidrio ancha">
        <h2>Addons</h2>
        <p class="nota">Pegá la dirección de un addon de Stremio, ya configurado. Sus fuentes aparecen en la ficha y sus catálogos en Inicio. Puede llevar tu clave: se guarda cifrada y no se vuelve a mostrar.</p>
        <form class="fila-formulario" (ngSubmit)="agregar()">
          <input name="url" type="password" autocomplete="off" placeholder="https://…/manifest.json" aria-label="Dirección del manifest" required [(ngModel)]="url" />
          <button class="principal" [disabled]="enviando()">Agregar</button>
        </form>
        @if (aviso(); as texto) {
          <p class="aviso">{{ texto }}</p>
        }
        <ul class="lista">
          <li><b>Películas libres</b><span class="chip">Incluido</span></li>
          @for (a of addons(); track a.id) {
            <li>
              <b>{{ a.nombre }}</b>
              <button class="enlace" (click)="quitar(a)">Quitar</button>
            </li>
          }
        </ul>
      </section>
    </main>
  `,
})
export class Ajustes {
  private readonly http = inject(HttpClient);
  protected readonly addons = signal<Addon[]>([]);
  protected readonly aviso = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected url = '';

  constructor() {
    this.cargar();
  }

  private cargar() {
    this.http.get<{ addons: Addon[] }>('/api/mis/addons').subscribe((r) => this.addons.set(r.addons));
  }

  protected agregar() {
    this.enviando.set(true);
    this.aviso.set(null);
    this.http.post('/api/mis/addons', { url: this.url }).subscribe({
      next: () => {
        this.url = '';
        this.enviando.set(false);
        this.cargar();
      },
      error: (e: HttpErrorResponse) => {
        this.aviso.set(e.error?.error ?? 'No se pudo agregar.');
        this.enviando.set(false);
      },
    });
  }

  protected quitar(addon: Addon) {
    this.http.delete('/api/mis/addons/' + addon.id).subscribe(() => this.cargar());
  }
}
