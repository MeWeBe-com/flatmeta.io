import { Component, OnInit, Input, ViewChild } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { MetaverseService } from 'src/app/providers/metaverse.service';
import { WebSocketService } from 'src/app/providers/websocket.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatComponent implements OnInit {
  @ViewChild(IonContent) myContent: IonContent;

  senderId: string = '';
  chats: any[] = [];
  roomId: string = '';
  newMessage: string = '';

  @Input() id: string;
  @Input() name: String;

  constructor(
    public general: GeneralService,
    public http: HttpService,
    public meta: MetaverseService,
    private socket: WebSocketService
  ) {
    this.getMessages().subscribe((message: any) => {
      if (!message) return;
      const isSelf =
        (message.senderId && String(message.senderId) === String(this.senderId)) ||
        (message.sender_id && String(message.sender_id) === String(this.senderId));
      if (!isSelf) {
        const msgRoom = String(message.roomId || message.room_id || '');
        const currentRoom = String(this.roomId || '');
        const targetRoom = 'room_' + this.id;

        if (!currentRoom || msgRoom === currentRoom || msgRoom === targetRoom || currentRoom === targetRoom) {
          this.chats.push(message);
          setTimeout(() => {
            if (this.myContent) {
              this.myContent.scrollToBottom(100);
            }
          }, 100);
        }
      }
    });
  }

  ngOnInit() {
    this.senderId = this.meta.getCurrentUserId();
    this.getAllMessages(this.id);
  }

  getAllMessages(id: any) {
    const payload = {
      follower_user_id: id,
      my_user_id: this.senderId,
    };

    this.http.post('GetRoomId', payload, false).subscribe(
      (res: any) => {
        if (res && res.status === true && res.data) {
          this.chats = res.data.messages || [];
          this.roomId = res.data.room_id || res.data.roomId || 'room_' + id;
          setTimeout(() => {
            if (this.myContent) {
              this.myContent.scrollToBottom(150);
            }
          }, 150);
        } else {
          this.roomId = 'room_' + id;
          this.seedBotGreetingIfNeeded();
        }
      },
      () => {
        this.roomId = 'room_' + id;
        this.seedBotGreetingIfNeeded();
      }
    );
  }

  private seedBotGreetingIfNeeded() {
    if (this.chats.length === 0 && (this.id === 'citizen_aria' || this.id === 'citizen_zane')) {
      this.chats.push({
        message: `Hi @${this.meta.getCurrentUsername()}! Great to connect with you in FlatMeta. How is your land building going? :)`,
        senderId: this.id,
        sender_id: this.id,
        roomId: this.roomId,
        created_at: new Date().toISOString(),
      });
    }
  }

  sendMessage(msg: string) {
    if (!msg || !msg.trim()) {
      return;
    }
    const cleanMsg = msg.trim();
    const now = new Date().toISOString();
    const currentRoom = this.roomId || 'room_' + this.id;

    const payload = {
      message: cleanMsg,
      senderId: this.senderId,
      sender_id: this.senderId,
      roomId: currentRoom,
      room_id: currentRoom,
      created_at: now,
      createdAt: now,
    };

    // 1. Broadcast via MetaverseService (WebSocket + BroadcastChannel + Speech Bubble + Smiley Expression)
    this.meta.sendChatMessage(cleanMsg, {
      scope: 'direct',
      roomId: currentRoom,
      recipientId: String(this.id),
    });

    this.chats.push(payload);
    this.newMessage = '';

    // 2. If chatting with ambient citizen Aria or Zane, send an interactive reply
    if (this.id === 'citizen_aria' || this.id === 'citizen_zane') {
      setTimeout(() => {
        const replyText =
          this.id === 'citizen_aria'
            ? `Awesome! Remember you can claim up to 100 squares for free and span 1 image across multiple squares :)`
            : `Nice! Check out the Marketplace if you want to trade prime London parcels :D`;
        const botReply = {
          message: replyText,
          senderId: this.id,
          sender_id: this.id,
          roomId: currentRoom,
          created_at: new Date().toISOString(),
        };
        this.chats.push(botReply);
        this.meta.speechBubble$.next({
          senderId: String(this.id),
          text: replyText,
          expression: 'Smile',
        });
        setTimeout(() => {
          if (this.myContent) {
            this.myContent.scrollToBottom(100);
          }
        }, 80);
      }, 900);
    }

    // 3. Persist to MySQL via REST API
    this.http
      .post(
        'AddNewMessaage',
        {
          roomId: currentRoom,
          senderId: this.senderId,
          message: cleanMsg,
          createdAt: now,
        },
        false
      )
      .subscribe({
        next: (res: any) => {
          if (res && res.status === true && res.data?.room_id) {
            this.roomId = res.data.room_id;
          }
        },
        error: () => {},
      });

    setTimeout(() => {
      if (this.myContent) {
        this.myContent.scrollToBottom(100);
      }
    }, 100);
  }

  getMessages(): Observable<any> {
    return this.socket.fromEvent('message');
  }
}
