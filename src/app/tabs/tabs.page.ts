import { Component } from '@angular/core';
import { GeneralService } from '../providers/general.service';
import { EventsService } from '../providers/events.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss']
})
export class TabsPage {

  constructor(
    private router: Router,
    public general: GeneralService,
    public events: EventsService
  ) { }

  goToMap() {
    this.router.navigateByUrl('/');
  }

  goToFlatMetaHome() {
    this.router.navigateByUrl('/home').then(() => {
      setTimeout(() => {
        this.events.publishToHome(true);
      }, 60);
    });
  }
}
