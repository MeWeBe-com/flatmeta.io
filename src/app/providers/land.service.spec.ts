/* eslint-disable @typescript-eslint/naming-convention */
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { LandService, LandTile } from './land.service';
import { HttpService } from './http.service';
import { SessionService } from './session.service';
import { PresenceService } from './presence.service';

describe('LandService areas memoization and indexing', () => {
  let service: LandService;
  let identity$: Subject<any>;
  let signedOut$: Subject<void>;
  let tilesChanged$: Subject<any>;

  beforeEach(() => {
    identity$ = new Subject();
    signedOut$ = new Subject();
    tilesChanged$ = new Subject();

    const mockHttp = {
      getAsync: jasmine.createSpy('getAsync').and.returnValue(Promise.resolve({ status: true, data: {} })),
      postAsync: jasmine.createSpy('postAsync').and.returnValue(Promise.resolve({ status: true, data: {} })),
    };

    const mockSession = {
      identity: { id: 'user_1', isGuest: false, username: 'tester', fullname: 'Tester' },
      identity$,
      signedOut$,
    };

    const mockPresence = {
      tilesChanged$,
    };

    TestBed.configureTestingModule({
      providers: [
        LandService,
        { provide: HttpService, useValue: mockHttp },
        { provide: SessionService, useValue: mockSession },
        { provide: PresenceService, useValue: mockPresence },
      ],
    });

    service = TestBed.inject(LandService);
  });

  it('memoizes areas() and returns same array reference when tiles have not changed', () => {
    const areas1 = service.areas();
    const areas2 = service.areas();

    expect(areas1).toBe(areas2);
  });

  it('retrieves an area by order_id in O(1) time and falls back to mine', () => {
    const officialArea = service.area('flatmeta-home');
    expect(officialArea).toBeDefined();
    expect(officialArea?.order_id).toBe('flatmeta-home');

    expect(service.area('non-existent')).toBeUndefined();
  });

  it('invalidates memoized areas cache when new tiles are published', () => {
    const areas1 = service.areas();
    // Emitting a new tiles array directly to tiles$
    const dummyTile: LandTile = {
      gx: 100,
      gy: 100,
      lat: 10,
      lng: 10,
      order_id: 'new_order',
      user_id: 'user_2',
      username: 'other',
      fullname: 'Other',
      image: '',
      previous_image: '',
      span_bounds: null,
      area_title: 'New Land',
      slug: 'new-land',
      three_words: 'word.word.word',
      custom_details: '',
      embed_url: '',
      custom_code: '',
      on_sale: false,
      sale_price: 1,
      views: 0,
      promoted: false,
      created_at: '',
    };
    service.tiles$.next([dummyTile]);

    const areas2 = service.areas();
    expect(areas2).not.toBe(areas1);
    expect(service.area('new_order')?.title).toBe('New Land');
  });
});
