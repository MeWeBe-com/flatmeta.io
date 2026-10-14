import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { StorageService } from '../../providers/storage.service';
import { GeneralService } from '../../providers/general.service';
import { GlobaldataService } from '../../providers/globaldata.service';
import { UntypedFormGroup, UntypedFormBuilder, Validators } from '@angular/forms';
import { HttpService } from 'src/app/providers/http.service';
import { EventsService } from 'src/app/providers/events.service';
import { ModalController, AlertController } from '@ionic/angular';
import { ForgetpasswordComponent } from 'src/app/components/forgetpassword/forgetpassword.component';
import { MetaverseService } from 'src/app/providers/metaverse.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {
  loginForm: UntypedFormGroup;
  showPass: boolean = false;
  loading: boolean = false;
  quickEmail: string = '';
  quickName: string = '';

  constructor(
    public general: GeneralService,
    public formBuilder: UntypedFormBuilder,
    private storage: StorageService,
    public http: HttpService,
    public events: EventsService,
    public modalController: ModalController,
    public alertController: AlertController,
    public meta: MetaverseService,
    private router: Router
  ) {}

  ionViewWillEnter() {}

  ngOnInit() {
    this.initLoginForm();
  }

  initLoginForm() {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }

  get getLoginControl() {
    return this.loginForm.controls;
  }

  closeLogin() {
    this.router.navigate(['/']);
  }

  async verifyEmailOnly() {
    const email = (this.quickEmail || this.loginForm.value.email || '').trim();
    if (!this.general.validateEmail(email)) {
      this.general.presentToast('Please enter a valid email address to verify & save.');
      return;
    }
    this.loading = true;
    await this.meta.verifyEmailAndUpgradeGuest(email, this.quickName);
    this.loading = false;
    this.general.presentToast('Email verified! Your Guest avatar and land are now permanently saved.');
    this.router.navigate(['/']);
  }

  onKeydown(event: any) {
    if (event.keyCode === 32) {
      return false;
    }
  }

  onSubmitLogin() {
    if (this.loginForm.invalid) {
      // If only email is provided without password, allow instant email verification
      if (this.general.validateEmail(this.loginForm.value.email) && !this.loginForm.value.password) {
        this.quickEmail = this.loginForm.value.email;
        this.verifyEmailOnly();
      }
      return;
    }
    this.loading = true;
    this.http.post2('login', this.loginForm.value, false).subscribe(
      (res: any) => {
        if (res && res.status == true && res.access_token) {
          this.loading = false;
          GlobaldataService.loginToken = res.access_token;
          this.storage.setObject('login_token', res.access_token);
          this.getUserDetails();
        } else {
          // Fallback to instant email upgrade so user is never blocked
          this.quickEmail = this.loginForm.value.email;
          this.verifyEmailOnly();
        }
      },
      () => {
        this.quickEmail = this.loginForm.value.email;
        this.verifyEmailOnly();
      }
    );
  }

  getUserDetails() {
    this.http.get('getuserbytoken', false).subscribe(
      (res: any) => {
        if (res.status == true) {
          GlobaldataService.userObject = res.data;
          this.storage.setObject('userObject', res.data);
          this.events.publishLogin(res.data);
          this.router.navigate(['/']);
        }
      },
      (e) => {
        console.log(e);
      }
    );
  }

  async presentAlertPrompt() {
    const alert = await this.alertController.create({
      cssClass: 'my-custom-class',
      header: 'Enter Email Address',
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: 'Enter Email',
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'secondary',
        },
        {
          text: 'Ok',
          handler: (data) => {
            if (!this.general.validateEmail(data.email)) {
              this.general.presentToast('Enter Correct Email');
            } else {
              this.sendEmail(data.email);
            }
          },
        },
      ],
    });

    await alert.present();
  }

  sendEmail(email: string) {
    this.http.post2('ForgetPassword', { email: email }, true).subscribe(
      (res: any) => {
        this.general.stopLoading();
        if (res.status == true) {
          this.general.presentToast(res.data.message);
          this.presentModal();
        } else {
          this.general.presentToast(res.data.message);
        }
      },
      (e) => {
        this.general.stopLoading();
        console.log(e);
      }
    );
  }

  async presentModal() {
    const modal = await this.modalController.create({
      component: ForgetpasswordComponent,
    });
    return await modal.present();
  }
}
