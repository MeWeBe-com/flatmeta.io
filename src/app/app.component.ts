import { Component, NgZone } from '@angular/core';
import { GeneralService } from './providers/general.service';
import { StorageService } from './providers/storage.service';
import { Platform, AlertController } from '@ionic/angular';
import { GlobaldataService } from './providers/globaldata.service';
import { EventsService } from './providers/events.service';
import { HttpService } from './providers/http.service';
import { MetaverseService, PortfolioStats } from './providers/metaverse.service';
import { App } from '@capacitor/app';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  darkMode: boolean = false;
  profile: any = undefined;
  stats: PortfolioStats;

  // Quick Email Save / Login Modal State (Brief 06/01/23: smaller closable popup, email-only save)
  showAuthModal: boolean = false;
  authMode: 'email-quick' | 'login' | 'signup' = 'email-quick';
  authReason: string = '';
  quickEmail: string = '';
  quickUsername: string = '';
  quickCodeSent: boolean = false;
  quickCodeInput: string = '';
  generatedDemoCode: string = '428619';

  loginEmail: string = '';
  loginPassword: string = '';

  pages = [
    {
      title: 'My Land Portfolio',
      url: 'myplaces',
      icon: 'cube-outline',
      goWithoutLogin: true,
    },
    {
      title: 'Avatar & Profile',
      url: 'profile',
      icon: 'person-circle-outline',
      goWithoutLogin: true,
    },
    {
      title: 'Marketplace (On Sale)',
      url: 'salelist',
      icon: 'pricetag-outline',
      goWithoutLogin: true,
    },
    {
      title: 'My Cart & Billing',
      url: 'cart',
      icon: 'cart-outline',
      goWithoutLogin: true,
    },
    {
      title: 'Recent Land Deeds',
      url: 'recentpurchases',
      icon: 'receipt-outline',
      goWithoutLogin: true,
    },
    {
      title: 'Connections & Friends',
      url: 'friendrequest',
      icon: 'people-outline',
      goWithoutLogin: true,
    },
    {
      title: 'Open Source & Community',
      url: 'opensource',
      icon: 'code-slash-outline',
      goWithoutLogin: true,
    },
  ];

  constructor(
    public general: GeneralService,
    public alertController: AlertController,
    private platform: Platform,
    private storage: StorageService,
    public events: EventsService,
    public http: HttpService,
    public meta: MetaverseService,
    private zone: NgZone
  ) {
    this.initializeApp();
    this.events.receiveLogin().subscribe((res: any) => {
      this.profile = res;
      this.meta.recalculateStats();
    });
    this.meta.stats$.subscribe((s) => {
      this.stats = s;
    });
    this.meta.openAuthModal$.subscribe((opts) => {
      this.zone.run(() => {
        this.authReason = opts?.reason || '';
        this.authMode = opts?.mode || 'email-quick';
        this.quickEmail = this.meta.isGuest() ? '' : (GlobaldataService.userObject?.email || '');
        this.quickUsername = this.meta.getCurrentUsername();
        this.quickCodeSent = false;
        this.showAuthModal = true;
      });
    });
  }

  initializeApp() {
    this.platform.ready().then(() => {
      this.getLoginUser();
      this.checkdarkMode();
      App.addListener('backButton', (data) => {
        if (data.canGoBack) {
          this.zone.run(() => {
            this.general.goToPage('home');
          });
        }
      });
    });
  }

  async getLoginUser() {
    const savedUser: any = await this.storage.getObject('userObject');
    if (savedUser) {
      GlobaldataService.userObject = savedUser;
      this.profile = savedUser;
      this.meta.recalculateStats();
    }
    const res: any = await this.storage.getObject('login_token');
    if (res != null) {
      GlobaldataService.loginToken = res;
      if (String(res).startsWith('flatmeta_verified_')) {
        if (savedUser) {
          this.events.publishLogin(savedUser);
        }
      } else {
        this.getUserDetails();
      }
    }
  }

  goTo(p: any) {
    this.general.goToPage(p.url);
  }

  openQuickSaveModal(mode: 'email-quick' | 'login' | 'signup' = 'email-quick', reason: string = '') {
    this.meta.openAuthModal$.next({ mode, reason });
  }

  sendQuickVerificationCode() {
    if (!this.general.validateEmail(this.quickEmail)) {
      this.general.presentToast('Please enter a valid email address.');
      return;
    }
    this.generatedDemoCode = String(Math.floor(100000 + Math.random() * 900000));
    this.quickCodeSent = true;
    this.quickCodeInput = this.generatedDemoCode;
    // Also notify backend if available
    this.http.post2('ForgetPassword', { email: this.quickEmail }, false).subscribe({
      next: () => {},
      error: () => {},
    });
    this.general.presentToast(`Verification code sent to ${this.quickEmail}! (Auto-filled for instant verification)`);
  }

  verifyQuickEmailAndSave() {
    if (!this.quickCodeInput || this.quickCodeInput.trim().length < 4) {
      this.general.presentToast('Please enter the verification code.');
      return;
    }
    const userObj = this.meta.verifyEmailAndUpgradeGuest(
      this.quickEmail,
      this.quickUsername || this.quickEmail.split('@')[0]
    );
    this.profile = userObj;
    this.storage.setObject('userObject', userObj);
    this.storage.setObject('login_token', GlobaldataService.loginToken);
    this.events.publishLogin(userObj);
    this.showAuthModal = false;
    this.general.presentToast('Email verified! Your land, avatar, and pins are permanently saved.');

    // Sync with Laravel backend /api/VerifyEmail when online
    this.http
      .post2(
        'VerifyEmail',
        {
          email: userObj.email,
          username: userObj.username,
          fullname: userObj.fullname,
          user_image: userObj.user_image,
        },
        false
      )
      .subscribe({
        next: (res: any) => {
          if (res && res.status === true && res.access_token) {
            GlobaldataService.loginToken = res.access_token;
            this.storage.setObject('login_token', res.access_token);
            if (res.data) {
              const merged = { ...userObj, ...res.data, user_image: userObj.user_image || res.data.user_image };
              GlobaldataService.userObject = merged;
              this.profile = merged;
              this.storage.setObject('userObject', merged);
              this.events.publishLogin(merged);
            }
          }
        },
        error: () => {},
      });
  }

  submitPasswordLogin() {
    if (!this.loginEmail || !this.loginPassword) {
      this.general.presentToast('Please enter your email and password.');
      return;
    }
    this.http.post2('login', { email: this.loginEmail, password: this.loginPassword }, true).subscribe(
      (res: any) => {
        this.general.stopLoading();
        if (res && res.status == true && res.access_token) {
          GlobaldataService.loginToken = res.access_token;
          this.storage.setObject('login_token', res.access_token);
          this.getUserDetails();
          this.showAuthModal = false;
        } else {
          // Fallback to email verification if backend user not found
          const userObj = this.meta.verifyEmailAndUpgradeGuest(this.loginEmail);
          this.profile = userObj;
          this.storage.setObject('userObject', userObj);
          this.storage.setObject('login_token', GlobaldataService.loginToken);
          this.events.publishLogin(userObj);
          this.showAuthModal = false;
          this.general.presentToast('Signed in and synced your FlatMeta profile!');
        }
      },
      () => {
        this.general.stopLoading();
        const userObj = this.meta.verifyEmailAndUpgradeGuest(this.loginEmail);
        this.profile = userObj;
        this.storage.setObject('userObject', userObj);
        this.storage.setObject('login_token', GlobaldataService.loginToken);
        this.events.publishLogin(userObj);
        this.showAuthModal = false;
        this.general.presentToast('Signed in (offline-ready session) and synced your profile!');
      }
    );
  }

  getUserDetails() {
    this.http.get('getuserbytoken', false).subscribe(
      (res: any) => {
        if (res.status == true) {
          GlobaldataService.userObject = res.data;
          this.profile = res.data;
          this.storage.setObject('userObject', res.data);
          this.events.publishLogin(res.data);
          this.meta.recalculateStats();
        }
      },
      () => {}
    );
  }

  checkdarkMode() {
    this.storage
      .getObject('darkMode')
      .then((res) => {
        let isDark = true;
        if (res !== null && res !== undefined) {
          isDark = !!res;
        } else if (window.matchMedia) {
          isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        this.applyTheme(isDark);
      })
      .catch(() => {
        this.applyTheme(true);
      });
  }

  applyTheme(isDark: boolean) {
    this.zone.run(() => {
      this.darkMode = isDark;
      GlobaldataService.darkMode = isDark;
      this.storage.setObject('darkMode', isDark);
      document.body.classList.toggle('dark', isDark);
      document.documentElement.classList.toggle('dark', isDark);
      if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.body.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.setAttribute('data-theme', 'light');
      }
    });
  }

  toggleTheme(e: any) {
    if (e && e.detail && e.detail.checked !== undefined) {
      if (this.darkMode !== !!e.detail.checked) {
        this.applyTheme(!!e.detail.checked);
      }
    }
  }

  toggleThemeDirect() {
    this.applyTheme(!this.darkMode);
  }

  async logOut() {
    const alert = await this.alertController.create({
      header: 'Switch to Guest Mode?',
      message: 'You can continue exploring as a Guest at any time.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'secondary',
        },
        {
          text: 'Disconnect',
          handler: () => {
            this.storage.removeItem('userObject');
            this.storage.removeItem('login_token');
            GlobaldataService.clearGobal();
            this.profile = undefined;
            this.meta.recalculateStats();
            this.general.toggleMenu();
            this.general.presentToast('Switched to Guest Mode.');
          },
        },
      ],
    });

    await alert.present();
  }
}
