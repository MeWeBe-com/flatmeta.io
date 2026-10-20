import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LandService } from 'src/app/providers/land.service';

/**
 * PayPal returns here (via the API) after a rent subscription or a marketplace
 * purchase, with ?kind=rent|sale&status=ok|cancelled|problem&message=...
 */
@Component({
    selector: 'app-thankyou',
    templateUrl: './thankyou.page.html',
    styleUrls: ['./thankyou.page.scss'],
    standalone: false
})
export class ThankyouPage {
  kind: 'rent' | 'sale' = 'rent';
  status: 'ok' | 'cancelled' | 'problem' = 'ok';
  message = '';

  constructor(private land: LandService, private route: ActivatedRoute) {}

  ionViewWillEnter() {
    const q = this.route.snapshot.queryParamMap;
    this.kind = q.get('kind') === 'sale' ? 'sale' : 'rent';
    const status = q.get('status');
    this.status = status === 'cancelled' || status === 'problem' ? status : 'ok';
    // Shown with text interpolation only (never as HTML), and kept short.
    this.message = (q.get('message') || '').slice(0, 300);
    this.land.refresh();
    this.land.refreshMine();
  }
}
