import { Injectable, signal } from '@angular/core';

/** Los datos de un título que el backend guarda con el progreso y Mi lista. */
export interface Copia {
  id: string;
  tipo: string;
  nombre: string;
  poster?: string | null;
  fondo?: string | null;
  anio?: string | null;
  generos?: string[];
  descripcion?: string | null;
}

export interface Episodio {
  id: string;
  temporada: number;
  numero: number;
  nombre?: string;
  miniatura?: string | null;
}

export interface Progreso {
  idVideo: string;
  posicionMs: number;
  duracionMs: number;
  titulo: Copia;
  episodio: Episodio | null;
}

export interface Fuente {
  id: string;
  addon: string;
  nombre: string;
  detalle: string;
  nivel: 'compatible' | 'desconocida' | 'dudosa' | 'no';
  motivo: string | null;
}

export interface Pedido {
  titulo: Copia;
  episodio: Episodio | null;
  /** Todos los episodios de la serie, en orden (vacío en películas): de acá sale el siguiente. */
  episodios: Episodio[];
  fuente: Fuente;
  posicionMs: number;
}

/** Lo que eligió la ficha para el reproductor. */
@Injectable({ providedIn: 'root' })
export class Reproduccion {
  readonly pedido = signal<Pedido | null>(null);
}

/** Terminado: pasó el 95 % o quedan menos de 2 minutos, como en el resto de MaxFlix. */
export function terminado(p: Progreso) {
  return p.duracionMs > 0 && (p.posicionMs / p.duracionMs >= 0.95 || p.duracionMs - p.posicionMs <= 120000);
}
