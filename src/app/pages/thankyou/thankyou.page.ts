import { Component } from '@angular/core';
import { LandService } from 'src/app/providers/land.service';

/** PayPal returns here after a subscription or marketplace purchase. */
@Component({
  selector: 'app-thankyou',
  templateUrl: './thankyou.page.html',
  styleUrls: ['./thankyou.page.scss'],
})
export class ThankyouPage {
  constructor(private land: LandService) {}

  ionViewWillEnter() {
    this.land.refresh();
  }
}
