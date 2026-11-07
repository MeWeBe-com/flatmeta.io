/* eslint-disable @typescript-eslint/naming-convention */
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { LandArea, LandService } from './land.service';
import { HttpService } from './http.service';
import { SessionService } from './session.service';
import { PresenceService } from './presence.service';

describe('LandService search', () => {
  let service: LandService;
  let sessionStub: any;
  let httpStub: any;
  let presenceStub: any;

  beforeEach(() => {
    sessionStub = {
      identity: { id: 'user1', username: 'tester', fullname: 'Tester', isGuest: false, clan: '' },
      identity$: of({ id: 'user1', username: 'tester', fullname: 'Tester', isGuest: false, clan: '' }),
      signedOut$: new Subject<void>(),
    };
    httpStub = {
      getAsync: jasmine.createSpy('getAsync').and.resolveTo({ status: true, data: {} }),
      postAsync: jasmine.createSpy('postAsync').and.resolveTo({ status: true, data: {} }),
    };
    presenceStub = {
      tilesChanged$: new Subject<any>(),
    };

    TestBed.configureTestingModule({
      providers: [
        LandService,
        { provide: SessionService, useValue: sessionStub },
        { provide: HttpService, useValue: httpStub },
        { provide: PresenceService, useValue: presenceStub },
      ],
    });

    service = TestBed.inject(LandService);
  });

  const makeArea = (orderId: string, title: string, slug: string, threeWords: string, username: string): LandArea => ({
    order_id: orderId,
    user_id: 'u1',
    username,
    fullname: 'Full ' + username,
    title,
    slug,
    three_words: threeWords,
    custom_details: '',
    embed_url: '',
    custom_code: '',
    image: '',
    previous_image: '',
    no_of_tiles: 1,
    lat: 0,
    lng: 0,
    sale_price: 0,
    total_sale_value: 0,
    on_sale: false,
    promoted: false,
    views: 0,
    created_at: '',
    is_mine: false,
    draft: false,
    official: false,
    tiles: [],
  });

  it('returns empty array when query is empty or whitespace', () => {
    expect(service.search('')).toEqual([]);
    expect(service.search('   ')).toEqual([]);
  });

  it('searches across title, slug, three_words, and username', () => {
    const areas = [
      makeArea('1', 'Alpha Garden', 'alpha-garden', 'alpha.orbit.nexus', 'alice'),
      makeArea('2', 'Beta Plaza', 'beta-plaza', 'beta.orbit.solar', 'bob'),
      makeArea('3', 'Gamma Zone', 'gamma-zone', 'gamma.lunar.pixel', 'charlie'),
      makeArea('4', 'Delta Park', 'delta-park', 'delta.prism.atlas', 'david'),
    ];
    spyOn(service, 'areas').and.returnValue(areas);

    // match title
    expect(service.search('garden').map((a) => a.order_id)).toEqual(['1']);
    // match slug
    expect(service.search('beta-plaza').map((a) => a.order_id)).toEqual(['2']);
    // match three_words
    expect(service.search('lunar.pixel').map((a) => a.order_id)).toEqual(['3']);
    // match username
    expect(service.search('david').map((a) => a.order_id)).toEqual(['4']);
  });

  it('deduplicates matching areas by order_id and caps at 8 items', () => {
    const manyAreas: LandArea[] = [];
    for (let i = 1; i <= 20; i++) {
      // Intentionally create duplicate order IDs for 1..5
      const id = i > 15 ? String(i - 15) : String(i);
      manyAreas.push(makeArea(id, `Match Area ${i}`, `match-${i}`, `word.${i}.here`, `user${i}`));
    }
    spyOn(service, 'areas').and.returnValue(manyAreas);

    const results = service.search('match');
    expect(results.length).toBe(8);
    const ids = results.map((r) => r.order_id);
    const uniqueIds = Array.from(new Set(ids));
    expect(ids).toEqual(uniqueIds);
  });
});
