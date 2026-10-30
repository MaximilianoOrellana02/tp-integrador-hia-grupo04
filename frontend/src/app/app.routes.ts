import { Routes } from '@angular/router';
import { conSesion } from './sesion';

export const routes: Routes = [
  { path: 'entrar', loadComponent: () => import('./entrar').then((m) => m.Entrar) },
  { path: 'perfiles', canActivate: [conSesion], loadComponent: () => import('./perfiles').then((m) => m.Perfiles) },
  { path: 'buscar', canActivate: [conSesion], loadComponent: () => import('./buscar').then((m) => m.Buscar) },
  { path: 'ajustes', canActivate: [conSesion], loadComponent: () => import('./ajustes').then((m) => m.Ajustes) },
  { path: 'titulo/:tipo/:id', canActivate: [conSesion], loadComponent: () => import('./ficha').then((m) => m.Ficha) },
  { path: 'persona/:id', canActivate: [conSesion], loadComponent: () => import('./persona').then((m) => m.Persona) },
  { path: 'reproducir', canActivate: [conSesion], loadComponent: () => import('./reproductor').then((m) => m.Reproductor) },
  { path: 'peliculas', canActivate: [conSesion], data: { seccion: 'peliculas' }, loadComponent: () => import('./explorar').then((m) => m.Explorar) },
  { path: 'series', canActivate: [conSesion], data: { seccion: 'series' }, loadComponent: () => import('./explorar').then((m) => m.Explorar) },
  { path: 'saga/:id', canActivate: [conSesion], loadComponent: () => import('./saga').then((m) => m.Saga) },
  { path: 'genero/:tipo/:genero', canActivate: [conSesion], data: { seccion: 'genero' }, loadComponent: () => import('./explorar').then((m) => m.Explorar) },
  { path: 'originales/:id', canActivate: [conSesion], data: { seccion: 'originales' }, loadComponent: () => import('./explorar').then((m) => m.Explorar) },
  { path: 'marca/:id', canActivate: [conSesion], data: { seccion: 'marca' }, loadComponent: () => import('./explorar').then((m) => m.Explorar) },
  { path: 'mi-lista', canActivate: [conSesion], loadComponent: () => import('./mi-lista').then((m) => m.MiLista) },
  { path: '', pathMatch: 'full', canActivate: [conSesion], data: { seccion: 'inicio' }, loadComponent: () => import('./explorar').then((m) => m.Explorar) },
  { path: '**', redirectTo: '' },
];
