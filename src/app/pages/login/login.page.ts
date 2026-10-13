import { Component, OnInit } from '@angular/core';
import { MenuController } from '@ionic/angular';
import { StorageService } from '../../providers/storage.service';
import { GeneralService } from '../../providers/general.service';
import { GlobaldataService } from '../../providers/globaldata.service';
import { UntypedFormGroup, UntypedFormBuilder, Validators } from "@angular/forms";
import { HttpService } from 'src/app/providers/http.service';
import { EventsService } from 'src/app/providers/events.service';
import { ModalController } from '@ionic/angular';
import { ForgetpasswordComponent } from 'src/app/components/forgetpassword/forgetpassword.component';
import { AlertController } from '@ionic/angular';
import { App } from '@capacitor/app';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {
  loginForm: UntypedFormGroup;
  showPass: boolean = false;
  loading: boolean = false;

  constructor(
    public general: GeneralService,
    public formBuilder: UntypedFormBuilder,
    private storage: StorageService,
    public http: HttpService,
    public events: EventsService,
    public modalController: ModalController,
    public alertController: AlertController
  ) { }

  ionViewWillEnter(){
  }

  ngOnInit() {
    this.initLoginForm();
  }

  initLoginForm() {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email, Validators.pattern("^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,4}$")]],
      password: ['', [Validators.required]]
    })
  }

  get getLoginControl() {
    return this.loginForm.controls;
  }

  onKeydown(event) {
    if (event.keyCode === 32) {
      return false;
    }
  }

  onSubmitLogin() {
    if (this.loginForm.invalid) {
      return
    };
    this.loading = true;
    this.http.post2('login', this.loginForm.value, false).subscribe((res: any) => {
      if (res && res.status == true && res.access_token) {
        this.loading = false;
        GlobaldataService.loginToken = res.access_token;
        this.storage.setObject('login_token', res.access_token);
        this.getUserDetails();
      } else {
        this.loading = false;
        const msg = res?.data?.message || res?.message || 'Wrong Email or Password';
        this.general.presentToast(msg);
      }
    }, (e) => {
      this.loading = false;
      const msg = e?.error?.data?.message || e?.error?.message || 'Login failed. Please check your credentials.';
      this.general.presentToast(msg);
    })
  }

  getUserDetails() {
    this.http.get('getuserbytoken', false).subscribe((res: any) => {
      if (res.status == true) {
        GlobaldataService.userObject = res.data;
        this.storage.setObject('userObject', res.data);
        this.events.publishLogin(res.data)
        this.general.goToPage('flatmeta/home');
      }
    }, (e) => {
      console.log(e);
    })
  }

  async presentAlertPrompt() {
    const alert = await this.alertController.create({
      cssClass: 'my-custom-class',
      header: 'Enter Email Address',
      inputs: [
        {
          name: 'email',
          type: 'email',
          placeholder: 'Enter Email'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'secondary',
          handler: () => {
          }
        }, {
          text: 'Ok',
          handler: (data) => {
            if (!this.general.validateEmail(data.email)) {
              this.general.presentToast('Enter Correct Email');
            } else {
              this.sendEmail(data.email);
            }
          }
        }
      ]
    });

    await alert.present();
  }

  sendEmail(email) {
    this.http.post2('ForgetPassword', { email: email }, true).subscribe((res: any) => {     
      this.general.stopLoading();
      if (res.status == true) {
        this.general.presentToast(res.data.message);
        this.presentModal();
      } else {
        this.general.presentToast(res.data.message);
      }
    }, (e) => {
      this.general.stopLoading();
      console.log(e)
    })
  }

  async presentModal() {
    const modal = await this.modalController.create({
      component: ForgetpasswordComponent,
    });
    return await modal.present();
  }

}
