import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GeneralService } from 'src/app/providers/general.service';
import { EventsService } from 'src/app/providers/events.service';
import { LandArea, LandService } from 'src/app/providers/land.service';

/** "Latest tile lands created by other users": click one to fly there. */
@Component({
  selector: 'app-recentpurchases',
  templateUrl: './recentpurchases.page.html',
  styleUrls: ['./recentpurchases.page.scss'],
})
export class RecentpurchasesPage implements OnInit, OnDestroy {
  areas: LandArea[] = [];
  private subs = new Subscription();

  constructor(public general: GeneralService, private events: EventsService, private land: LandService, private router: Router) {}

  ngOnInit() {
    this.subs.add(this.land.tiles$.subscribe(() => (this.areas = this.land.latest(48))));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  ionViewWillEnter() {
    this.land.refresh();
  }

  refresh() {
    this.land.refresh();
    this.general.presentToast('Refreshing…', 1200);
  }

  showOnMap(area: LandArea) {
    this.router.navigateByUrl('/').then(() => setTimeout(() => this.events.publishToUser(area), 150));
  }
}
