import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { EventsService } from 'src/app/providers/events.service';
import { MetaverseService, LandAreaGroup } from 'src/app/providers/metaverse.service';

@Component({
  selector: 'app-recentpurchases',
  templateUrl: './recentpurchases.page.html',
  styleUrls: ['./recentpurchases.page.scss'],
})
export class RecentpurchasesPage implements OnInit {
  tilesList: LandAreaGroup[] = [];

  constructor(
    public general: GeneralService,
    public http: HttpService,
    public events: EventsService,
    public meta: MetaverseService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadRecent();
    this.meta.tiles$.subscribe(() => {
      this.loadRecent();
    });
  }

  ionViewWillEnter() {
    this.loadRecent();
    this.fetchBackendRecent();
  }

  loadRecent() {
    this.tilesList = this.meta
      .getGroupedAreas()
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  fetchBackendRecent() {
    this.http.get('LatestPurchasedTiles', false).subscribe(
      (res: any) => {
        if (res && res.status === true && Array.isArray(res.data?.tiles)) {
          this.meta.mergeBackendTiles(res.data.tiles);
          this.loadRecent();
        }
      },
      () => {}
    );
  }

  getList() {
    this.loadRecent();
    this.fetchBackendRecent();
    this.general.presentToast('Recent activity updated');
  }

  toUserPlace(c: LandAreaGroup) {
    this.router.navigate(['/']);
    setTimeout(() => {
      this.events.publishToUser({
        tile_lat: c.center_lat,
        tile_lng: c.center_lng,
        area_id: c.area_id,
      });
    }, 150);
  }
}
