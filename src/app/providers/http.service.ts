import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GeneralService } from './general.service';
import { GlobaldataService } from './globaldata.service';
import { StorageService } from './storage.service';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class HttpService {

  constructor(
    private http: HttpClient,
    public general: GeneralService,
    public storage: StorageService
  ) {}

  post(link: string, data: any, loader: boolean): Observable<any> {
    if (loader) {
      this.general.presentLoading();
    }
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (GlobaldataService.loginToken || ''),
      'Accept': 'application/json'
    };

    return this.http.post(this.general.globalUrl + link, JSON.stringify(data), { headers: headers });
  }

  post2(link: string, data: any, loader: boolean): Observable<any> {
    if (loader) {
      this.general.presentLoading();
    }
    const headers = { 
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    return this.http.post(this.general.globalUrl + link, JSON.stringify(data), { headers: headers });
  }

  get(link: string, loader: boolean): Observable<any> {
    if (loader) {
      this.general.presentLoading();
    }
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (GlobaldataService.loginToken || ''),
      'Accept': 'application/json'
    };

    return this.http.get(this.general.globalUrl + link, { headers: headers });
  }

  get2(link: string, loader: boolean): Observable<any> {
    if (loader) {
      this.general.presentLoading();
    }
    const headers = { 
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    return this.http.get(this.general.globalUrl + link, { headers: headers });
  }

  uploadImages(fileToUpload: File, url: string): Observable<any> {
    const formData = new FormData();
    formData.append('images', fileToUpload);
    const headers = {
      'Authorization': 'Bearer ' + (GlobaldataService.loginToken || ''),
      'Accept': 'application/json'
    };
    return this.http.post(this.general.globalUrl + url, formData, { headers: headers });
  }

}