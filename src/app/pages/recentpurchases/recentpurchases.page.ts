import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { GeneralService } from 'src/app/providers/general.service';
import { EventsService } from 'src/app/providers/events.service';
import { LandArea, LandService } from 'src/app/providers/land.service';

/** "Latest tile lands created by other users": click one to fly there. */
@Component({
    selector: 'app-recentpurchases',
    templateUrl: './recentpurchases.page.html',
    styleUrls: ['./recentpurchases.page.scss'],
    standalone: false
})
export class RecentpurchasesPage {
  areas: LandArea[] = [];

  constructor(public general: GeneralService, private events: EventsService, private land: LandService, private router: Router) {}

  ionViewWillEnter() {
    this.load();
  }

  refresh() {
    this.load();
    this.general.presentToast('Refreshing…', 1200);
  }

  private async load() {
    const list = await this.land.latest(48);
    if (list) this.areas = list.filter((a) => !a.draft && !a.official);
    else this.general.presentToast('Could not load the latest land.');
  }

  showOnMap(area: LandArea) {
    this.router.navigateByUrl('/').then(() => setTimeout(() => this.events.publishToUser(area), 150));
  }
}
