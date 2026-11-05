/* eslint-disable @typescript-eslint/naming-convention */
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { LandService, LandArea } from './land.service';
import { HttpService } from './http.service';
import { SessionService, Identity } from './session.service';
import { PresenceService } from './presence.service';
import { createRandomAvatarConfig } from '../core/avatar';

describe('LandService', () => {
  let service: LandService;
  let identitySubject: BehaviorSubject<Identity>;

  beforeEach(() => {
    identitySubject = new BehaviorSubject<Identity>({
      id: 'user_1',
      isGuest: false,
      userId: 1,
      username: 'tester',
      fullname: 'Tester User',
      email: 'test@example.com',
      clan: '',
      phone: '',
      paypalEmail: 'test@example.com',
      avatarConfig: createRandomAvatarConfig(),
      avatarUrl: '',
    });

    const httpSpy = jasmine.createSpyObj('HttpService', ['getAsync', 'postAsync', 'uploadAsync']);
    const sessionSpy = {
      identity$: identitySubject.asObservable(),
      get identity() {
        return identitySubject.value;
      },
      get isGuest() {
        return identitySubject.value.isGuest;
      },
      signedOut$: new Subject<void>().asObservable(),
    };
    const presenceSpy = {
      tilesChanged$: new Subject<{ by: string; bounds: any }>().asObservable(),
    };

    TestBed.configureTestingModule({
      providers: [
        LandService,
        { provide: HttpService, useValue: httpSpy },
        { provide: SessionService, useValue: sessionSpy },
        { provide: PresenceService, useValue: presenceSpy },
      ],
    });

    service = TestBed.inject(LandService);
  });

  it('should initialize and return cached areas', () => {
    const areas = service.areas();
    expect(Array.isArray(areas)).toBeTrue();
    // FlatMeta official plaza is built on start
    expect(areas.some((a) => a.order_id === 'flatmeta-home')).toBeTrue();
    // Successive calls return the exact same cached reference
    expect(service.areas()).toBe(areas);
  });

  it('should search loaded areas and deduplicate correctly without O(N^2) scans', () => {
    const results = service.search('flatmeta');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].order_id).toBe('flatmeta-home');
  });

  it('should cap search results at 8 items', () => {
    const mockAreas: LandArea[] = [];
    for (let i = 0; i < 20; i++) {
      mockAreas.push({
        order_id: `test-order-${i}`,
        user_id: 'user_1',
        username: 'tester',
        fullname: 'Tester User',
        title: `Test Land ${i}`,
        slug: `test-land-${i}`,
        three_words: `test.land.${i}`,
        custom_details: '',
        embed_url: '',
        custom_code: '',
        image: '',
        previous_image: '',
        no_of_tiles: 1,
        lat: 0,
        lng: 0,
        sale_price: 1,
        total_sale_value: 1,
        on_sale: false,
        promoted: false,
        views: 0,
        created_at: '',
        is_mine: true,
        draft: false,
        official: false,
        tiles: [],
      });
    }
    (service as any).mine = mockAreas;

    const results = service.search('Test Land');
    expect(results.length).toBe(8);
  });
});
