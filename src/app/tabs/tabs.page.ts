import { Component } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { GeneralService } from '../providers/general.service';
import { EventsService } from '../providers/events.service';

const NON_MAP_PAGES = /^\/(myplaces|salelist|profile|friendrequest|thankyou|opensource|recentpurchases)(\/|\?|$)/;

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
})
export class TabsPage {
  onMap = true;

  constructor(private router: Router, public general: GeneralService, private events: EventsService) {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.onMap = !NON_MAP_PAGES.test(this.router.url);
    });
  }

  goToMap() {
    if (!this.onMap) this.router.navigateByUrl('/');
  }

  /** FlatMeta Home: our welcome plaza on the map. */
  goToFlatMetaHome() {
    if (this.onMap) {
      this.events.publishToHome(true);
    } else {
      this.router.navigateByUrl('/home');
    }
  }
}
