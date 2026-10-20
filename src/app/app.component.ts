import { Component, NgZone, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AlertController, IonApp, IonButton, IonContent, IonFooter, IonIcon, IonList, IonMenu, IonRouterOutlet, IonSpinner, IonSplitPane, IonToggle, MenuController, Platform } from '@ionic/angular';
import { App } from '@capacitor/app';
import { GeneralService } from './providers/general.service';
import { SessionService, Identity } from './providers/session.service';
import { LandService, PortfolioStats, FREE_TILE_QUOTA } from './providers/land.service';
import { SettingsService } from './providers/settings.service';
import { FriendsService } from './providers/friends.service';
import { PaymentService } from './providers/payment.service';

@Component({
    selector: 'app-root',
    templateUrl: 'app.component.html',
    styleUrls: ['app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [CommonModule, FormsModule, RouterLink, IonApp, IonButton, IonContent, IonFooter, IonIcon, IonList, IonMenu, IonRouterOutlet, IonSpinner, IonSplitPane, IonToggle],
})
export class AppComponent {
  readonly FREE_TILE_QUOTA = FREE_TILE_QUOTA;
  me: Identity;
  stats: PortfolioStats;
  darkMode = true;

  // Small closable sign-in popup (the bottom menu always stays visible)
  showAuth = false;
  authMode: 'email' | 'password' = 'email';
  authReason = '';
  email = '';
  username = '';
  code = '';
  codeSent = false;
  password = '';
  authBusy = false;
  authError = '';

  pages = [
    { title: 'My land', url: 'myplaces', icon: 'cube-outline' },
    { title: 'Avatar & profile', url: 'profile', icon: 'person-circle-outline' },
    { title: 'Marketplace (on sale)', url: 'salelist', icon: 'pricetag-outline' },
    { title: 'Latest land', url: 'recentpurchases', icon: 'time-outline' },
    { title: 'Connections', url: 'friendrequest', icon: 'people-outline' },
    { title: 'Open source & community', url: 'opensource', icon: 'code-slash-outline' },
  ];

  constructor(
    private platform: Platform,
    private zone: NgZone,
    private alerts: AlertController,
    private menu: MenuController,
    public general: GeneralService,
    public session: SessionService,
    public land: LandService,
    public friends: FriendsService,
    private settings: SettingsService,
    private payments: PaymentService
  ) {
    this.me = session.identity;
    this.stats = land.stats$.value;
    session.identity$.subscribe((id) => (this.me = id));
    land.stats$.subscribe((s) => (this.stats = s));
    session.authRequested$.subscribe((opts) =>
      this.zone.run(() => this.openAuth(opts?.mode || 'email', opts?.reason || ''))
    );
    this.applyTheme(this.initialDarkMode());
    this.platform.ready().then(() => this.bindNativeEvents());
  }

  // ---------------------------------------------------------------------------
  // Sign in / save
  // ---------------------------------------------------------------------------

  openAuth(mode: 'email' | 'password' = 'email', reason = '') {
    this.authMode = mode;
    this.authReason = reason;
    this.authError = '';
    this.code = '';
    this.codeSent = false;
    this.username = this.me.isGuest ? '' : this.me.username;
    this.showAuth = true;
    this.menu.close();
  }

  closeAuth() {
    this.showAuth = false;
  }

  async sendCode() {
    if (!this.general.validateEmail(this.email.trim())) {
      this.authError = 'Please enter a valid email address.';
      return;
    }
    this.authBusy = true;
    this.authError = '';
    const res = await this.session.requestEmailCode(this.email);
    this.authBusy = false;
    if (res.ok) {
      this.codeSent = true;
    } else {
      this.authError = res.message;
    }
  }

  async verifyCode() {
    if (!/^\d{6}$/.test(this.code.trim())) {
      this.authError = 'Enter the 6-digit code from the email.';
      return;
    }
    this.authBusy = true;
    this.authError = '';
    const drafts = this.land.draftCount;
    const res = await this.session.verifyEmailCode(this.email, this.code, this.username);
    if (!res.ok) {
      this.authBusy = false;
      this.authError = res.message;
      return;
    }
    await this.afterSignIn(drafts > 0);
  }

  async passwordLogin() {
    if (!this.email.trim() || !this.password) {
      this.authError = 'Enter your email (or username) and password.';
      return;
    }
    this.authBusy = true;
    this.authError = '';
    const drafts = this.land.draftCount;
    const res = await this.session.loginWithPassword(this.email, this.password);
    if (!res.ok) {
      this.authBusy = false;
      this.authError = res.message;
      return;
    }
    await this.afterSignIn(drafts > 0);
  }

  private async afterSignIn(hadDrafts: boolean) {
    const saved = await this.land.saveDraftsToServer();
    this.authBusy = false;
    this.showAuth = false;
    this.password = '';
    this.code = '';
    this.general.presentToast(
      hadDrafts ? saved.message : `Welcome, ${this.me.fullname}! Your changes are now saved to your account.`,
      4000
    );
    if (saved.paymentUrl) {
      // Drafts went over the free quota: finish the PayPal subscription for the extra squares.
      this.payments.open(saved.paymentUrl);
    }
  }

  async signOut() {
    const alert = await this.alerts.create({
      header: 'Sign out?',
      message: 'You can keep exploring as a guest. Your saved land stays in your account.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Sign out',
          handler: () => {
            this.session.signOut();
            this.menu.close();
            this.general.presentToast('Signed out. You are exploring as a guest.');
          },
        },
      ],
    });
    await alert.present();
  }

  // ---------------------------------------------------------------------------
  // Navigation & theme
  // ---------------------------------------------------------------------------

  goTo(url: string) {
    this.menu.close();
    this.general.goToPage(url);
  }

  toggleTheme() {
    this.applyTheme(!this.darkMode);
    this.settings.update({ darkMode: this.darkMode });
  }

  private initialDarkMode(): boolean {
    const saved = this.settings.value.darkMode;
    if (saved !== null && saved !== undefined) return saved;
    return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true;
  }

  private applyTheme(dark: boolean) {
    this.darkMode = dark;
    document.body.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.body.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  private bindNativeEvents() {
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) this.zone.run(() => this.general.goToPage(''));
    });
    // Opening a flatmeta.io link on the phone goes straight to that place in the app.
    App.addListener('appUrlOpen', (event) =>
      this.zone.run(() => {
        try {
          const url = new URL(event.url);
          this.general.goToPage(`${url.pathname.replace(/^\/+/, '')}${url.search}`);
        } catch {}
      })
    );
  }
}
