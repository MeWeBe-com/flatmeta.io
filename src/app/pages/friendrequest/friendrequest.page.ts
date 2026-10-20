import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GeneralService } from 'src/app/providers/general.service';
import { EventsService } from 'src/app/providers/events.service';
import { Friend, FriendRequest, FriendsService } from 'src/app/providers/friends.service';
import { Citizen, PresenceService } from 'src/app/providers/presence.service';
import { SessionService } from 'src/app/providers/session.service';

@Component({
    selector: 'app-friendrequest',
    templateUrl: './friendrequest.page.html',
    styleUrls: ['./friendrequest.page.scss'],
    standalone: false
})
export class FriendrequestPage implements OnInit, OnDestroy {
  requests: FriendRequest[] = [];
  friends: Friend[] = [];
  online: Citizen[] = [];
  private subs = new Subscription();

  constructor(
    public general: GeneralService,
    public session: SessionService,
    public friendsService: FriendsService,
    private presence: PresenceService,
    private events: EventsService,
    private router: Router
  ) {}

  ngOnInit() {
    this.subs.add(this.friendsService.requests$.subscribe((r) => (this.requests = r.filter((x) => x.status === '2'))));
    this.subs.add(this.friendsService.friends$.subscribe((f) => (this.friends = f)));
    this.subs.add(this.presence.citizens$.subscribe((c) => (this.online = c)));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  ionViewWillEnter() {
    this.friendsService.refresh();
  }

  isOnline(userId: number | string) {
    return this.online.find((c) => c.id === String(userId));
  }

  async respond(req: FriendRequest, accept: boolean) {
    const res = await this.friendsService.respond(req.request_id, accept);
    this.general.presentToast(res.message || (accept ? 'Connected.' : 'Request declined.'));
  }

  async connect(c: Citizen) {
    const res = await this.friendsService.sendRequest(c.id);
    this.general.presentToast(res.message);
    if (res.needsAuth) this.session.requestAuth('Verify your email to add connections.');
  }

  chat(person: { id: string; fullname: string; username: string; avatarUrl: string }) {
    this.presence.openDirect(person);
    this.router.navigateByUrl('/');
  }

  chatFriend(f: Friend) {
    const live = this.isOnline(f.user_id);
    this.chat({ id: String(f.user_id), fullname: f.fullname, username: f.username, avatarUrl: live?.avatarUrl || f.image });
  }

  findOnMap(c: Citizen) {
    this.router.navigateByUrl('/').then(() => setTimeout(() => this.events.publishToUser({ lat: c.lat, lng: c.lng }), 150));
  }
}
