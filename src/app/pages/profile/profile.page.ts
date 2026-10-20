import { Component, ElementRef, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { Subscription } from 'rxjs';
import { AVATAR_OPTIONS, AvatarConfig, avatarDataUrl, createRandomAvatarConfig } from 'src/app/core/avatar';
import { GeneralService } from 'src/app/providers/general.service';
import { DEFAULT_CLAN, Identity, SessionService } from 'src/app/providers/session.service';
import { SettingsService, UserSettings } from 'src/app/providers/settings.service';

@Component({
    selector: 'app-profile',
    templateUrl: './profile.page.html',
    styleUrls: ['./profile.page.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ProfilePage implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput: ElementRef<HTMLInputElement>;

  readonly options = AVATAR_OPTIONS;
  readonly clans = [DEFAULT_CLAN, 'Emerald Guardians', 'Solar Pioneers', 'Royal Knights'];

  me: Identity;
  avatar: AvatarConfig;
  preview = '';
  settings: UserSettings;
  form = { fullname: '', username: '', phone: '', clan: DEFAULT_CLAN, paypal_email: '' };
  busy = false;
  private subs = new Subscription();

  constructor(public general: GeneralService, public session: SessionService, private settingsService: SettingsService) {
    this.me = session.identity;
    this.avatar = { ...this.me.avatarConfig };
    this.settings = settingsService.value;
  }

  ngOnInit() {
    this.subs.add(
      this.session.identity$.subscribe((id) => {
        this.me = id;
        this.avatar = { ...id.avatarConfig };
        this.preview = id.avatarUrl;
        this.form = { fullname: id.fullname, username: id.username, phone: id.phone, clan: id.clan, paypal_email: id.paypalEmail };
      })
    );
    this.subs.add(this.settingsService.settings$.subscribe((s) => (this.settings = s)));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  // Avatar: every change shows at once on the map and to people nearby.
  onTraitChange() {
    this.preview = avatarDataUrl(this.avatar);
    this.session.setAvatarConfig(this.avatar);
  }

  pickCircle(color: string) {
    this.avatar.circleBg = color;
    this.onTraitChange();
  }

  randomize() {
    this.avatar = { ...createRandomAvatarConfig(), customImage: undefined };
    this.onTraitChange();
  }

  choosePhoto() {
    if (this.session.isGuest) {
      this.session.requestAuth('Verify your email to use a photo as your avatar.');
      return;
    }
    this.fileInput?.nativeElement.click();
  }

  async onPhoto(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      this.general.presentToast('Use a PNG, JPG, GIF or WebP image up to 5 MB.');
      return;
    }
    this.busy = true;
    const res = await this.session.uploadAvatarPhoto(file);
    this.busy = false;
    this.general.presentToast(res.message);
  }

  removePhoto() {
    this.session.clearAvatarPhoto();
  }

  updateSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    this.settingsService.update({ [key]: value } as Partial<UserSettings>);
  }

  async save() {
    if (!this.form.fullname.trim()) {
      this.general.presentToast('Please enter a display name.');
      return;
    }
    this.busy = true;
    const res = await this.session.updateProfile(this.form);
    this.busy = false;
    this.general.presentToast(res.message);
  }
}
