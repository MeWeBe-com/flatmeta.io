import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { EventsService } from 'src/app/providers/events.service';
import { StorageService } from 'src/app/providers/storage.service';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { UntypedFormGroup, UntypedFormBuilder, Validators } from '@angular/forms';
import { GlobaldataService } from 'src/app/providers/globaldata.service';
import { MetaverseService, AvatarConfig } from 'src/app/providers/metaverse.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
})
export class ProfilePage implements OnInit {
  @ViewChild('fileInput', { static: false }) fileInput: ElementRef;

  profileForm: UntypedFormGroup;
  profileImg: string = '';
  avatarConfig: AvatarConfig;

  topTypes = GlobaldataService.topType;
  accessoriesTypes = GlobaldataService.accessoriesType;
  hairColors = GlobaldataService.hairColor;
  facialHairTypes = GlobaldataService.facialHairType;
  clotheTypes = GlobaldataService.clotheType;
  eyeTypes = GlobaldataService.eyeType;
  eyebrowTypes = GlobaldataService.eyebrowType;
  mouthTypes = GlobaldataService.mouthType;
  skinColors = GlobaldataService.skinColor;
  circleBgs = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#db2777', '#d97706', '#4f46e5', '#0f172a'];

  constructor(
    public general: GeneralService,
    public http: HttpService,
    public formBuilder: UntypedFormBuilder,
    private storage: StorageService,
    public events: EventsService,
    public meta: MetaverseService
  ) {
    this.avatarConfig = this.meta.getAvatarConfig();
  }

  ngOnInit() {
    this.initSignupForm();
    this.syncCurrentIdentity();
    this.events.receiveLogin().subscribe((res: any) => {
      if (res) {
        this.syncCurrentIdentity();
      }
    });
  }

  ionViewDidEnter() {
    this.syncCurrentIdentity();
  }

  syncCurrentIdentity() {
    const identity = this.meta.getCurrentIdentity();
    this.avatarConfig = this.meta.getAvatarConfig();
    this.profileImg = identity.user_image;
    this.profileForm.patchValue({
      user_id: identity.user_id,
      fullname: identity.fullname,
      username: identity.username,
      email: identity.email || '',
      user_image: identity.user_image,
    });
  }

  initSignupForm() {
    this.profileForm = this.formBuilder.group({
      user_id: '',
      fullname: ['', [Validators.required]],
      username: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      user_image: '',
    });
  }

  get getControl() {
    return this.profileForm.controls;
  }

  onTraitChange() {
    this.meta.saveAvatarConfig(this.avatarConfig);
    this.profileImg = this.meta.getCurrentIdentity().user_image;
    this.profileForm.patchValue({ user_image: this.profileImg });
  }

  selectCircleBg(color: string) {
    this.avatarConfig.circleBg = color;
    this.onTraitChange();
  }

  generateAvatar() {
    this.avatarConfig = this.meta.randomizeAvatarConfig();
    this.meta.saveAvatarConfig(this.avatarConfig);
    this.profileImg = this.meta.getCurrentIdentity().user_image;
    this.profileForm.patchValue({ user_image: this.profileImg });
    this.general.presentToast('New random circular avatar generated!');
  }

  chooseFile() {
    this.fileInput.nativeElement.click();
  }

  choosePhoto = async (e: any) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        this.profileImg = dataUrl;
        this.profileForm.patchValue({ user_image: dataUrl });
        if (GlobaldataService.userObject) {
          GlobaldataService.userObject.user_image = dataUrl;
          this.storage.setObject('userObject', GlobaldataService.userObject);
        }
        this.meta.broadcastPresence('join');
        this.general.presentToast('Custom avatar photo applied!');
      };
      reader.readAsDataURL(file);

      // Also upload to backend if available
      this.http.uploadImages(file, 'UploadUserImage').subscribe(
        (res: any) => {
          if (res && res.status === true && res.data?.user_image) {
            this.profileImg = res.data.user_image;
            this.profileForm.patchValue({ user_image: res.data.file_name || res.data.user_image });
          }
        },
        () => {}
      );
    }
  };

  async onSubmit() {
    if (this.profileForm.invalid) {
      this.general.presentToast('Please enter your Name, Username, and valid Email.');
      return;
    }

    const val = this.profileForm.value;
    // Upgrade guest or update citizen immediately via MetaverseService
    const userObj = await this.meta.verifyEmailAndUpgradeGuest(val.email, val.fullname);
    userObj.username = val.username.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() || userObj.username;
    userObj.fullname = val.fullname;
    userObj.user_image = this.profileImg || userObj.user_image;
    GlobaldataService.userObject = userObj;
    await this.storage.setObject('userObject', userObj);
    this.events.publishLogin(userObj);
    this.general.presentToast('Citizen profile & avatar saved!');

    // Best-effort sync with backend API
    this.http.post('UpdateUser', this.profileForm.value, false).subscribe(
      () => {},
      () => {}
    );
  }
}