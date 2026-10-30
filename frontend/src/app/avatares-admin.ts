import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Barra } from './barra';

interface AvatarAdmin {
  clave: string;
  url: string | null;
  bytes: number;
  orden: number;
  retirado: boolean;
  uso: number;
}

const LADO_PX = 256;
const CALIDAD_WEBP = 0.85;

/** Recorta el centro en cuadrado y lo achica a 256 × 256: el backend no revisa el tamaño en píxeles. */
async function prepararImagen(archivo: File): Promise<Blob> {
  const imagen = await createImageBitmap(archivo);
  const lado = Math.min(imagen.width, imagen.height);
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = LADO_PX;
  const contexto = lienzo.getContext('2d')!;
  contexto.drawImage(imagen, (imagen.width - lado) / 2, (imagen.height - lado) / 2, lado, lado, 0, 0, LADO_PX, LADO_PX);
  imagen.close();
  const convertir = (tipo: string, calidad?: number) => new Promise<Blob | null>((ok) => lienzo.toBlob(ok, tipo, calidad));
  return (await convertir('image/webp', CALIDAD_WEBP)) ?? (await convertir('image/png'))!;
}

/** Administración: las imágenes de avatar que pueden elegir los perfiles. */
@Component({
  selector: 'app-avatares-admin',
  imports: [Barra],
  template: `
    <app-barra />
    <main class="pagina con-barra">
      <div class="titulo-seccion">
        <div>
          <span class="etiqueta">Administración</span>
          <h1>Avatares</h1>
          <p class="nota">{{ avatares().length }} imágenes · {{ retirados() }} retiradas · {{ enUso() }} perfiles las usan</p>
        </div>
        <label class="principal subir" [class.apagado]="ocupado()">
          ＋ Agregar imágenes
          <input type="file" accept="image/*" multiple hidden [disabled]="ocupado()" (change)="agregar($any($event.target))" />
        </label>
      </div>
      @if (progreso(); as p) {
        <p class="nota">{{ p }}</p>
      }
      @for (e of errores(); track $index) {
        <p class="aviso">{{ e }} <button class="enlace" (click)="errores.set([])">Cerrar</button></p>
      }
      @if (!avatares().length && cargada()) {
        <p class="nota">Todavía no hay imágenes: los perfiles usan los 12 colores de siempre.</p>
      }
      <div class="grilla-avatares">
        @for (a of avatares(); track a.clave; let i = $index) {
          <div class="avatar-admin" [class.retirado]="a.retirado">
            <img [src]="a.url" alt="" />
            <b>{{ a.clave }}</b>
            <span class="nota">{{ kb(a.bytes) }} KB · {{ a.uso }} {{ a.uso === 1 ? 'perfil' : 'perfiles' }}</span>
            @if (a.retirado) {
              <span class="chip" data-nivel="dudosa">Retirado</span>
            }
            <div class="acciones-avatar">
              <button class="secundario chico" [disabled]="ocupado() || i === 0" (click)="mover(i, -1)" aria-label="Mover antes">‹</button>
              <button class="secundario chico" [disabled]="ocupado() || i === avatares().length - 1" (click)="mover(i, 1)" aria-label="Mover después">›</button>
              <label class="secundario chico" [class.apagado]="ocupado()">
                Cambiar
                <input type="file" accept="image/*" hidden [disabled]="ocupado()" (change)="cambiarImagen(a, $any($event.target))" />
              </label>
              <button class="secundario chico" [disabled]="ocupado()" (click)="retirar(a)">{{ a.retirado ? 'Poner' : 'Retirar' }}</button>
              <button class="secundario chico peligro" [disabled]="ocupado() || a.uso > 0" [title]="a.uso > 0 ? 'Lo usan perfiles: retiralo en vez de borrarlo' : ''" (click)="borrar(a)">
                {{ confirmar() === a.clave ? '¿Borrar?' : 'Borrar' }}
              </button>
            </div>
          </div>
        }
      </div>
    </main>
  `,
})
export class AvataresAdmin {
  private readonly http = inject(HttpClient);
  protected readonly avatares = signal<AvatarAdmin[]>([]);
  protected readonly cargada = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly progreso = signal<string | null>(null);
  protected readonly errores = signal<string[]>([]);
  protected readonly confirmar = signal<string | null>(null);
  protected readonly retirados = computed(() => this.avatares().filter((a) => a.retirado).length);
  protected readonly enUso = computed(() => this.avatares().reduce((n, a) => n + a.uso, 0));

  constructor() {
    this.cargar();
  }

  protected kb(bytes: number) {
    return Math.max(1, Math.round(bytes / 1024));
  }

  private cargar(alTerminar?: () => void) {
    this.http.get<{ avatares: AvatarAdmin[] }>('/api/admin/avatares').subscribe({
      next: (r) => {
        this.avatares.set(r.avatares);
        this.cargada.set(true);
        alTerminar?.();
      },
      error: () => this.errores.set(['No se pudo cargar la lista.']),
    });
  }

  private falla(e: HttpErrorResponse, ante: string) {
    this.errores.update((l) => [...l, e.error?.error ?? ante]);
  }

  protected async agregar(entrada: HTMLInputElement) {
    const archivos = Array.from(entrada.files ?? []);
    entrada.value = '';
    if (!archivos.length) return;
    this.ocupado.set(true);
    for (let i = 0; i < archivos.length; i++) {
      this.progreso.set('Subiendo ' + (i + 1) + ' de ' + archivos.length + '…');
      try {
        const imagen = await prepararImagen(archivos[i]);
        await new Promise<void>((ok) =>
          this.http.post('/api/admin/avatares', imagen, { headers: { 'Content-Type': imagen.type } }).subscribe({
            next: () => ok(),
            error: (e: HttpErrorResponse) => (this.falla(e, 'No se pudo subir ' + archivos[i].name + '.'), ok()),
          }),
        );
      } catch {
        this.errores.update((l) => [...l, archivos[i].name + ' no es una imagen que se pueda leer.']);
      }
    }
    this.progreso.set(null);
    this.cargar(() => this.ocupado.set(false));
  }

  protected async cambiarImagen(a: AvatarAdmin, entrada: HTMLInputElement) {
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    this.ocupado.set(true);
    try {
      const imagen = await prepararImagen(archivo);
      this.http.put('/api/admin/avatares/' + a.clave + '/imagen', imagen, { headers: { 'Content-Type': imagen.type } }).subscribe({
        next: () => this.cargar(() => this.ocupado.set(false)),
        error: (e: HttpErrorResponse) => (this.falla(e, 'No se pudo cambiar la imagen.'), this.ocupado.set(false)),
      });
    } catch {
      this.errores.update((l) => [...l, archivo.name + ' no es una imagen que se pueda leer.']);
      this.ocupado.set(false);
    }
  }

  protected retirar(a: AvatarAdmin) {
    this.ocupado.set(true);
    this.http.patch('/api/admin/avatares/' + a.clave, { retirado: !a.retirado }).subscribe({
      next: () => this.cargar(() => this.ocupado.set(false)),
      error: (e: HttpErrorResponse) => (this.falla(e, 'No se pudo cambiar.'), this.ocupado.set(false)),
    });
  }

  /** Cambia el orden al instante; si el backend falla, vuelve. */
  protected mover(indice: number, paso: number) {
    const antes = this.avatares();
    const lista = [...antes];
    [lista[indice], lista[indice + paso]] = [lista[indice + paso], lista[indice]];
    this.avatares.set(lista);
    this.http.put('/api/admin/avatares/orden', { claves: lista.map((a) => a.clave) }).subscribe({
      error: (e: HttpErrorResponse) => (this.avatares.set(antes), this.falla(e, 'No se pudo cambiar el orden.')),
    });
  }

  protected borrar(a: AvatarAdmin) {
    if (this.confirmar() !== a.clave) {
      this.confirmar.set(a.clave);
      return;
    }
    this.confirmar.set(null);
    this.ocupado.set(true);
    this.http.delete('/api/admin/avatares/' + a.clave).subscribe({
      next: () => this.cargar(() => this.ocupado.set(false)),
      error: (e: HttpErrorResponse) => (this.falla(e, 'No se pudo borrar.'), this.ocupado.set(false)),
    });
  }
}
