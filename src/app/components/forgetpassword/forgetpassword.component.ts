import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { GlobaldataService } from 'src/app/providers/globaldata.service';
import { UntypedFormGroup, UntypedFormBuilder, Validators, Form } from "@angular/forms";
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'app-forgetpassword',
  templateUrl: './forgetpassword.component.html',
  styleUrls: ['./forgetpassword.component.scss'],
})
export class ForgetpasswordComponent implements OnInit {

  showForm: boolean = false;
  passwordForm: UntypedFormGroup;
  appText: any = GlobaldataService.appText;
  showPass: boolean = false;

  @ViewChild('inputOne') ionInputOne;
  @ViewChild('inputTwo') ionInputTwo;
  @ViewChild('inputThree') ionInputThree;
  @ViewChild('inputFour') ionInputFour;

  constructor(
    public general: GeneralService,
    public http: HttpService,
    public formBuilder: UntypedFormBuilder,
    public alertController: AlertController
  ) { }

  code = {
    one: '',
    two: '',
    three: '',
    four: ''
  }

  ngOnInit() {
    this.initForm();
  }

  initForm() {
    this.passwordForm = this.formBuilder.group({
      email: '',
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(/[A-Z]/),
        Validators.pattern(/[a-z]/),
        Validators.pattern(/[0-9]/),
        Validators.pattern(/[!@#$]/),
      ]],
      confirmPassword: ['', [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(/[A-Z]/),
        Validators.pattern(/[a-z]/),
        Validators.pattern(/[0-9]/),
        Validators.pattern(/[!@#$]/),
      ]],
    })
  }

  get getControl() {
    return this.passwordForm.controls;
  }

  change(e, i) {
    if (i == 1 && e.detail.value != '') {
      this.code.one = e.detail.value;
      this.ionInputTwo.setFocus();
    } else if (i == 2 && e.detail.value != '') {
      this.code.two = e.detail.value;
      this.ionInputThree.setFocus();
    } else if (i == 3 && e.detail.value != '') {
      this.code.three = e.detail.value;
      this.ionInputFour.setFocus();
    } else if (i == 4 && e.detail.value != '') {
      this.code.four = e.detail.value;
    }
  }

  submit() {
    let a = { verification_code: this.code.one + this.code.two + this.code.three + this.code.four };
    this.http.post2('VerifyForgetPasswordCode', a, true).subscribe((res: any) => {
      this.general.stopLoading();
      if (res.status == true) {
        this.showForm = !this.showForm;
        this.passwordForm.patchValue({
          email: res.data.email
        })
      } else {
        this.general.presentToast(res.data.message);
      }
    }, (e) => {
      this.general.stopLoading();
      console.log(e)
    })
  }

  onSubmit() {
    if (this.passwordForm.invalid || this.passwordForm.value.password != this.passwordForm.value.confirmPassword) {
      return
    }
    this.http.post2('ChangeUserPassword', this.passwordForm.value, true).subscribe((res: any) => {
      this.general.stopLoading();
      if (res.status == true) {
        this.general.presentToast(res.data.message);
        this.general.closeModal();
      } else {
        this.general.presentToast(res.data.message);
      }
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
      } else {
        this.general.presentToast(res.data.message);
      }
    }, (e) => {
      this.general.stopLoading();
      console.log(e)
    })
  }

}
