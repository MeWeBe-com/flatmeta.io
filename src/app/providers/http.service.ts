import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, finalize, take } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { GeneralService } from './general.service';
import { SessionService } from './session.service';

/**
 * Thin wrapper around HttpClient for the FlatMeta API. Adds the bearer token,
 * optional loading spinner, and signs the user out if the token is rejected.
 */
@Injectable({ providedIn: 'root' })
export class HttpService {
  private readonly baseUrl = environment.apiUrl;

  constructor(private http: HttpClient, private general: GeneralService, private session: SessionService) {}

  get(link: string, loader = false): Observable<any> {
    return this.wrap(this.http.get(this.baseUrl + link, { headers: this.headers() }), loader);
  }

  post(link: string, data: any, loader = false): Observable<any> {
    return this.wrap(this.http.post(this.baseUrl + link, data ?? {}, { headers: this.headers(true) }), loader);
  }

  uploadImages(file: File, link: string): Observable<any> {
    const form = new FormData();
    form.append('images', file);
    return this.wrap(this.http.post(this.baseUrl + link, form, { headers: this.headers() }), false);
  }

  /** Promise helpers that never throw: failures resolve to `{ status: false, message }`. */
  async getAsync(link: string): Promise<any> {
    try {
      return await this.get(link).pipe(take(1)).toPromise();
    } catch (err: any) {
      return this.toFailure(err);
    }
  }

  async postAsync(link: string, data: any, loader = false): Promise<any> {
    try {
      return await this.post(link, data, loader).pipe(take(1)).toPromise();
    } catch (err: any) {
      return this.toFailure(err);
    }
  }

  async uploadAsync(file: File, link: string): Promise<any> {
    try {
      return await this.uploadImages(file, link).pipe(take(1)).toPromise();
    } catch (err: any) {
      return this.toFailure(err);
    }
  }

  /** @deprecated use get() — kept so older pages keep compiling. */
  get2(link: string, loader = false) {
    return this.get(link, loader);
  }

  /** @deprecated use post() — kept so older pages keep compiling. */
  post2(link: string, data: any, loader = false) {
    return this.post(link, data, loader);
  }

  private headers(json = false): HttpHeaders {
    let h = new HttpHeaders({ Accept: 'application/json' });
    if (json) h = h.set('Content-Type', 'application/json');
    const token = this.session.accessToken;
    if (token) h = h.set('Authorization', `Bearer ${token}`);
    return h;
  }

  private wrap(obs: Observable<any>, loader: boolean): Observable<any> {
    if (loader) this.general.presentLoading();
    return obs.pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401) this.session.handleUnauthorized();
        return throwError(err);
      }),
      finalize(() => {
        if (loader) this.general.stopLoading();
      })
    );
  }

  private toFailure(err: any) {
    if (err?.status === 401) {
      return { status: false, unauthorized: true, message: 'Please verify your email to continue.' };
    }
    if (err?.status === 429) {
      return { status: false, message: 'Too many requests, please slow down.' };
    }
    return { status: false, message: err?.error?.message || err?.error?.data?.message || 'Network error. Please try again.' };
  }
}
