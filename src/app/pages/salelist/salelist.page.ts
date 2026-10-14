import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { EventsService } from 'src/app/providers/events.service';
import { GlobaldataService } from 'src/app/providers/globaldata.service';
import { MetaverseService, LandAreaGroup } from 'src/app/providers/metaverse.service';
import { InAppBrowser, InAppBrowserOptions } from '@awesome-cordova-plugins/in-app-browser/ngx';

@Component({
  selector: 'app-salelist',
  templateUrl: './salelist.page.html',
  styleUrls: ['./salelist.page.scss'],
})
export class SalelistPage implements OnInit {
  tilesList: LandAreaGroup[] = [];
  activeFilter: 'all' | 'recent' | 'popular' | 'promoted' = 'all';

  constructor(
    public general: GeneralService,
    public http: HttpService,
    public events: EventsService,
    public meta: MetaverseService,
    private router: Router,
    private alertController: AlertController,
    private iab: InAppBrowser
  ) {}

  ngOnInit() {
    this.loadListings();
    this.meta.tiles$.subscribe(() => {
      this.loadListings();
    });
  }

  ionViewWillEnter() {
    this.loadListings();
    this.fetchBackendListings();
  }

  setFilter(filter: 'all' | 'recent' | 'popular' | 'promoted') {
    this.activeFilter = filter;
    this.loadListings();
  }

  loadListings() {
    this.tilesList = this.meta.getMarketplaceAreas(this.activeFilter);
  }

  fetchBackendListings() {
    this.http.get('SaleList', false).subscribe(
      (res: any) => {
        if (res && res.status === true && Array.isArray(res.data?.tiles)) {
          this.meta.mergeBackendTiles(res.data.tiles);
          this.loadListings();
        }
      },
      () => {
        // Offline or guest mode: local marketplace listings remain active
      }
    );
  }

  getList() {
    this.loadListings();
    this.fetchBackendListings();
    this.general.presentToast('Marketplace refreshed');
  }

  toUserPlace(c: LandAreaGroup) {
    this.router.navigate(['/']);
    setTimeout(() => {
      this.events.publishToUser({
        tile_lat: c.center_lat,
        tile_lng: c.center_lng,
        area_id: c.area_id,
      });
    }, 150);
  }

  async buyListing(c: LandAreaGroup) {
    if (c.is_mine) {
      this.general.presentToast('You already own this land area!');
      return;
    }

    const totalCost = c.total_sale_value.toFixed(2);
    const fee = (c.total_sale_value * 0.1).toFixed(2);
    const alert = await this.alertController.create({
      header: `Acquire "${c.title}"`,
      subHeader: `${c.tiles.length} Squares • $${totalCost} USD`,
      message: `Seller: @${c.username}\nLocation: ${c.center_lat.toFixed(4)}, ${c.center_lng.toFixed(4)}\nIncludes 10% FlatMeta platform commission ($${fee}).\n\nTake immediate ownership and customize this area?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: `Buy Now ($${totalCost})`,
          handler: () => {
            const result = this.meta.buyMarketplaceListing(c.area_id);
            this.general.presentToast(result.message);
            if (result.ok) {
              this.loadListings();
              this.toUserPlace(c);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  makePayment(url: string) {
    if (!url) return;
    if (GlobaldataService.userObject == undefined) {
      this.general.presentToast('Please verify your email first to use external checkout.');
      return;
    }
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

    const browser = this.iab.create(url + '/' + GlobaldataService.userObject.user_id, '_blank', options);
    browser.on('loadstart').subscribe(
      (res) => {
        if (res.url.includes('flatmeta.io/TransactionCompleted')) {
          setTimeout(() => {
            this.general.presentToast('Payment Successful!');
            browser.close();
            this.general.goToPage('t/thankyou');
          }, 250);
        }
      },
      (err) => {
        console.error(err);
      }
    );
  }
}
