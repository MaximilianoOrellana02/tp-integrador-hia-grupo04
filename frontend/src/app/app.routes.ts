import { Routes } from '@angular/router';
import { conSesion } from './sesion';

export const routes: Routes = [
  { path: 'entrar', loadComponent: () => import('./entrar').then((m) => m.Entrar) },
  { path: 'perfiles', canActivate: [conSesion], loadComponent: () => import('./perfiles').then((m) => m.Perfiles) },
  { path: 'buscar', canActivate: [conSesion], loadComponent: () => import('./buscar').then((m) => m.Buscar) },
  { path: 'ajustes', canActivate: [conSesion], loadComponent: () => import('./ajustes').then((m) => m.Ajustes) },
  { path: 'titulo/:tipo/:id', canActivate: [conSesion], loadComponent: () => import('./ficha').then((m) => m.Ficha) },
  { path: 'reproducir', canActivate: [conSesion], loadComponent: () => import('./reproductor').then((m) => m.Reproductor) },
  { path: '', pathMatch: 'full', canActivate: [conSesion], loadComponent: () => import('./inicio').then((m) => m.Inicio) },
  { path: '**', redirectTo: '' },
];
