import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ServiceWorkerModule } from '@angular/service-worker';
import { environment } from '../environments/environment';
import { InAppBrowser } from '@awesome-cordova-plugins/in-app-browser/ngx';
import { QuillModule } from 'ngx-quill'
import { LocationAccuracy } from '@awesome-cordova-plugins/location-accuracy/ngx';

import { ChatComponent } from './components/chat/chat.component';
import { ForgetpasswordComponent } from './components/forgetpassword/forgetpassword.component';

import { SocketIoModule, SocketIoConfig } from 'ngx-socket-io';
const config: SocketIoConfig = { url: 'https://orange-spiral-jobaria.glitch.me/', options: {} }
//const config: SocketIoConfig = { url: 'http://localhost:3500/', options: {} };

@NgModule({
    declarations: [AppComponent, ChatComponent, ForgetpasswordComponent],
    imports: [
        BrowserModule,
        IonicModule.forRoot(),
        AppRoutingModule,
        FormsModule,
        HttpClientModule,
        ReactiveFormsModule,
        QuillModule.forRoot(),
        SocketIoModule.forRoot(config),
        ServiceWorkerModule.register('ngsw-worker.js', {
            enabled: environment.production,
            // Register the ServiceWorker as soon as the application is stable
            // or after 30 seconds (whichever comes first).
            registrationStrategy: 'registerWhenStable:30000'
        })
    ],
    providers: [
        InAppBrowser,
        LocationAccuracy,
        { provide: RouteReuseStrategy, useClass: IonicRouteStrategy }
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }
