import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ QUESTION — À quoi sert un intercepteur HTTP ?                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Il centralise tout ce qui est TRANSVERSE aux appels : ajouter le jeton,
 * gérer les 401, journaliser, afficher un loader global. C'est le pendant
 * Angular du filtre Spring Security côté backend.
 *
 * Sans lui, il faudrait répéter l'en-tête Authorization dans chaque service.
 *
 * FORME FONCTIONNELLE (Angular 15+) : `HttpInterceptorFn` remplace la classe
 * implémentant HttpInterceptor. Plus concis, testable comme une simple
 * fonction, et compatible avec les applications standalone.
 *
 * Point important : la requête est IMMUABLE. On ne modifie pas `req`,
 * on en produit un clone.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();

  // On n'ajoute pas le jeton sur les routes publiques d'authentification
  const routePublique = req.url.includes('/api/auth/');

  if (!token || routePublique) {
    return next(req);
  }

  const requeteAuthentifiee = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  });

  return next(requeteAuthentifiee);
};
