import { Component, OnInit } from '@angular/core';
import { StorageService } from 'src/app/providers/storage.service';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { UntypedFormGroup, UntypedFormBuilder, Validators } from "@angular/forms";

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
    public formBuilder: UntypedFormBuilder,
    private storage: StorageService
  ) { }

  ngOnInit() {
    this.initSignupForm();
  }

  initSignupForm() {
    this.signupForm = this.formBuilder.group({
      fullname: ['', [Validators.required]],
      username: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email, Validators.pattern("^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,4}$")]],
      // phone_number: ['', [Validators.required]],
      // date_of_birth: ['', [Validators.required]],
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(/[A-Z]/),
        Validators.pattern(/[a-z]/),
        Validators.pattern(/[0-9]/),
        Validators.pattern(/[!@#$]/),
      ]],
      confirm_password: ['', [
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
    return this.signupForm.controls;
  }

  onSubmit() {
    if (this.signupForm.invalid) {
      return;
    }

    this.http.post2('register', this.signupForm.value, true).subscribe((res: any) => {
      this.general.stopLoading();
      if (res.status == true) {
        this.general.presentToast(res.message);
        this.general.goToPage('flatmeta/login');
      } else {
        this.general.presentToast(res.message);
      }
    },
      (e) => {
        this.general.stopLoading();
        console.log(e)
      })
  }

}
