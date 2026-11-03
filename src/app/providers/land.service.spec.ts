import { TestBed } from '@angular/core/testing';
import { LandService } from './land.service';
import { HttpService } from './http.service';
import { SessionService } from './session.service';
import { PresenceService } from './presence.service';
import { BehaviorSubject, Subject } from 'rxjs';

describe('LandService area memoization', () => {
  let service: LandService;
  let mockHttp: jasmine.SpyObj<HttpService>;
  let mockSession: Partial<SessionService>;
  let mockPresence: Partial<PresenceService>;

  beforeEach(() => {
    localStorage.clear();
    mockHttp = jasmine.createSpyObj('HttpService', ['getAsync', 'postAsync', 'uploadAsync']);
    const testIdentity = {
      id: 'test_user',
      isGuest: false,
      userId: 1,
      username: 'testuser',
      fullname: 'Test User',
      email: 'test@example.com',
      clan: '',
      phone: '',
      paypalEmail: '',
      avatarConfig: {} as any,
      avatarUrl: '',
    };
    mockSession = {
      identity: testIdentity,
      identity$: new BehaviorSubject<any>(testIdentity),
      signedOut$: new Subject<void>(),
    };
    mockPresence = {
      tilesChanged$: new Subject<any>(),
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

  afterEach(() => {
    localStorage.clear();
  });

  it('memoizes areas() result between calls without rebuilding', () => {
    const areas1 = service.areas();
    const areas2 = service.areas();
    expect(areas1).toBe(areas2);
    expect(areas1.length).toBeGreaterThan(0);
    expect(areas1.some((a) => a.order_id === 'flatmeta-home')).toBeTrue();
  });

  it('invalidates and rebuilds cached areas when tiles are published', async () => {
    const areas1 = service.areas();
    // In guest mode, claiming tiles adds a local draft and invokes publish() synchronously
    (mockSession as any).identity.isGuest = true;
    await service.claim([{ gx: 100, gy: 200 }]);
    const areas2 = service.areas();
    expect(areas1).not.toBe(areas2);
    expect(areas2.length).toBeGreaterThan(areas1.length);
  });

  it('finds area by order_id via O(1) indexed lookup', () => {
    const homeArea = service.area('flatmeta-home');
    expect(homeArea).toBeDefined();
    expect(homeArea?.order_id).toBe('flatmeta-home');
    expect(homeArea?.title).toBe('FlatMeta Home');

    const nonExistent = service.area('does-not-exist');
    expect(nonExistent).toBeUndefined();
  });
});
