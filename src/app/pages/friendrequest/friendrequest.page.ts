import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { EventsService } from 'src/app/providers/events.service';
import { MetaverseService } from 'src/app/providers/metaverse.service';
import { ChatComponent } from 'src/app/components/chat/chat.component';

@Component({
  selector: 'app-friendrequest',
  templateUrl: './friendrequest.page.html',
  styleUrls: ['./friendrequest.page.scss'],
})
export class FriendrequestPage implements OnInit {
  requests: any[] = [];
  citizens: Array<{
    id: string;
    fullname: string;
    username: string;
    image: string;
    bio: string;
    lat: number;
    lng: number;
    connected: boolean;
  }> = [];

  constructor(
    public general: GeneralService,
    public http: HttpService,
    public meta: MetaverseService,
    public events: EventsService,
    private router: Router,
    private modalController: ModalController,
    private routerOutlet: IonRouterOutlet
  ) {}

  ngOnInit() {
    this.buildCitizensDirectory();
  }

  ionViewWillEnter() {
    this.buildCitizensDirectory();
    this.getReqList();
  }

  buildCitizensDirectory() {
    const [baseLat, baseLng] = MetaverseService.FLATMETA_HOME_COORDS;
    this.citizens = [
      {
        id: 'citizen_aria',
        fullname: 'Aria Vance',
        username: 'aria_meta',
        image: this.meta.generateAvatarDataUrl({
          ...this.meta.createRandomAvatarConfig(),
          topType: 'LongHairCurvy',
          circleBg: '#7c3aed',
          mouthType: 'Smile',
        }),
        bio: 'Community Architect at FlatMeta Home Plaza',
        lat: baseLat + 0.00042,
        lng: baseLng + 0.00055,
        connected: this.meta.isFriend('citizen_aria'),
      },
      {
        id: 'citizen_zane',
        fullname: 'Zane Sterling',
        username: 'zane_builder',
        image: this.meta.generateAvatarDataUrl({
          ...this.meta.createRandomAvatarConfig(),
          topType: 'ShortHairShortWaved',
          accessoriesType: 'Sunglasses',
          circleBg: '#059669',
          mouthType: 'Twinkle',
        }),
        bio: 'Land Trader & Interactive Tile Creator',
        lat: baseLat - 0.00038,
        lng: baseLng + 0.00048,
        connected: this.meta.isFriend('citizen_zane'),
      },
    ];
  }

  getReqList() {
    this.http.get('GetAllFriendRequest', false).subscribe(
      (res: any) => {
        if (res && res.status == true && Array.isArray(res.data?.requests)) {
          this.requests = res.data.requests;
        }
      },
      () => {}
    );
  }

  toggleConnection(citizen: any) {
    const nowFriend = this.meta.toggleFriend(citizen.id);
    citizen.connected = nowFriend;
    this.http.post('SendFriendRequest', { follower_user_id: citizen.id }, false).subscribe({
      next: () => {},
      error: () => {},
    });
    this.general.presentToast(
      nowFriend
        ? `Connected with @${citizen.username}! You can now chat in Friends-Only mode.`
        : `Disconnected from @${citizen.username}.`
    );
  }

  async openDirectChat(citizen: any) {
    const modal = await this.modalController.create({
      component: ChatComponent,
      mode: 'ios',
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: { id: citizen.id, name: citizen.fullname },
    });
    await modal.present();
  }

  locateCitizenOnMap(citizen: any) {
    this.router.navigate(['/']);
    setTimeout(() => {
      this.events.publishToUser({
        lat: citizen.lat,
        lng: citizen.lng,
        tile_lat: citizen.lat,
        tile_lng: citizen.lng,
      });
    }, 150);
  }

  updateRequest(rid: any, status: any) {
    const d = {
      request_id: rid,
      status: status,
    };
    this.http.post('UpdateFriendRequestStatus', d, false).subscribe(
      (res: any) => {
        if (res && res.status == true) {
          this.getReqList();
          this.general.presentToast(res.data?.message || 'Connection updated');
        }
      },
      () => {}
    );
  }
}
