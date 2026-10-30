import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BaseRouteReuseStrategy, ActivatedRouteSnapshot, provideRouter, RouteReuseStrategy, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { agregarToken } from './sesion';

/** Si cambian los parámetros (de una ficha a otra), la pantalla se arma de nuevo. */
class ReusarSoloIguales extends BaseRouteReuseStrategy {
  override shouldReuseRoute(futura: ActivatedRouteSnapshot, actual: ActivatedRouteSnapshot) {
    return super.shouldReuseRoute(futura, actual) && JSON.stringify(futura.params) === JSON.stringify(actual.params);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    { provide: RouteReuseStrategy, useClass: ReusarSoloIguales },
    provideHttpClient(withInterceptors([agregarToken])),
  ],
};
