import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AvatarVista } from './avatar';
import { Apariencia, ModoAnimaciones } from './apariencia';
import { Barra } from './barra';
import { Perfil, Sesion } from './sesion';

interface Addon {
  id: number;
  nombre: string;
  enInicio: boolean;
}

interface AvatarElegible {
  clave: string;
  url: string | null;
}

const NOMBRES_IDIOMA: Record<string, string> = { latino: 'Latino', castellano: 'Castellano', original: 'Original (con subtítulos)' };
const CALIDADES = [
  { valor: 'automatica', nombre: 'Automática', ayuda: 'La mejor que ande bien: prefiere 1080p.' },
  { valor: '4k', nombre: '4K', ayuda: 'Necesita internet muy rápido y una pantalla 4K.' },
  { valor: '1080p', nombre: '1080p', ayuda: 'Full HD como máximo.' },
  { valor: '720p', nombre: '720p', ayuda: 'Gasta menos datos.' },
];
const ESPERA_GUARDADO_MS = 700;

/** Ajustes: perfil (nombre, avatar), reproducción (idiomas y calidad), addons y cuenta. */
@Component({
  selector: 'app-ajustes',
  imports: [FormsModule, Barra, AvatarVista],
  template: `
    <app-barra />
    <main class="pagina con-barra">
      <h1>Ajustes</h1>

      @if (perfil(); as p) {
        <section class="tarjeta vidrio ancha">
          <h2>Perfil</h2>
          <div class="perfil-editar">
            <app-avatar [nombre]="p.nombre" [avatar]="p.avatar" [url]="p.avatarUrl" [tamano]="72" />
            <form class="fila-formulario" (ngSubmit)="renombrar()">
              <input name="nombre" maxlength="30" aria-label="Nombre del perfil" required [(ngModel)]="nombre" />
              <button class="secundario" [disabled]="nombre.trim() === p.nombre">Guardar nombre</button>
            </form>
          </div>
          <p class="nota">Avatar</p>
          <div class="selector-avatar" role="radiogroup" aria-label="Avatar">
            @for (a of avatares(); track a.clave) {
              <button type="button" role="radio" [attr.aria-checked]="a.clave === p.avatar" [class.elegido]="a.clave === p.avatar" (click)="cambiarAvatar(a.clave)" [attr.aria-label]="'Avatar ' + a.clave">
                <app-avatar [nombre]="p.nombre" [avatar]="a.clave" [url]="a.url" [tamano]="52" />
              </button>
            }
          </div>
          @if (avisoPerfil(); as texto) {
            <p class="aviso">{{ texto }}</p>
          }
        </section>

        <section class="tarjeta vidrio ancha">
          <h2>Reproducción</h2>
          <p class="nota">Estas preferencias se guardan en tu perfil y valen en todos tus dispositivos.</p>
          <h3>Idioma del audio</h3>
          <ol class="lista">
            @for (idioma of idiomas(); track idioma; let i = $index) {
              <li>
                <span><b>{{ i + 1 }}</b> · {{ nombreIdioma(idioma) }}</span>
                <span class="botones">
                  <button class="secundario chico" [disabled]="i === 0" (click)="mover(i, -1)" [attr.aria-label]="'Subir ' + nombreIdioma(idioma)">↑</button>
                  <button class="secundario chico" [disabled]="i === idiomas().length - 1" (click)="mover(i, 1)" [attr.aria-label]="'Bajar ' + nombreIdioma(idioma)">↓</button>
                </span>
              </li>
            }
          </ol>
          <h3>Calidad máxima</h3>
          <div class="filtros">
            @for (c of calidades; track c.valor) {
              <button class="chip-filtro" [class.activo]="calidad() === c.valor" (click)="elegirCalidad(c.valor)">{{ c.nombre }}</button>
            }
          </div>
          <p class="nota">{{ ayudaCalidad() }}</p>
          @if (estadoGuardado(); as e) {
            <p class="nota" [class.aviso]="e === 'No se pudo guardar. Volvió al valor anterior.'">{{ e }}</p>
          }
        </section>
      }

      <section class="tarjeta vidrio ancha">
        <h2>Apariencia</h2>
        <h3>Animaciones</h3>
        <div class="filtros">
          @for (m of modosAnimacion; track m.valor) {
            <button class="chip-filtro" [class.activo]="apariencia.modo() === m.valor" (click)="apariencia.elegir(m.valor)">{{ m.nombre }}</button>
          }
        </div>
        <p class="nota">{{ ayudaAnimaciones() }}</p>
      </section>

      <section class="tarjeta vidrio ancha">
        <h2>Addons</h2>
        <p class="nota">Pegá la dirección de un addon de Stremio, ya configurado. Sus fuentes aparecen en la ficha y sus catálogos en Para ti (lo podés apagar por addon). Puede llevar tu clave: se guarda cifrada y no se vuelve a mostrar.</p>
        <form class="fila-formulario" (ngSubmit)="agregar()">
          <input name="url" type="password" autocomplete="off" placeholder="https://…/manifest.json" aria-label="Dirección del manifest" required [(ngModel)]="url" />
          <button class="principal" [disabled]="enviando()">Agregar</button>
        </form>
        @if (aviso(); as texto) {
          <p class="aviso">{{ texto }}</p>
        }
        <ul class="lista">
          <li><b>Películas libres</b><span class="chip">Incluido</span></li>
          <li><b>OpenSubtitles</b><span class="chip">Incluido</span></li>
          @for (a of addons(); track a.id) {
            <li>
              <b>{{ a.nombre }}</b>
              <span class="botones">
                <button class="chip-filtro" [class.activo]="a.enInicio" (click)="alternarInicio(a)" [attr.aria-pressed]="a.enInicio" [attr.aria-label]="'Mostrar los catálogos de ' + a.nombre + ' en Para ti'">
                  Para ti: {{ a.enInicio ? 'Sí' : 'No' }}
                </button>
                <button class="enlace" (click)="quitar(a)">Quitar</button>
              </span>
            </li>
          }
        </ul>
      </section>

      <section class="tarjeta vidrio ancha">
        <h2>Cuenta</h2>
        <div class="botones">
          <button class="secundario" (click)="cambiarPerfil()">Cambiar perfil</button>
          <button class="secundario" (click)="cerrarSesion()">Cerrar sesión</button>
          @if (perfil()) {
            <button class="secundario peligro" (click)="borrarPerfil()">{{ confirmarBorrado() ? 'Tocá de nuevo para borrar este perfil' : 'Borrar este perfil' }}</button>
          }
        </div>
        @if (confirmarBorrado()) {
          <p class="nota">Se borran también su progreso y su lista. No se puede deshacer.</p>
        }
      </section>
    </main>
  `,
})
export class Ajustes implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly sesion = inject(Sesion);
  private readonly router = inject(Router);

  protected readonly apariencia = inject(Apariencia);
  protected readonly modosAnimacion: { valor: ModoAnimaciones; nombre: string }[] = [
    { valor: 'sistema', nombre: 'Según el sistema' },
    { valor: 'siempre', nombre: 'Siempre' },
    { valor: 'nunca', nombre: 'Nunca' },
  ];
  protected readonly perfil = this.sesion.perfil;
  protected readonly calidades = CALIDADES;
  protected readonly addons = signal<Addon[]>([]);
  protected readonly avatares = signal<AvatarElegible[]>([]);
  protected readonly idiomas = signal<string[]>(this.perfil()?.idiomasAudio ?? ['latino', 'castellano', 'original']);
  protected readonly calidad = signal(this.perfil()?.calidadMaxima ?? 'automatica');
  protected readonly estadoGuardado = signal<string | null>(null);
  protected readonly avisoPerfil = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly confirmarBorrado = signal(false);
  protected url = '';
  protected nombre = this.perfil()?.nombre ?? '';
  private temporizador = 0;
  private ultimoGuardado = { idiomas: this.idiomas(), calidad: this.calidad() };

  constructor() {
    this.cargarAddons();
    this.http.get<{ avatares: AvatarElegible[] }>('/api/avatares').subscribe({ next: (r) => this.avatares.set(r.avatares), error: () => undefined });
  }

  ngOnDestroy() {
    // Si se sale con un cambio sin guardar, se guarda igual
    if (this.temporizador) {
      clearTimeout(this.temporizador);
      this.guardarPreferencias();
    }
  }

  protected nombreIdioma(clave: string) {
    return NOMBRES_IDIOMA[clave] ?? clave;
  }

  protected ayudaAnimaciones() {
    switch (this.apariencia.modo()) {
      case 'siempre':
        return 'Las filas se deslizan con animación, aunque tu sistema tenga las animaciones apagadas.';
      case 'nunca':
        return 'Nada se mueve: las filas saltan y el destacado no cambia solo.';
      default:
        return this.apariencia.sistemaReduce()
          ? 'Tu sistema tiene las animaciones desactivadas (en Windows, «Efectos de animación»), por eso así no se mueve nada. Elegí «Siempre» para verlas.'
          : 'Se mueve salvo que tu sistema pida reducir el movimiento.';
    }
  }

  protected ayudaCalidad() {
    return CALIDADES.find((c) => c.valor === this.calidad())?.ayuda ?? '';
  }

  // --- perfil
  private patch(cambios: object, alTerminar: (p: Perfil) => void, alFallar: (mensaje: string) => void) {
    const p = this.perfil();
    if (!p) return;
    this.http.patch<{ perfil: Perfil }>('/api/perfiles/' + p.id, cambios).subscribe({
      next: (r) => {
        this.sesion.actualizarPerfil(r.perfil);
        alTerminar(r.perfil);
      },
      error: (e: HttpErrorResponse) => alFallar(e.error?.error ?? 'No se pudo guardar.'),
    });
  }

  protected renombrar() {
    const nombre = this.nombre.trim();
    if (!nombre) return;
    this.avisoPerfil.set(null);
    this.patch({ nombre }, () => undefined, (m) => this.avisoPerfil.set(m));
  }

  protected cambiarAvatar(clave: string) {
    this.avisoPerfil.set(null);
    this.patch({ avatar: clave }, () => undefined, (m) => this.avisoPerfil.set(m));
  }

  protected borrarPerfil() {
    const p = this.perfil();
    if (!p) return;
    if (!this.confirmarBorrado()) {
      this.confirmarBorrado.set(true);
      return;
    }
    this.http.delete('/api/perfiles/' + p.id).subscribe({
      next: () => {
        this.sesion.olvidarPerfil();
        this.router.navigateByUrl('/perfiles');
      },
      error: (e: HttpErrorResponse) => {
        this.confirmarBorrado.set(false);
        this.avisoPerfil.set(e.error?.error ?? 'No se pudo borrar el perfil.');
      },
    });
  }

  // --- reproducción
  protected mover(indice: number, paso: number) {
    const lista = [...this.idiomas()];
    [lista[indice], lista[indice + paso]] = [lista[indice + paso], lista[indice]];
    this.idiomas.set(lista);
    this.programarGuardado();
  }

  protected elegirCalidad(valor: string) {
    this.calidad.set(valor);
    this.programarGuardado();
  }

  private programarGuardado() {
    this.estadoGuardado.set('Guardando…');
    clearTimeout(this.temporizador);
    this.temporizador = window.setTimeout(() => this.guardarPreferencias(), ESPERA_GUARDADO_MS);
  }

  /** Guarda 0,7 s después del último cambio; si falla, vuelve al valor anterior. */
  private guardarPreferencias() {
    this.temporizador = 0;
    const idiomas = this.idiomas();
    const calidad = this.calidad();
    this.patch(
      { idiomasAudio: idiomas, calidadMaxima: calidad },
      () => {
        this.ultimoGuardado = { idiomas, calidad };
        this.estadoGuardado.set('✓ Guardado en tu perfil');
      },
      () => {
        this.idiomas.set(this.ultimoGuardado.idiomas);
        this.calidad.set(this.ultimoGuardado.calidad);
        this.estadoGuardado.set('No se pudo guardar. Volvió al valor anterior.');
      },
    );
  }

  // --- addons
  private cargarAddons() {
    this.http.get<{ addons: Addon[] }>('/api/mis/addons').subscribe((r) => this.addons.set(r.addons));
  }

  protected agregar() {
    this.enviando.set(true);
    this.aviso.set(null);
    this.http.post('/api/mis/addons', { url: this.url }).subscribe({
      next: () => {
        this.url = '';
        this.enviando.set(false);
        this.cargarAddons();
      },
      error: (e: HttpErrorResponse) => {
        this.aviso.set(e.error?.error ?? 'No se pudo agregar.');
        this.enviando.set(false);
      },
    });
  }

  /** Muestra u oculta los catálogos del addon en Para ti; al instante, y vuelve atrás si falla. */
  protected alternarInicio(addon: Addon) {
    const nuevo = !addon.enInicio;
    this.addons.update((l) => l.map((x) => (x.id === addon.id ? { ...x, enInicio: nuevo } : x)));
    this.http.patch('/api/mis/addons/' + addon.id, { enInicio: nuevo }).subscribe({
      error: () => this.addons.update((l) => l.map((x) => (x.id === addon.id ? { ...x, enInicio: !nuevo } : x))),
    });
  }

  protected quitar(addon: Addon) {
    this.http.delete('/api/mis/addons/' + addon.id).subscribe(() => this.cargarAddons());
  }

  // --- cuenta
  protected cambiarPerfil() {
    this.router.navigateByUrl('/perfiles');
  }

  protected cerrarSesion() {
    this.sesion.cerrar();
    this.router.navigateByUrl('/entrar');
  }
}
