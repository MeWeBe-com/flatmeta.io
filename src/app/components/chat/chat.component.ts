import { Component, OnInit, Input, ViewChild } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { GlobaldataService } from 'src/app/providers/globaldata.service';
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
  chats = [];
  roomId: string = '';
  newMessage: string = '';

  @Input() id: string;
  @Input() name: String;

  constructor(
    public general: GeneralService,
    public http: HttpService,
    private socket: WebSocketService
  ) {

    this.getMessages().subscribe((message: any) => {
      if (!message) return;
      const isSelf = (message.senderId && String(message.senderId) === String(this.senderId)) ||
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
    const user = GlobaldataService.userObject;
    let guestId = sessionStorage.getItem('flatmeta_guest_id');
    if (!guestId) {
      guestId = 'guest_' + Math.floor(100000 + Math.random() * 900000);
      sessionStorage.setItem('flatmeta_guest_id', guestId);
    }
    this.senderId = user?.user_id || user?.id || guestId;
    this.getAllMessages(this.id);
  }

  getAllMessages(id: any) {
    const payload = {
      follower_user_id: id,
      my_user_id: this.senderId
    };

    this.http.post('GetRoomId', payload, false).subscribe(
      (res: any) => {
        this.general.stopLoading();
        if (res && res.status === true && res.data) {
          this.chats = res.data.messages || [];
          this.roomId = res.data.room_id || res.data.roomId || ('room_' + id);
          setTimeout(() => {
            if (this.myContent) {
              this.myContent.scrollToBottom(150);
            }
          }, 150);
        } else {
          this.roomId = 'room_' + id;
        }
      },
      () => {
        this.general.stopLoading();
        this.roomId = 'room_' + id;
      }
    );
  }

  sendMessage(msg: string) {
    if (!msg || !msg.trim()) {
      return;
    }
    const cleanMsg = msg.trim();
    const now = new Date().toISOString();
    const currentRoom = this.roomId || ('room_' + this.id);

    const payload = {
      message: cleanMsg,
      senderId: this.senderId,
      sender_id: this.senderId,
      roomId: currentRoom,
      room_id: currentRoom,
      created_at: now,
      createdAt: now
    };

    // 1. Broadcast immediately via WebSocket for live real-time response
    this.socket.emit("message", payload);
    this.chats.push(payload);
    this.newMessage = '';

    // 2. Persist to MySQL via REST API
    this.http.post('AddNewMessaage', {
      roomId: currentRoom,
      senderId: this.senderId,
      message: cleanMsg,
      createdAt: now
    }, false).subscribe({
      next: (res: any) => {
        if (res && res.status === true && res.data?.room_id) {
          this.roomId = res.data.room_id;
        }
      },
      error: (e) => console.warn('Chat persistence notice:', e)
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
