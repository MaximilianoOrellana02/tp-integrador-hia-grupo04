import { Injectable, signal } from '@angular/core';

export type ModoAnimaciones = 'sistema' | 'siempre' | 'nunca';

const CLAVE = 'maxflix.animaciones';
const MODOS: ModoAnimaciones[] = ['sistema', 'siempre', 'nunca'];

function leer(): ModoAnimaciones {
  try {
    const guardado = localStorage.getItem(CLAVE) as ModoAnimaciones | null;
    return guardado && MODOS.includes(guardado) ? guardado : 'sistema';
  } catch {
    return 'sistema';
  }
}

/**
 * Si la web se mueve. Por defecto sigue al sistema (la preferencia «reducir movimiento»), pero hay
 * sistemas con las animaciones apagadas de fábrica y entonces nada se mueve: «Siempre» lo fuerza y
 * «Nunca» lo apaga. El CSS lee el modo del atributo \`data-animaciones\` de la página.
 */
@Injectable({ providedIn: 'root' })
export class Apariencia {
  readonly modo = signal<ModoAnimaciones>(leer());

  constructor() {
    document.documentElement.dataset['animaciones'] = this.modo();
  }

  elegir(modo: ModoAnimaciones) {
    this.modo.set(modo);
    document.documentElement.dataset['animaciones'] = modo;
    try {
      localStorage.setItem(CLAVE, modo);
    } catch {
      // Sin almacenamiento: vale hasta cerrar la pestaña
    }
  }

  /** El sistema pide menos movimiento. */
  sistemaReduce(): boolean {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Si las animaciones tienen que estar apagadas ahora. */
  reducido(): boolean {
    const modo = this.modo();
    return modo === 'nunca' || (modo === 'sistema' && this.sistemaReduce());
  }
}
