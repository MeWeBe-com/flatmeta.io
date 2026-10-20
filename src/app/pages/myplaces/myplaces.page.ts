import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AlertController, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonInput, IonModal, IonRouterLink, IonRouterOutlet, IonTextarea, IonTitle, IonToggle, IonToolbar } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { GeneralService } from 'src/app/providers/general.service';
import { EventsService } from 'src/app/providers/events.service';
import { LandArea, LandService, PortfolioStats, FREE_TILE_QUOTA, PLATFORM_COMMISSION_RATE } from 'src/app/providers/land.service';
import { SessionService } from 'src/app/providers/session.service';
import { HttpService } from 'src/app/providers/http.service';
import { PaymentService } from 'src/app/providers/payment.service';

@Component({
    selector: 'app-myplaces',
    templateUrl: './myplaces.page.html',
    styleUrls: ['./myplaces.page.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [CommonModule, FormsModule, RouterLink, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonInput, IonModal, IonRouterLink, IonTextarea, IonTitle, IonToggle, IonToolbar],
})
export class MyplacesPage implements OnInit, OnDestroy {
  readonly FREE_TILE_QUOTA = FREE_TILE_QUOTA;
  readonly COMMISSION = PLATFORM_COMMISSION_RATE;
  areas: LandArea[] = [];
  stats: PortfolioStats;

  selected: LandArea | null = null;
  form = { area_title: '', slug: '', three_words: '', custom_details: '', on_sale: false, sale_price: 1 };
  busy = false;
  payments: any[] = [];
  manageUrl = 'https://www.paypal.com/myaccount/autopay/';
  private subs = new Subscription();

  constructor(
    public routerOutlet: IonRouterOutlet,
    public general: GeneralService,
    public session: SessionService,
    private events: EventsService,
    private land: LandService,
    private router: Router,
    private alerts: AlertController,
    private http: HttpService,
    private paymentsService: PaymentService
  ) {
    this.stats = land.stats$.value;
  }

  ngOnInit() {
    this.subs.add(this.land.myAreas$.subscribe((areas) => (this.areas = areas)));
    this.subs.add(this.land.stats$.subscribe((s) => (this.stats = s)));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  ionViewWillEnter() {
    this.land.refreshMine();
    this.loadPayments();
  }

  async loadPayments() {
    if (this.session.isGuest) return;
    const res = await this.http.getAsync('MyPayments');
    if (res?.status === true) {
      this.payments = res.data?.payments || [];
      if (res.data?.manage_url) this.manageUrl = res.data.manage_url;
    }
  }

  async startBilling(area: LandArea) {
    this.busy = true;
    const res = await this.land.startBilling(area.order_id);
    this.busy = false;
    if (res.ok && res.paymentUrl) this.paymentsService.open(res.paymentUrl);
    else this.general.presentToast(res.message);
  }

  refresh() {
    this.land.refreshMine();
    this.general.presentToast('Refreshing your land…', 1200);
  }

  flyTo(area: LandArea) {
    this.router.navigateByUrl('/').then(() => setTimeout(() => this.events.publishToUser(area), 150));
  }

  manage(area: LandArea) {
    this.selected = area;
    this.form = {
      area_title: area.title,
      slug: area.slug,
      three_words: area.three_words,
      custom_details: area.custom_details,
      on_sale: area.on_sale,
      sale_price: area.sale_price || 1,
    };
  }

  async save() {
    if (!this.selected) return;
    if (this.form.on_sale && !(Number(this.form.sale_price) > 0)) {
      this.general.presentToast('Enter a price per square above $0.');
      return;
    }
    this.busy = true;
    const res = await this.land.updateDetails(this.selected.order_id, this.form);
    this.busy = false;
    this.general.presentToast(res.message);
    if (res.needsAuth) this.session.requestAuth('Verify your email to list land for sale.');
    if (res.ok) this.selected = null;
  }

  async release(area: LandArea) {
    const alert = await this.alerts.create({
      header: 'Release this land?',
      message: `"${area.title}" (${area.no_of_tiles} squares) goes back to the open map and its billing stops.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Release',
          role: 'destructive',
          handler: async () => {
            const res = await this.land.release(area.order_id);
            this.selected = null;
            this.general.presentToast(res.message);
          },
        },
      ],
    });
    await alert.present();
  }
}
