import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export interface Perfil {
  id: number;
  nombre: string;
  avatar: string;
  avatarUrl?: string | null;
  idiomasAudio?: string[];
  calidadMaxima?: string;
}

const CLAVE_TOKEN = 'maxflix.token';
const CLAVE_PERFIL = 'maxflix.perfil';

/** El token y el perfil elegido, guardados en el navegador. Nunca la contraseña. */
@Injectable({ providedIn: 'root' })
export class Sesion {
  readonly token = signal(localStorage.getItem(CLAVE_TOKEN));
  readonly perfil = signal<Perfil | null>(JSON.parse(localStorage.getItem(CLAVE_PERFIL) ?? 'null'));

  iniciar(token: string) {
    localStorage.setItem(CLAVE_TOKEN, token);
    this.token.set(token);
  }

  elegirPerfil(perfil: Perfil) {
    localStorage.setItem(CLAVE_PERFIL, JSON.stringify(perfil));
    this.perfil.set(perfil);
  }

  /** El perfil elegido cambió en el backend (nombre, avatar o preferencias). */
  actualizarPerfil(perfil: Perfil) {
    if (this.perfil()?.id === perfil.id) this.elegirPerfil(perfil);
  }

  olvidarPerfil() {
    localStorage.removeItem(CLAVE_PERFIL);
    this.perfil.set(null);
  }

  cerrar() {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_PERFIL);
    this.token.set(null);
    this.perfil.set(null);
  }
}

/** Suma el token a los pedidos a la API. Un 401 significa que la sesión venció: vuelve a entrar. */
export const agregarToken: HttpInterceptorFn = (pedido, siguiente) => {
  const sesion = inject(Sesion);
  const router = inject(Router);
  const token = sesion.token();
  // Solo a nuestra API: el token nunca viaja a servicios externos
  const conToken = token && pedido.url.startsWith('/api/') ? pedido.clone({ setHeaders: { Authorization: 'Bearer ' + token } }) : pedido;
  return siguiente(conToken).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && token && pedido.url.startsWith('/api/')) {
        sesion.cerrar();
        router.navigateByUrl('/entrar');
      }
      return throwError(() => error);
    }),
  );
};

export const conSesion: CanActivateFn = () =>
  inject(Sesion).token() ? true : inject(Router).createUrlTree(['/entrar']);
