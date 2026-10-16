import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { distinctUntilChanged, map, skip } from 'rxjs/operators';
import { GeneralService } from 'src/app/providers/general.service';
import { EventsService } from 'src/app/providers/events.service';
import { LandArea, LandService, PLATFORM_COMMISSION_RATE } from 'src/app/providers/land.service';
import { SessionService } from 'src/app/providers/session.service';
import { PaymentService } from 'src/app/providers/payment.service';

type Filter = 'recent' | 'popular' | 'promoted';

@Component({
  selector: 'app-salelist',
  templateUrl: './salelist.page.html',
  styleUrls: ['./salelist.page.scss'],
})
export class SalelistPage implements OnInit, OnDestroy {
  listings: LandArea[] = [];
  filter: Filter = 'recent';
  busyId = '';
  private subs = new Subscription();

  constructor(
    public general: GeneralService,
    private events: EventsService,
    private land: LandService,
    private session: SessionService,
    private payments: PaymentService,
    private router: Router,
    private alerts: AlertController
  ) {}

  ngOnInit() {
    // Re-mark my own listings when I sign in or out.
    this.subs.add(this.session.identity$.pipe(map((i) => i.id), distinctUntilChanged(), skip(1)).subscribe(() => this.load()));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  ionViewWillEnter() {
    this.load();
  }

  setFilter(f: Filter) {
    this.filter = f;
    this.load();
  }

  refresh() {
    this.load();
    this.general.presentToast('Refreshing the marketplace…', 1200);
  }

  /** Plain-text preview of the seller's description. */
  summary(area: LandArea): string {
    const div = document.createElement('div');
    div.innerHTML = area.custom_details || '';
    const text = (div.textContent || '').replace(/\s+/g, ' ').trim();
    return text.length > 140 ? text.slice(0, 137) + '…' : text;
  }

  showOnMap(area: LandArea) {
    this.router.navigateByUrl('/').then(() => setTimeout(() => this.events.publishToUser(area), 150));
  }

  async buy(area: LandArea) {
    if (area.is_mine) return;
    if (this.session.isGuest) {
      this.session.requestAuth('Verify your email to buy land.');
      return;
    }
    const total = area.total_sale_value.toFixed(2);
    const alert = await this.alerts.create({
      header: `Buy "${area.title}"?`,
      subHeader: `${area.no_of_tiles} squares from @${area.username} · $${total}`,
      message: `You'll pay with PayPal. The land becomes yours as soon as payment completes. FlatMeta keeps ${PLATFORM_COMMISSION_RATE * 100}% of the price.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: `Continue to PayPal`, handler: () => this.startPurchase(area) },
      ],
    });
    await alert.present();
  }

  private async startPurchase(area: LandArea) {
    this.busyId = area.order_id;
    const res = await this.land.buy(area.order_id);
    this.busyId = '';
    if (res.ok && res.paymentUrl) {
      this.payments.open(res.paymentUrl);
    } else {
      this.general.presentToast(res.message);
    }
  }

  private async load() {
    const filter = this.filter;
    const list = await this.land.marketplace(filter);
    if (filter !== this.filter) return;
    if (list) this.listings = list;
    else this.general.presentToast('Could not load the marketplace.');
  }
}
