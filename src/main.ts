import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

/**
 * Amorçage d'une application STANDALONE : plus de AppModule.
 * Depuis Angular 14/15, les NgModule ne sont plus nécessaires — c'est
 * aujourd'hui l'approche recommandée par défaut.
 */
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
