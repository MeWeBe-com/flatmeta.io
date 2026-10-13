import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface WebSocketMessage {
  event: string;
  data: any;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private socket: WebSocket | null = null;
  private url: string = environment.wsUrl || environment.socketUrl || 'ws://localhost:3500';
  private eventSubjects: Map<string, Subject<any>> = new Map();
  private isConnectedSubject: Subject<boolean> = new Subject<boolean>();
  public isConnected$: Observable<boolean> = this.isConnectedSubject.asObservable();
  private reconnectInterval: number = 2000;
  private maxReconnectInterval: number = 10000;
  private currentReconnectInterval: number = 2000;
  private reconnectTimeout: any = null;
  private heartbeatInterval: any = null;
  private pendingQueue: string[] = [];
  private isExplicitDisconnect: boolean = false;

  constructor(private zone: NgZone) {
    this.connect();
  }

  public connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitDisconnect = false;

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.zone.run(() => {
          console.log('[WebSocket] Connected successfully to', this.url);
          this.currentReconnectInterval = this.reconnectInterval;
          this.isConnectedSubject.next(true);

          // Flush queued messages
          while (this.pendingQueue.length > 0) {
            const msg = this.pendingQueue.shift();
            if (msg && this.socket && this.socket.readyState === WebSocket.OPEN) {
              this.socket.send(msg);
            }
          }

          this.startHeartbeat();
        });
      };

      this.socket.onmessage = (event: MessageEvent) => {
        this.zone.run(() => {
          try {
            const parsed = JSON.parse(event.data);
            const eventName = parsed.event || parsed.type || 'message';
            const data = parsed.data !== undefined ? parsed.data : parsed;

            // Trigger event subject if any subscribers exist
            if (this.eventSubjects.has(eventName)) {
              this.eventSubjects.get(eventName)!.next(data);
            }

            // Also trigger alias events if applicable
            if (eventName === 'message' && this.eventSubjects.has('chatMessage')) {
              this.eventSubjects.get('chatMessage')!.next(data);
            }
            if (eventName === 'location' && this.eventSubjects.has('emitLocation')) {
              this.eventSubjects.get('emitLocation')!.next(data);
            }
          } catch (e) {
            console.warn('[WebSocket] Non-JSON payload received:', event.data);
          }
        });
      };

      this.socket.onclose = () => {
        this.zone.run(() => {
          this.stopHeartbeat();
          this.isConnectedSubject.next(false);
          if (!this.isExplicitDisconnect) {
            this.scheduleReconnect();
          }
        });
      };

      this.socket.onerror = (err) => {
        console.warn('[WebSocket] Connection error:', err);
      };

    } catch (e) {
      console.warn('[WebSocket] Exception during connect:', e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
      this.currentReconnectInterval = Math.min(this.currentReconnectInterval * 1.5, this.maxReconnectInterval);
    }, this.currentReconnectInterval);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.emit('ping', { timestamp: Date.now() });
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Emit an event to the WebSocket server.
   */
  public emit(event: string, data: any): void {
    const payload = JSON.stringify({ event, data });
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    } else {
      this.pendingQueue.push(payload);
      if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
        this.connect();
      }
    }
  }

  /**
   * Register a callback listener for a WebSocket event.
   */
  public on(event: string, callback: (data: any) => void): void {
    this.fromEvent(event).subscribe(callback);
  }

  /**
   * Return an Observable for a specific event.
   */
  public fromEvent<T = any>(event: string): Observable<T> {
    if (!this.eventSubjects.has(event)) {
      this.eventSubjects.set(event, new Subject<T>());
    }
    return this.eventSubjects.get(event)!.asObservable();
  }

  public disconnect(): void {
    this.isExplicitDisconnect = true;
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
