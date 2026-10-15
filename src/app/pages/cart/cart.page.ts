import { Component, OnInit } from '@angular/core';
import { StorageService } from 'src/app/providers/storage.service';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { GlobaldataService } from 'src/app/providers/globaldata.service';
import { MetaverseService, PortfolioStats } from 'src/app/providers/metaverse.service';
import { InAppBrowser, InAppBrowserOptions } from '@awesome-cordova-plugins/in-app-browser/ngx';

@Component({
  selector: 'app-cart',
  templateUrl: './cart.page.html',
  styleUrls: ['./cart.page.scss'],
})
export class CartPage implements OnInit {
  cartData: any[] = [];
  stats: PortfolioStats;

  constructor(
    public storage: StorageService,
    public general: GeneralService,
    public http: HttpService,
    public meta: MetaverseService,
    private iab: InAppBrowser
  ) {
    this.stats = this.meta.getPortfolioStats();
  }

  ngOnInit() {
    this.meta.stats$.subscribe((s) => {
      this.stats = s;
    });
  }

  ionViewWillEnter() {
    this.stats = this.meta.getPortfolioStats();
    this.getCart();
  }

  getCart() {
    this.http.get('GetCartByUser', false).subscribe(
      (res: any) => {
        if (res && res.status == true && Array.isArray(res.data?.tiles)) {
          this.cartData = res.data.tiles;
        }
      },
      () => {
        // Offline / Guest mode: portfolio stats & free quota are displayed
      }
    );
  }

  makeBuy() {
    if (!this.cartData || this.cartData.length === 0) {
      this.general.presentToast('No pending tiles in cart. Select squares on the map at 15x zoom to claim!');
      return;
    }

    // Claim locally via 100 Free Squares quota + $0.10/mo subscription math
    const selections = this.cartData.map((c) => {
      const lat = Number(c.lat);
      const lng = Number(c.lng);
      const { gx, gy } = this.meta.latLngToGrid(lat, lng);
      return { gx, gy, lat, lng };
    });
    const claimRes = this.meta.claimSelectedSquares(selections);

    this.http.get('BuyNow', false).subscribe(
      (res: any) => {
        if (res && res.status == true) {
          this.cartData = [];
          if (res.data?.free_claimed || !res.data?.url) {
            this.general.presentToast(res.data?.message || `Claimed ${claimRes.claimed.length} squares using your 100 Free Squares quota!`);
            this.general.goToPage('myplaces');
          } else {
            this.makePayment(res.data.url);
          }
        } else {
          this.cartData = [];
          this.general.presentToast(`Claimed ${claimRes.claimed.length} square(s)!`);
          this.general.goToPage('myplaces');
        }
      },
      () => {
        this.cartData = [];
        this.general.presentToast(
          claimRes.billableAdded === 0
            ? `Claimed ${claimRes.claimed.length} square(s) for FREE!`
            : `Claimed ${claimRes.claimed.length} square(s) ($${(claimRes.billableAdded * 0.1).toFixed(2)}/mo subscription).`
        );
        this.general.goToPage('myplaces');
      }
    );
  }

  makePayment(url: string) {
    if (!url) return;
    const options: InAppBrowserOptions = {
      zoom: 'no',
      location: 'no',
      toolbar: 'no',
      fullscreen: 'yes',
      clearcache: 'no',
      clearsessioncache: 'no',
      cleardata: 'no',
      hardwareback: 'yes',
      useWideViewPort: 'no',
      enableViewportScale: 'yes',
      presentationstyle: 'fullscreen',
    };

    const browser = this.iab.create(url, '_blank', options);
    browser.on('loadstart').subscribe(
      (res) => {
        if (res.url.includes('TransactionCompleted')) {
          setTimeout(() => {
            this.general.presentToast('Payment Successful!');
            browser.close();
            this.general.goToPage('thankyou');
          }, 250);
        }
      },
      (err) => {
        console.error(err);
      }
    );
  }

  removeFromCart() {
    this.cartData = [];
    this.http.get('RemoveUserCart', false).subscribe(
      (res: any) => {
        this.general.presentToast(res?.data?.message || 'Cart cleared.');
      },
      () => {
        this.general.presentToast('Cart cleared.');
      }
    );
  }
}
