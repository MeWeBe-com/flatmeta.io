import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HttpService } from './http.service';
import { SessionService } from './session.service';

export interface FriendRequest {
  request_id: number;
  user_id: number;
  username: string;
  fullname: string;
  image: string;
  status: '1' | '2' | '3';
  created_at: string;
}

export interface Friend {
  user_id: number;
  username: string;
  fullname: string;
  image: string;
  room_id?: number;
}

/**
 * Connections ("added like on LinkedIn"). Only verified users can connect,
 * because a connection has to survive across devices.
 */
@Injectable({ providedIn: 'root' })
export class FriendsService {
  readonly friends$ = new BehaviorSubject<Friend[]>([]);
  readonly requests$ = new BehaviorSubject<FriendRequest[]>([]);
  /** Users I've sent a request to in this session (so the UI can say "Requested"). */
  private pendingOut = new Set<string>();

  constructor(private http: HttpService, private session: SessionService) {
    this.session.identity$.subscribe((id) => {
      if (id.isGuest) {
        this.friends$.next([]);
        this.requests$.next([]);
      } else {
        this.refresh();
      }
    });
  }

  isFriend(userId: string | number): boolean {
    return this.friends$.value.some((f) => String(f.user_id) === String(userId));
  }

  isRequested(userId: string | number): boolean {
    return this.pendingOut.has(String(userId));
  }

  get incomingCount(): number {
    return this.requests$.value.filter((r) => r.status === '2').length;
  }

  async refresh() {
    if (this.session.isGuest) return;
    const [friends, requests] = await Promise.all([
      this.http.getAsync('GetFriends'),
      this.http.getAsync('GetAllFriendRequest'),
    ]);
    if (requests?.status === true && Array.isArray(requests.data?.requests)) {
      this.requests$.next(requests.data.requests);
    }
    if (friends?.status === true && Array.isArray(friends.data?.friends)) {
      this.friends$.next(friends.data.friends);
    } else if (requests?.status === true) {
      // Older API without GetFriends: accepted incoming requests are friends.
      this.friends$.next(
        (requests.data?.requests || [])
          .filter((r: FriendRequest) => r.status === '1')
          .map((r: FriendRequest) => ({ user_id: r.user_id, username: r.username, fullname: r.fullname, image: r.image }))
      );
    }
  }

  async sendRequest(userId: string | number): Promise<{ ok: boolean; message: string; needsAuth?: boolean }> {
    if (this.session.isGuest) {
      return { ok: false, needsAuth: true, message: 'Verify your email to add connections.' };
    }
    if (!/^\d+$/.test(String(userId))) {
      return { ok: false, message: 'Guests need to verify their email before you can connect with them.' };
    }
    const res = await this.http.postAsync('SendFriendRequest', { follower_user_id: Number(userId) });
    if (res?.status === true) {
      this.pendingOut.add(String(userId));
      return { ok: true, message: res.data?.message || 'Connection request sent.' };
    }
    return { ok: false, message: res?.data?.message || res?.message || 'Could not send request.' };
  }

  async respond(requestId: number, accept: boolean): Promise<{ ok: boolean; message: string }> {
    const res = await this.http.postAsync('UpdateFriendRequestStatus', { request_id: requestId, status: accept ? '1' : '3' });
    await this.refresh();
    return { ok: res?.status === true, message: res?.data?.message || res?.message || '' };
  }
}
