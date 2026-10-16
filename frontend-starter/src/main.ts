import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient, withInterceptors, withXhr } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { AppComponent } from './app/components/app/app';
import { routes } from './app/routes';
import { authInterceptor } from './app/shared/interceptors/auth.interceptor';
import { errorInterceptor } from './app/shared/interceptors/error.interceptor';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { FrenchPaginatorIntl } from './app/shared/i18n/paginator-intl';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    // XHR plutôt que fetch, seul backend qui remonte la progression de l'upload
    provideHttpClient(withXhr(), withInterceptors([authInterceptor, errorInterceptor])),
    { provide: MatPaginatorIntl, useClass: FrenchPaginatorIntl },
  ],
}).catch(console.error);
