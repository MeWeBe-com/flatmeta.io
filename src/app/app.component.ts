import { Component, NgZone } from '@angular/core';
import { GeneralService } from './providers/general.service';
import { StorageService } from './providers/storage.service';
import { Platform, AlertController } from '@ionic/angular';
import { GlobaldataService } from './providers/globaldata.service';
import { EventsService } from './providers/events.service';
import { HttpService } from './providers/http.service';
import { App } from '@capacitor/app';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {

  darkMode: boolean = false;
  profile: any = undefined;

  pages = [
    {
      title: "My Cart",
      url: 'flatmeta/cart',
      icon: 'cart-outline',
      goWithoutLogin: false,
    },
    {
      title: "My Places",
      url: 'flatmeta/myplaces',
      icon: 'cube-outline',
      goWithoutLogin: false,
    },
    {
      title: 'Recent Purchases',
      url: 'flatmeta/recentpurchases',
      icon: 'receipt-outline',
      goWithoutLogin: true,
    },
    {
      title: "Friend Requests",
      url: 'flatmeta/friendrequest',
      icon: 'people-outline',
      goWithoutLogin: false,
    },
    {
      title: "Citizen Profile",
      url: 'flatmeta/profile',
      icon: 'person-circle-outline',
      goWithoutLogin: false,
    },
    {
      title: 'Open Source & Docs',
      url: 'flatmeta/opensource',
      icon: 'code-slash-outline',
      goWithoutLogin: true,
    }
  ];

  constructor(
    public general: GeneralService,
    public alertController: AlertController,
    private platform: Platform,
    private storage: StorageService,
    public events: EventsService,
    public http: HttpService,
    private zone: NgZone
  ) {
    this.initializeApp();
    this.events.receiveLogin().subscribe((res: any) => {
      this.profile = res;
    })
  }

  initializeApp() {
    this.platform.ready().then(() => {
      this.getLoginUser();
      this.checkdarkMode();
      App.addListener('backButton', data => {
        if(data.canGoBack){
          this.zone.run(()=>{
            this.general.goToPage('flatmeta/home');
          })
        }
      });
    });
  }

  async getLoginUser() {
    let res: any = await this.storage.getObject('login_token');
    if (res != null) {
      GlobaldataService.loginToken = res;
      this.getUserDetails();
    } else {
      this.storage.removeItem('userObject');
      this.storage.removeItem('login_token');
    }
  }
  
  goTo(p){
    if(p.goWithoutLogin){
      this.general.goToPage(p.url)
    }else{
      if(this.profile != undefined){
        this.general.goToPage(p.url)
      }else{
        this.general.goToPage('flatmeta/login')
        this.general.presentToast('Please Login to continue!');
      }
    }

  }

  getUserDetails() {
    this.http.get('getuserbytoken', false).subscribe((res: any) => {
      if (res.status == true) {
        GlobaldataService.userObject = res.data;
        this.storage.setObject('userObject', res.data);
        this.events.publishLogin(res.data) 
      }
    }, (e) => {
      if(e.status == 401){
        this.general.presentToast('Please Login to Continue!')
      }
    })
  }

  checkdarkMode() {
    this.storage.getObject('darkMode').then((res) => {
      let isDark = true; // Default to dark for Cyber metaverse aesthetic
      if (res !== null && res !== undefined) {
        isDark = !!res;
      } else if (window.matchMedia) {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      this.applyTheme(isDark);
    }).catch(() => {
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
      header: 'Confirm!',
      message: 'Are you sure you want to Logout?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'secondary',
          handler: (blah) => {
          }
        }, {
          text: 'Okay',
          handler: () => {
            this.storage.clear();
            this.storage.setObject('darkMode', this.darkMode)
            GlobaldataService.clearGobal();
            this.profile = undefined;
            this.general.goToPage('flatmeta/login');
            this.general.toggleMenu();
          }
        }
      ]
    });

    await alert.present();
  }


}
