import { Component, OnInit } from '@angular/core';
import { StorageService } from 'src/app/providers/storage.service';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { EventsService } from 'src/app/providers/events.service';
import { GlobaldataService } from 'src/app/providers/globaldata.service';
import { MetaverseService } from 'src/app/providers/metaverse.service';
import { UntypedFormGroup, UntypedFormBuilder, Validators } from '@angular/forms';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
})
export class SignupPage implements OnInit {
  signupForm: UntypedFormGroup;
  showPass: boolean = false;

  constructor(
    public general: GeneralService,
    public http: HttpService,
    public events: EventsService,
    public meta: MetaverseService,
    public formBuilder: UntypedFormBuilder,
    private storage: StorageService
  ) {}

  ngOnInit() {
    this.initSignupForm();
  }

  initSignupForm() {
    const identity = this.meta.getCurrentIdentity();
    this.signupForm = this.formBuilder.group({
      fullname: [identity.is_guest ? '' : identity.fullname, []],
      username: [identity.is_guest ? '' : identity.username, []],
      email: [identity.email || '', [Validators.required, Validators.email]],
      password: ['', []],
      confirm_password: ['', []],
    });
  }

  get getControl() {
    return this.signupForm.controls;
  }

  onSubmit() {
    if (this.signupForm.invalid) {
      this.general.presentToast('Please enter a valid email address to save your citizen account.');
      return;
    }

    const val = this.signupForm.value;
    if (val.password && val.password !== val.confirm_password) {
      this.general.presentToast('Passwords do not match.');
      return;
    }

    const email = val.email.trim().toLowerCase();
    const username = (val.username || email.split('@')[0]).trim();
    const fullname = (val.fullname || username).trim();

    // Immediately upgrade guest session & preserve claimed land, avatar, and pins
    const userObj = this.meta.verifyEmailAndUpgradeGuest(email, username, fullname);
    this.storage.setObject('userObject', userObj);
    this.storage.setObject('login_token', GlobaldataService.loginToken);
    this.events.publishLogin(userObj);

    const endpoint = val.password ? 'register' : 'VerifyEmail';
    const payload = val.password
      ? {
          fullname,
          username,
          email,
          password: val.password,
          user_image: userObj.user_image,
        }
      : {
          fullname,
          username,
          email,
          user_image: userObj.user_image,
        };

    this.http.post2(endpoint, payload, false).subscribe(
      (res: any) => {
        if (res && res.status == true) {
          if (res.access_token) {
            GlobaldataService.loginToken = res.access_token;
            this.storage.setObject('login_token', res.access_token);
          }
          if (res.data) {
            const merged = { ...userObj, ...res.data, user_image: userObj.user_image || res.data.user_image };
            GlobaldataService.userObject = merged;
            this.storage.setObject('userObject', merged);
            this.events.publishLogin(merged);
          }
        }
        this.general.presentToast('Citizen account saved! Your 100 free squares, avatar, and pins are registered.');
        this.general.goToPage('');
      },
      () => {
        this.general.presentToast('Citizen account saved! Your 100 free squares, avatar, and pins are registered.');
        this.general.goToPage('');
      }
    );
  }
}
