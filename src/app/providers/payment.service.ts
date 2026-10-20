import { Injectable, NgZone } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { LandService } from './land.service';

/**
 * Opens a PayPal checkout link from the API. On the web it is a normal
 * redirect (PayPal returns to /thankyou). In the phone apps it opens in the
 * system's in-app browser sheet; PayPal's thank-you page shows there, and when
 * the sheet is closed the app reloads the user's land.
 */
@Injectable({ providedIn: 'root' })
export class PaymentService {
  private listening = false;

  constructor(private zone: NgZone, private land: LandService) {}

  async open(url: string) {
    if (!/^https:\/\//i.test(url || '')) return;
    if (!Capacitor.isNativePlatform()) {
      window.location.href = url;
      return;
    }
    if (!this.listening) {
      this.listening = true;
      await Browser.addListener('browserFinished', () =>
        this.zone.run(() => {
          this.land.refresh();
          this.land.refreshMine();
        })
      );
    }
    await Browser.open({ url, presentationStyle: 'popover' });
  }
}
