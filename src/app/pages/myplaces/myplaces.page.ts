import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonRouterOutlet, AlertController } from '@ionic/angular';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { EventsService } from 'src/app/providers/events.service';
import { MetaverseService, LandAreaGroup, PortfolioStats } from 'src/app/providers/metaverse.service';

@Component({
  selector: 'app-myplaces',
  templateUrl: './myplaces.page.html',
  styleUrls: ['./myplaces.page.scss'],
})
export class MyplacesPage implements OnInit {
  tilesList: LandAreaGroup[] = [];
  stats: PortfolioStats;

  tilePrice: number = 0.5;
  areaTitle: string = '';
  areaSlug: string = '';
  areaThreeWords: string = '';
  areaDescription: string = '';
  selectedGroup: LandAreaGroup | null = null;
  showSellModal: boolean = false;
  onSale: boolean = false;

  constructor(
    public routerOutlet: IonRouterOutlet,
    public general: GeneralService,
    public http: HttpService,
    public events: EventsService,
    public meta: MetaverseService,
    private router: Router,
    private alertController: AlertController
  ) {
    this.stats = this.meta.getPortfolioStats();
  }

  ngOnInit() {
    this.refreshPortfolio();
    this.meta.tiles$.subscribe(() => {
      this.refreshPortfolio();
    });
  }

  ionViewWillEnter() {
    this.refreshPortfolio();
    this.fetchBackendPortfolio();
  }

  refreshPortfolio() {
    this.tilesList = this.meta.getMyAreas();
    this.stats = this.meta.getPortfolioStats();
  }

  fetchBackendPortfolio() {
    this.http.get('MyPlaces', false).subscribe(
      (res: any) => {
        if (res && res.status === true && Array.isArray(res.data?.tiles)) {
          this.meta.mergeBackendTiles(res.data.tiles);
          this.refreshPortfolio();
        }
      },
      () => {}
    );
  }

  getList() {
    this.refreshPortfolio();
    this.fetchBackendPortfolio();
    this.general.presentToast('Portfolio updated');
  }

  flyToArea(c: LandAreaGroup) {
    this.router.navigate(['/']);
    setTimeout(() => {
      this.events.publishToUser({
        tile_lat: c.center_lat,
        tile_lng: c.center_lng,
        area_id: c.area_id,
      });
    }, 150);
  }

  showPriceModal(item: LandAreaGroup) {
    this.selectedGroup = item;
    this.tilePrice = item.sale_price || 0.5;
    this.onSale = item.on_sale;
    this.areaTitle = item.title || '';
    this.areaSlug = item.slug || '';
    this.areaThreeWords = item.three_words || '';
    this.areaDescription = item.description || '';
    this.showSellModal = true;
  }

  putOnSale(e: any) {
    this.onSale = e.detail.checked;
  }

  submitPrice() {
    if (!this.selectedGroup) return;
    if (this.onSale && (!this.tilePrice || this.tilePrice <= 0)) {
      this.general.presentToast('Please enter a valid asking price per square.');
      return;
    }

    const result = this.meta.updateAreaDetails(this.selectedGroup.area_id, {
      title: this.areaTitle,
      slug: this.areaSlug,
      three_words: this.areaThreeWords,
      description: this.areaDescription,
      on_sale: this.onSale,
      sale_price: Number(this.tilePrice) || 0,
    });

    if (!result.ok) {
      this.general.presentToast(result.message);
      return;
    }

    this.showSellModal = false;
    this.refreshPortfolio();
    this.general.presentToast(result.message);

    // Best-effort sync with backend if logged in
    const d = {
      order_id: this.selectedGroup.area_id,
      sale_price: this.tilePrice,
      on_sale: this.onSale,
    };
    this.http.post('UpdateSalePrice', d, false).subscribe(
      () => {},
      () => {}
    );
  }

  async releaseArea(item: LandAreaGroup) {
    const alert = await this.alertController.create({
      header: 'Release Land Area?',
      message: `Release "${item.title}" (${item.tiles.length} squares) back to the open Earth? This frees up your 100-square quota.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Release Land',
          role: 'destructive',
          handler: () => {
            const count = this.meta.releaseTiles(item.tiles.map((t) => ({ gx: t.gx, gy: t.gy })));
            this.showSellModal = false;
            this.refreshPortfolio();
            this.general.presentToast(`Released ${count} square(s).`);
          },
        },
      ],
    });
    await alert.present();
  }
}
