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
  puntajeImdb?: string | null;
}

/** Un título como lo arman las filas del backend. */
export type EstiloFila = 'comun' | 'panoramica' | 'grande' | 'apaisada' | 'vitrina';

export interface Titulo {
  puntajeImdb?: string | null;
  puntaje?: number | string | null;
  imdbId?: string;
  tipo: string;
  titulo: string;
  poster?: string | null;
  fondo?: string | null;
  logo?: string | null;
  anio?: string | null;
  descripcion?: string | null;
  generos?: string[];
}

/** Una fila de Inicio, Películas o Series: destacado, top10, posters, banner, generos o sagas. */
export interface Fila {
  /** Cómo se dibujan sus portadas (lo asigna la pantalla, según el orden de las filas). */
  estilo?: EstiloFila;
  tipo: string;
  nombre?: string;
  detalle?: string;
  etiqueta?: string;
  titulo?: Titulo;
  items?: Titulo[];
  mas?: Fila[];
  plataforma?: string;
  generos?: GeneroTarjeta[];
  sagas?: SagaResumen[];
}

export interface GeneroTarjeta {
  nombre: string;
  color: string;
  tipo: string;
  genero: string;
}

export interface SagaResumen {
  id: number;
  nombre: string;
  descripcion?: string | null;
  fondo?: string | null;
  poster?: string | null;
  cantidad: number;
  anios?: string | null;
}

export interface Plataforma {
  id: string;
  nombre: string;
  color: string;
  cantidad?: number;
  descripcion?: string;
  peliculas?: number;
  series?: number;
  estrenos?: number;
  anio?: number;
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
  calidad: string | null;
  idiomas: string[];
  cache: boolean | null;
  codec: string | null;
  hdr: boolean;
  tamano: string | null;
  recomendada?: boolean;
}

const MAXIMO_INTENTOS = 5;

/**
 * Las fuentes que «Reproducir» prueba solas, en el orden que dejó el backend: sin las que el
 * navegador no abre y sin las que todavía no están listas en el servicio de descargas.
 */
export function elegirCandidatas(fuentes: Fuente[]): Fuente[] {
  return fuentes.filter((f) => f.nivel !== 'no' && f.cache !== false).slice(0, MAXIMO_INTENTOS);
}

export interface Pedido {
  titulo: Copia;
  episodio: Episodio | null;
  /** Todos los episodios de la serie, en orden (vacío en películas): de acá sale el siguiente. */
  episodios: Episodio[];
  fuente: Fuente;
  /** Las que se prueban solas, en orden, si la fuente falla. */
  alternativas: Fuente[];
  /** Elegida por «Reproducir»: si falla, pasa a la siguiente. Elegida a mano: no. */
  automatico: boolean;
  posicionMs: number;
}

/** Lo que eligió la ficha para el reproductor. */
@Injectable({ providedIn: 'root' })
export class Reproduccion {
  readonly pedido = signal<Pedido | null>(null);
}

/** Se puede continuar: vio más de 1 minuto y no terminó. */
export function sePuedeContinuar(p: Progreso) {
  return p.posicionMs >= 60000 && !terminado(p);
}

/** «quedan 55 min» o «quedan 1 h 5 min». */
export function quedan(p: Progreso): string {
  const min = Math.max(1, Math.round((p.duracionMs - p.posicionMs) / 60000));
  return 'quedan ' + (min >= 60 ? Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : '') : min + ' min');
}

/** Terminado: pasó el 95 % o quedan menos de 2 minutos, como en el resto de MaxFlix. */
export function terminado(p: Progreso) {
  return p.duracionMs > 0 && (p.posicionMs / p.duracionMs >= 0.95 || p.duracionMs - p.posicionMs <= 120000);
}
