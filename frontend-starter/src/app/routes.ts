import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';

// loadComponent: each page is its own JS chunk, downloaded only when the route is visited.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tracks' },
  {
    path: 'login',
    loadComponent: () => import('./components/login-page/login-page').then((m) => m.LoginPageComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./components/register-page/register-page').then((m) => m.RegisterPageComponent),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./components/profile-page/profile-page').then((m) => m.ProfilePageComponent),
  },
  {
    path: 'tracks',
    canActivate: [authGuard],
    loadComponent: () => import('./components/tracks-page/tracks-page').then((m) => m.TracksPageComponent),
  },
  { path: '**', redirectTo: 'tracks' },
];
