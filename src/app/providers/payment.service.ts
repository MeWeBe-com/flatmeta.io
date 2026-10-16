import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { InAppBrowser } from '@awesome-cordova-plugins/in-app-browser/ngx';
import { LandService } from './land.service';

/**
 * Opens a PayPal checkout link from the API. On the web it is a normal
 * redirect (PayPal returns to /thankyou); in the phone app it opens in an
 * in-app browser and comes back to the thank-you page when PayPal is done.
 */
@Injectable({ providedIn: 'root' })
export class PaymentService {
  constructor(private iab: InAppBrowser, private router: Router, private zone: NgZone, private land: LandService) {}

  open(url: string) {
    if (!/^https?:\/\//i.test(url || '')) return;
    if (!Capacitor.isNativePlatform()) {
      window.location.href = url;
      return;
    }
    const browser = this.iab.create(url, '_blank', { location: 'no', toolbar: 'yes', zoom: 'no', hardwareback: 'yes' });
    const finish = (path: string) =>
      this.zone.run(() => {
        browser.close();
        this.land.refresh();
        this.router.navigateByUrl(path);
      });
    browser.on('loadstart').subscribe((ev) => {
      if (/\/thankyou\b/i.test(ev.url)) finish('/thankyou');
      else if (/TransactionCancel/i.test(ev.url)) finish('/myplaces');
    });
  }
}
