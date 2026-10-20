import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { ActivatedRoute, RouterLink } from '@angular/router';

/**
 * Terms, privacy and refund policies. Text in square brackets must be filled in,
 * and the wording should be checked by a lawyer for your country before launch.
 */
@Component({
    selector: 'app-legal',
    templateUrl: './legal.page.html',
    styleUrls: ['./legal.page.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [CommonModule, RouterLink, IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
})
export class LegalPage {
  doc: 'terms' | 'privacy' | 'refunds' = 'terms';
  readonly company = '[COMPANY NAME]';
  readonly country = '[COUNTRY]';
  readonly contact = '[CONTACT EMAIL]';
  readonly updated = '20 October 2026';

  constructor(route: ActivatedRoute) {
    route.data.subscribe((d) => (this.doc = d['doc'] || 'terms'));
  }

  get title() {
    return this.doc === 'privacy' ? 'Privacy policy' : this.doc === 'refunds' ? 'Payments & refunds' : 'Terms of use';
  }
}
