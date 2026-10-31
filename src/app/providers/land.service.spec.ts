import { LandService, LandArea } from './land.service';

describe('LandService', () => {
  let service: LandService;
  let mockHttp: any;
  let mockSession: any;
  let mockPresence: any;

  beforeEach(() => {
    mockHttp = {
      getAsync: jasmine.createSpy('getAsync').and.resolveTo({ status: true, data: {} }),
      postAsync: jasmine.createSpy('postAsync').and.resolveTo({ status: true, data: {} }),
      uploadAsync: jasmine.createSpy('uploadAsync').and.resolveTo({ status: true, data: {} }),
    };

    mockSession = {
      identity: { id: 'user_1', username: 'tester', fullname: 'Tester', isGuest: false },
      identity$: { subscribe: () => ({ unsubscribe: () => {} }) },
      signedOut$: { subscribe: () => ({ unsubscribe: () => {} }) },
      isGuest: false,
    };

    mockPresence = {
      tilesChanged$: { subscribe: () => ({ unsubscribe: () => {} }) },
      announceTilesChanged: jasmine.createSpy('announceTilesChanged'),
    };

    service = new LandService(mockHttp, mockSession, mockPresence);
  });

  describe('search', () => {
    const makeArea = (id: string, title: string, slug: string, threeWords: string, username: string): LandArea => ({
      /* eslint-disable @typescript-eslint/naming-convention */
      order_id: id,
      user_id: 'u_' + id,
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
      lat: 51.5,
      lng: -0.1,
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
      /* eslint-enable @typescript-eslint/naming-convention */
    });

    it('returns empty array when query is empty or whitespace', () => {
      expect(service.search('')).toEqual([]);
      expect(service.search('   ')).toEqual([]);
    });

    it('finds areas matching by title, slug, three_words, and username', () => {
      const area1 = makeArea('1', 'Wonderland', 'wonder-land', 'apple.banana.cherry', 'alice');
      const area2 = makeArea('2', 'Gotham Central', 'gotham', 'dark.knight.cave', 'bruce');
      spyOn(service, 'areas').and.returnValue([area1, area2]);
      (service as any).mine = [];

      expect(service.search('wonder')).toEqual([area1]);
      expect(service.search('wonder-land')).toEqual([area1]);
      expect(service.search('knight')).toEqual([area2]);
      expect(service.search('alice')).toEqual([area1]);
    });

    it('deduplicates areas with the same order_id between areas() and mine', () => {
      const area1 = makeArea('1', 'Wonderland', 'wonder-land', 'apple.banana.cherry', 'alice');
      const area1Duplicate = makeArea('1', 'Wonderland', 'wonder-land', 'apple.banana.cherry', 'alice');
      spyOn(service, 'areas').and.returnValue([area1]);
      (service as any).mine = [area1Duplicate];

      const results = service.search('wonder');
      expect(results.length).toBe(1);
      expect(results[0].order_id).toBe('1');
    });

    it('caps results at at most 8 items with early termination', () => {
      const list: LandArea[] = [];
      for (let i = 1; i <= 20; i++) {
        list.push(makeArea(String(i), `Park ${i}`, `park-${i}`, `tree.flower.${i}`, 'nature'));
      }
      spyOn(service, 'areas').and.returnValue(list);
      (service as any).mine = [];

      const results = service.search('park');
      expect(results.length).toBe(8);
      expect(results.map((r) => r.order_id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    });
  });
});
