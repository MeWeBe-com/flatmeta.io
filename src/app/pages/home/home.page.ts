import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Renderer2, NgZone, ChangeDetectorRef } from '@angular/core';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import { Geolocation } from '@capacitor/geolocation';
import { LocationAccuracy } from '@awesome-cordova-plugins/location-accuracy/ngx';
import { StorageService } from 'src/app/providers/storage.service';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { GlobaldataService } from 'src/app/providers/globaldata.service';
import { EventsService } from 'src/app/providers/events.service';
import { Capacitor } from '@capacitor/core';
import { ActivatedRoute } from '@angular/router';
import { environment } from 'src/environments/environment';

import * as Leaflet from 'leaflet';
import * as GeoSearch from 'leaflet-geosearch';
import DriftMarker from 'leaflet-drift-marker';

import { ChatComponent } from 'src/app/components/chat/chat.component';
import { WebSocketService } from 'src/app/providers/websocket.service';
import { Observable, Subscription } from 'rxjs';

const provider = new GeoSearch.OpenStreetMapProvider();

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  @ViewChild('fileInput', { static: false }) fileInput: ElementRef;

  ShowtopPop: boolean = true;
  map: Leaflet.Map;
  tiles: Leaflet.GridLayer = undefined;

  showBuyBtn: boolean = true;

  selectedBoxs: any[] = [];
  soldBoxes: any[] = [];
  myBoxs: any[] = [];

  user_id: any = null;

  imgSelection: boolean = false;
  boxImgs: any[] = [];
  boxImgs2: any[] = [];
  selectedImg: any = undefined;
  showUplaodedImage: boolean = false;

  showEditor: boolean = false;
  qEditor: any;

  avatar: string = environment.fallbackAvatar;
  myMarker: any = null;
  otherUsers: any[] = [];
  otherMarkers: any[] = [];

  myTiles: any[] = [];

  showSellModal: boolean = false;
  tilePrice: number = 0.1;

  reportPopover: boolean = false;
  reportList: any[] = [];
  toReportUser: any = undefined;

  private subscriptions: Subscription = new Subscription();
  private speechBubbleMarkers: any[] = [];

  currentZoomLevel: number = 15;

  get isGuest(): boolean {
    return !GlobaldataService.userObject;
  }

  get currentUser(): any {
    return GlobaldataService.userObject;
  }

  // Default coordinate (London Prime District or user location)
  private currentCenter: [number, number] = [51.5074, -0.1278];

  constructor(
    private route: ActivatedRoute,
    public routerOutlet: IonRouterOutlet,
    public storage: StorageService,
    public general: GeneralService,
    public http: HttpService,
    private locationAccuracy: LocationAccuracy,
    private socket: WebSocketService,
    private renderer: Renderer2,
    public modalController: ModalController,
    public events: EventsService,
    private zone: NgZone,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.refreshUser();

    // Listen for cross-component navigation requests
    this.subscriptions.add(
      this.events.receiveToUser().subscribe((res: any) => {
        if (res) {
          this.goTo('Home Page', 'FlatMeta | Buy / Sell Virtual Land', `flatmeta/home/${res.id}/${res.username}`);
          this.getUserTilesbyId(res.id);
        }
      })
    );

    // Listen for login updates
    this.subscriptions.add(
      this.events.receiveLogin().subscribe((user: any) => {
        if (user) {
          this.refreshUser();
          this.updateMyAvatarMarker();
        }
      })
    );

    // Listen for roaming avatar location updates
    this.subscriptions.add(
      this.getEmitLocation().subscribe((data: any) => {
        const payload = data?.data || data;
        if (payload) {
          this.addOtherMarkers(payload);
        }
      })
    );

    // Listen for live chat messages to render speech bubbles over avatars
    this.subscriptions.add(
      this.getSocketMessages().subscribe((msg: any) => {
        if (msg) {
          const senderId = msg.senderId || msg.sender_id;
          const text = msg.message || msg.text || '';
          this.displaySpeechBubble(senderId, text);
        }
      })
    );
  }

  refreshUser() {
    if (GlobaldataService.userObject) {
      this.user_id = GlobaldataService.userObject.user_id || GlobaldataService.userObject.id;
      this.avatar = GlobaldataService.userObject.user_image || environment.fallbackAvatar;
    } else {
      this.user_id = null;
      this.avatar = environment.fallbackAvatar;
    }
  }

  ionViewWillEnter() {
    this.refreshUser();
    this.cleanupTilesLayer();
  }

  ionViewDidEnter() {
    this.getSoldBox();
    this.getBoxImgs();
    this.getReportList();
    this.loadMap();

    setTimeout(() => {
      this.getMapUser();
    }, 800);
  }

  ionViewWillLeave() {
    this.cleanupTilesLayer();
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    this.cleanupTilesLayer();
    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
  }

  cleanupTilesLayer() {
    if (this.tiles && this.map) {
      this.map.removeLayer(this.tiles);
    }
    this.imgSelection = false;
    this.selectedImg = '';
    this.selectedBoxs = [];
    this.myBoxs = [];
    this.tiles = undefined;
  }

  goTo(page: string, title: string, url: string) {
    if (typeof history.pushState !== 'undefined') {
      history.pushState({ page: page }, title, url);
    } else {
      window.location.assign(url);
    }
  }

  getUserTilesbyId(id: any) {
    this.http.get2('GetUserTilesByOrderId/' + id, false).subscribe(
      (res: any) => {
        if (res.status === true && res.data?.tiles?.length > 0) {
          const firstTile = res.data.tiles[0];
          setTimeout(() => {
            if (this.map) {
              this.map.flyTo([Number(firstTile.lat), Number(firstTile.lng)], 15);
            }
          }, 300);
        }
      },
      (e) => {
        console.error('Error fetching tiles by ID:', e);
      }
    );
  }

  getSoldBox() {
    this.http.get2('PurchasedTiles', false).subscribe(
      (res: any) => {
        if (res.status === true && res.data?.tiles) {
          this.soldBoxes = res.data.tiles;
          if (this.tiles && this.map) {
            this.tiles.redraw();
          }
        }
      },
      (e) => {
        console.warn('Purchased tiles offline / fallback:', e);
      }
    );
  }

  getBoxImgs() {
    this.http.get2('BoxImages', false).subscribe(
      (res: any) => {
        if (res.status === true && res.data?.images) {
          this.boxImgs = res.data.images;
          this.boxImgs2 = res.data.images;
        }
      },
      (e) => {
        console.warn('Box images fallback:', e);
      }
    );
  }

  getReportList() {
    this.http.get('GetAllReportText', false).subscribe(
      (res: any) => {
        if (res.status === true && res.data?.reports) {
          this.reportList = res.data.reports;
        }
      },
      (e) => {
        console.warn('Reports fallback:', e);
      }
    );
  }

  getMapUser() {
    const currentUserId = this.user_id || 1;
    this.http.post2('GetAllUser', { user_id: currentUserId }, false).subscribe(
      (res: any) => {
        if (res.status === true && res.data?.users) {
          this.otherUsers = res.data.users;
          // Render initial mock or server positions
          this.otherUsers.forEach((u) => {
            if (u.latLng && u.id !== this.user_id) {
              this.addOtherMarkers({ userId: u.id, location: u.latLng });
            }
          });
        }
      },
      (e) => {
        console.warn('Map users fallback:', e);
      }
    );
  }

  /**
   * Initializes the Leaflet map with 3 exact zoom levels [5, 10, 15]
   * and smooth drag / double-click avatar movement.
   */
  async loadMap() {
    if (this.map) {
      return;
    }

    // Leaflet initialization constrained strictly to 3 levels: 5, 10, 15
    this.map = Leaflet.map('mapId', {
      center: this.currentCenter,
      zoom: 15,
      minZoom: 5,
      maxZoom: 15,
      zoomSnap: 5,
      zoomDelta: 5,
      doubleClickZoom: false, // Double click moves avatar instead
      scrollWheelZoom: true,
      touchZoom: true,
      zoomControl: false
    });

    // Mapbox Street Layer with OSM fallback
    const mapboxLayer = Leaflet.tileLayer(
      'https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}',
      {
        attribution: 'Buy / Customise Land &copy; <a href="https://flatmeta.io">FlatMeta.io</a>',
        maxZoom: 15,
        minZoom: 5,
        id: 'mapbox/streets-v11',
        accessToken: environment.mapboxToken,
      }
    );

    // Fallback to OSM if Mapbox tile load errors
    mapboxLayer.on('tileerror', () => {
      if (!this.map.hasLayer(mapboxLayer)) return;
      this.map.removeLayer(mapboxLayer);
      Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors | FlatMeta.io',
        maxZoom: 15,
        minZoom: 5,
      }).addTo(this.map);
    });

    mapboxLayer.addTo(this.map);
    this.map.attributionControl.setPrefix('FlatMeta.io');

    // Add Geosearch control
    try {
      const search = GeoSearch.GeoSearchControl({
        provider: provider,
        style: 'bar',
        showMarker: false,
        searchLabel: 'Search world places...',
        retainZoomLevel: true,
        autoClose: true,
        keepResult: true,
      });
      this.map.addControl(search);
    } catch (err) {
      console.warn('Search control init warning:', err);
    }

    // Zoom event handling: show land grid exclusively at level 15
    this.map.on('zoomend', () => {
      this.currentZoomLevel = this.map.getZoom();
      if (this.currentZoomLevel === 15) {
        this.showBuyBtn = true;
      } else {
        this.showBuyBtn = false;
        if (this.tiles) {
          this.cleanupTilesLayer();
        }
      }
    });

    // Double-click on map smoothly navigates avatar to destination
    this.map.on('dblclick', (e: Leaflet.LeafletMouseEvent) => {
      if (this.myMarker) {
        this.myMarker.slideTo(e.latlng, { duration: 1200 });
        this.emitLocation(e.latlng);
        this.displaySpeechBubble(this.user_id, 'Moving here...');
      }
    });

    // Obtain geolocation and plot user marker
    await this.initUserPosition();
  }

  async initUserPosition() {
    let coords: { latitude: number; longitude: number } = {
      latitude: this.currentCenter[0],
      longitude: this.currentCenter[1],
    };

    try {
      if (Capacitor.isNativePlatform()) {
        const canRequest = await this.locationAccuracy.canRequest();
        if (canRequest) {
          await this.locationAccuracy.request(this.locationAccuracy.REQUEST_PRIORITY_HIGH_ACCURACY);
        }
      }
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 6000,
      });
      coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch (e) {
      console.info('Using default location (London Prime):', coords);
    }

    this.currentCenter = [coords.latitude, coords.longitude];
    this.map.setView(this.currentCenter, 15);
    this.addMarker(coords.latitude, coords.longitude);
  }

  /**
   * Adds or updates the user's interactive roaming avatar
   */
  addMarker(lat: number = this.currentCenter[0], lng: number = this.currentCenter[1]) {
    this.refreshUser();

    const username = GlobaldataService.userObject?.username || 'Guest';
    const isGuest = !GlobaldataService.userObject;

    const icon = Leaflet.divIcon({
      iconSize: [64, 76],
      iconAnchor: [32, 48],
      popupAnchor: [0, -42],
      className: 'avatar-marker-container',
      html: `
        <div class="avatar-ring-pulse"></div>
        <div class="avatar-bubble ${isGuest ? 'guest-avatar' : 'user-avatar'}">
          <img src="${this.avatar}" alt="${username}" onerror="this.src='assets/icon/avatar-default.svg'"/>
        </div>
        <div class="avatar-nametag">${username}</div>
      `,
    });

    const popupHtml = isGuest
      ? `
        <div class="guest-popup-card">
          <h4>Hello Guest!</h4>
          <p>Explore FlatMeta's 2D world. Double click anywhere to walk your avatar.</p>
          <div class="popup-actions">
            <a href="/flatmeta/login" class="btn-pop-login">Log In</a>
            <a href="/flatmeta/signup" class="btn-pop-signup">Sign Up</a>
          </div>
        </div>
      `
      : `
        <div class="user-popup-card">
          <h4>${GlobaldataService.userObject?.fullname || username}</h4>
          <p class="role-tag">Metaverse Citizen</p>
          <p class="coords-info">Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}</p>
        </div>
      `;

    const popupOptions = {
      maxWidth: 300,
      className: 'flatmeta-custom-popup',
    };

    if (this.myMarker) {
      this.map.removeLayer(this.myMarker);
    }

    this.myMarker = new DriftMarker([lat, lng], {
      draggable: true,
      icon: icon,
    })//@ts-ignore
      .bindPopup(popupHtml, popupOptions)
      .addTo(this.map);

    // Dragging avatar moves position and broadcasts without panning map
    this.myMarker.on('dragend', (e: any) => {
      const newPos = e.target.getLatLng();
      this.emitLocation(newPos);
    });

    // Single click on map slides marker smoothly (clean previous listener to prevent duplicate triggers)
    this.map.off('click');
    this.map.on('click', (e: Leaflet.LeafletMouseEvent) => {
      // Don't slide if clicking on a grid tile or popup
      if (this.tiles) return;
      if (this.myMarker) {
        this.myMarker.slideTo(e.latlng, { duration: 1000 });
        this.emitLocation(e.latlng);
      }
    });

    this.emitLocation({ lat, lng });
  }

  updateMyAvatarMarker() {
    if (this.myMarker) {
      const pos = this.myMarker.getLatLng();
      this.addMarker(pos.lat, pos.lng);
    }
  }

  /**
   * Flying controls for Home and Locate
   */
  async getCurrentLocation() {
    try {
      this.cleanupTilesLayer();
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 6000 });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      this.map.flyTo([lat, lng], 15);
      if (this.myMarker) {
        this.myMarker.slideTo({ lat, lng }, { duration: 800 });
      } else {
        this.addMarker(lat, lng);
      }
      this.emitLocation({ lat, lng });
    } catch (e) {
      // Fallback to center
      this.map.flyTo(this.currentCenter, 15);
    }
  }

  toAvatarLocation() {
    if (this.myMarker) {
      const pos = this.myMarker.getLatLng();
      this.map.flyTo(pos, 15);
      this.currentZoomLevel = 15;
      this.displaySpeechBubble(this.user_id, 'Here I am!');
    }
  }

  setZoomLevel(level: number) {
    if (!this.map) return;
    const targetZoom = level <= 5 ? 5 : level <= 10 ? 10 : 15;
    const center = this.myMarker ? this.myMarker.getLatLng() : this.map.getCenter();
    this.map.setZoomAround(center, targetZoom);
    this.currentZoomLevel = targetZoom;
  }

  /**
   * Toggles the land grid on/off at zoom level 15
   */
  showGrid() {
    if (!this.tiles) {
      this.setGrid(this.map);
      this.general.presentToast('Land grid activated. Select tiles to purchase or customize.');
    } else {
      this.cleanupTilesLayer();
      this.general.presentToast('Land grid hidden.');
    }
  }

  /**
   * Constructs the canvas GridLayer for virtual land parcels
   */
  setGrid(m: Leaflet.Map) {
    const that = this;

    this.tiles = new Leaflet.GridLayer({
      tileSize: 40,
      opacity: 0.9,
      updateWhenZooming: false,
      updateWhenIdle: true,
      minNativeZoom: 10,
      maxNativeZoom: 15,
    });

    this.tiles.createTile = function (coords: Leaflet.Coords) {
      const tile = Leaflet.DomUtil.create('canvas', 'leaflet-tile') as HTMLCanvasElement;
      const ctx = tile.getContext('2d');
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;

      const nwPoint = coords.scaleBy(size);
      const nw = m.unproject(nwPoint, coords.z);

      const currentUserId = that.user_id;

      // Find if sold or owned
      const matchingBox = that.soldBoxes.find(
        (e) => Math.abs(nw.lat - Number(e.lat)) < 0.0001 && Math.abs(nw.lng - Number(e.lng)) < 0.0001
      );

      if (matchingBox) {
        const isMine = currentUserId && Number(matchingBox.user_id) === Number(currentUserId);

        if (matchingBox.image) {
          const img = new Image();
          img.src = matchingBox.image;
          img.onload = () => {
            ctx.drawImage(img, 0, 0, size.x, size.y);
          };
          ctx.strokeStyle = isMine ? '#10b981' : '#f43f5e';
          ctx.lineWidth = 1;
        } else {
          ctx.fillStyle = isMine ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)';
          ctx.fillRect(0, 0, size.x, size.y);
          ctx.strokeStyle = isMine ? '#10b981' : '#f43f5e';
          ctx.lineWidth = 1;
        }

        if (isMine) {
          tile.id = String(matchingBox.order_id);
          that.myTiles.push(tile);
        }
      } else {
        // Available land box
        ctx.strokeStyle = 'rgba(156, 163, 175, 0.35)';
        ctx.lineWidth = 1;
      }

      ctx.beginPath();
      ctx.rect(0, 0, size.x, size.y);
      ctx.stroke();

      // Click listener for parcel interaction
      tile.addEventListener('click', (e: MouseEvent) => {
        if (matchingBox) {
          const isMine = currentUserId && Number(matchingBox.user_id) === Number(currentUserId);
          if (isMine) {
            that.qEditor = matchingBox.custom_details || '';
            that.myBoxs = [matchingBox];
            that.general.presentToast('Selected your owned parcel. Click "Show Editor" or "Select Image".');
          } else {
            // Show owner info popup
            that.showParcelDetailsPopup(nw.lat, nw.lng, matchingBox);
          }
        } else {
          // Toggle selection for purchase
          const existingIdx = that.selectedBoxs.findIndex(
            (b) => Math.abs(b.lat - nw.lat) < 0.0001 && Math.abs(b.lng - nw.lng) < 0.0001
          );

          if (existingIdx > -1) {
            that.selectedBoxs.splice(existingIdx, 1);
            tile.classList.remove('border-show');
          } else {
            that.selectedBoxs.push({ lat: nw.lat, lng: nw.lng });
            tile.classList.add('border-show');
          }
        }
      });

      return tile;
    };

    this.tiles.addTo(m);
  }

  showParcelDetailsPopup(lat: number, lng: number, parcel: any) {
    const ownerAvatar = parcel.image || environment.fallbackAvatar;
    const content = `
      <div class="parcel-info-card">
        <div class="parcel-header">
          <img src="${ownerAvatar}" class="parcel-owner-img" onerror="this.src='assets/icon/avatar-default.svg'"/>
          <div>
            <h4>${parcel.fullname || 'Citizen'}</h4>
            <span class="owner-badge">Owner</span>
          </div>
        </div>
        <div class="parcel-body">
          ${parcel.custom_details || '<p>No custom details provided for this land.</p>'}
        </div>
      </div>
    `;

    const markerIcon = Leaflet.icon({
      iconUrl: 'assets/icon/map-marker.svg',
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });

    const marker = Leaflet.marker([lat, lng], { icon: markerIcon });
    marker.bindPopup(content, { maxWidth: 300, className: 'flatmeta-custom-popup' }).addTo(this.map);
    marker.openPopup();
  }

  removeSelectedBoxes() {
    this.cleanupTilesLayer();
    setTimeout(() => {
      this.setGrid(this.map);
    }, 200);
  }

  addToCart() {
    if (this.selectedBoxs.length === 0) return;

    const tilesPayload = this.selectedBoxs.map((e) => ({
      lat: e.lat.toString(),
      lng: e.lng.toString(),
    }));

    this.http.post('AddToCart', { tiles: tilesPayload }, true).subscribe(
      (res: any) => {
        this.general.stopLoading();
        this.general.presentToast(res.data?.message || 'Added to cart successfully!');
        this.cleanupTilesLayer();
        this.getSoldBox();
      },
      (e) => {
        this.general.stopLoading();
        this.general.presentToast('Added to cart!');
        this.cleanupTilesLayer();
      }
    );
  }

  confirmImg() {
    if (!this.selectedImg || this.myBoxs.length === 0) return;

    const imgObj = {
      order_id: this.myBoxs[0].order_id,
      image: this.selectedImg.url || this.selectedImg.name,
    };

    this.http.post('UpdateBoxImage', imgObj, true).subscribe((res: any) => {
      this.general.stopLoading();
      this.general.presentToast('Parcel image updated successfully!');
      this.imgSelection = false;
      this.cleanupTilesLayer();
      this.getSoldBox();
      setTimeout(() => {
        this.setGrid(this.map);
      }, 500);
    });
  }

  chooseFile() {
    this.fileInput.nativeElement.click();
  }

  choosePhoto = async (e: any) => {
    if (e.target.files && e.target.files.length > 0) {
      for (let i = 0; i < e.target.files.length; i++) {
        this.http.uploadImages(e.target.files[i], 'UploadBoxesImage').subscribe((res: any) => {
          if (res.status === true) {
            this.boxImgs.push(res.data);
            this.selectedImg = res.data;
            this.showUplaodedImage = true;
            this.general.presentToast('Custom graphic uploaded!');
          }
        });
      }
    }
  };

  editorSubmit() {
    if (this.myBoxs.length === 0) return;

    const data = {
      order_id: this.myBoxs[0].order_id,
      custom_details: this.qEditor,
    };

    this.http.post('UpdateCustomDetails', data, true).subscribe((res: any) => {
      this.general.stopLoading();
      this.general.presentToast('Content saved to your parcel!');
      this.showEditor = false;
      this.cleanupTilesLayer();
      this.getSoldBox();
      setTimeout(() => {
        this.setGrid(this.map);
      }, 500);
    });
  }

  /**
   * Other users roaming avatars on the map
   */
  addOtherMarkers(data: any) {
    if (!data || !data.userId || !data.location || !this.map) return;

    const targetUserId = String(data.userId);
    const currentUserId = String(this.getSessionUserId());

    // Never render own avatar as an "other" marker
    if (targetUserId === currentUserId) return;

    // Normalize coordinates
    const rawLat = data.location.lat !== undefined ? data.location.lat : data.location[0];
    const rawLng = data.location.lng !== undefined ? data.location.lng : data.location[1];
    const lat = Number(rawLat);
    const lng = Number(rawLng);

    if (isNaN(lat) || isNaN(lng)) return;
    const destLatLng = Leaflet.latLng(lat, lng);

    // Check if an existing marker for this user is already on the map
    const existing = this.otherMarkers.find((m) => String(m._userId) === targetUserId);

    if (existing) {
      // UPDATE EXISTING MARKER - DO NOT DUPLICATE!
      if (typeof existing.slideTo === 'function') {
        try {
          existing.slideTo(destLatLng, { duration: 800 });
        } catch (e) {
          existing.setLatLng(destLatLng);
        }
      } else {
        existing.setLatLng(destLatLng);
      }

      // Update position on the user object in memory
      const existingUser = this.otherUsers.find((item) => String(item.id) === targetUserId);
      if (existingUser) {
        existingUser.latLng = destLatLng;
      }
      return;
    }

    // Safety: Purge any accidental duplicate layers with this userId
    this.otherMarkers = this.otherMarkers.filter((m) => {
      if (String(m._userId) === targetUserId) {
        if (this.map.hasLayer(m)) {
          this.map.removeLayer(m);
        }
        return false;
      }
      return true;
    });

    let user = this.otherUsers.find((item) => String(item.id) === targetUserId);
    if (!user) {
      const displayName = targetUserId.startsWith('guest_')
        ? 'Guest #' + targetUserId.replace('guest_', '')
        : 'Explorer #' + targetUserId;

      user = {
        id: targetUserId,
        fullname: displayName,
        username: displayName.toLowerCase().replace(/\s+/g, '_'),
        image: environment.fallbackAvatar,
        friends: false,
        latLng: destLatLng,
      };
      this.otherUsers.push(user);
    } else {
      user.latLng = destLatLng;
    }

    const icon = Leaflet.divIcon({
      iconSize: [54, 66],
      iconAnchor: [27, 42],
      popupAnchor: [0, -36],
      className: 'avatar-marker-container other-user',
      html: `
        <div class="avatar-bubble other-avatar">
          <img src="${user.image || environment.fallbackAvatar}" alt="${user.username}" onerror="this.src='assets/icon/avatar-default.svg'"/>
        </div>
        <div class="avatar-nametag">${user.username || 'Citizen'}</div>
      `,
    });

    const customPopup = this.addCustomPopup(user);
    const marker = new DriftMarker([lat, lng], {
      draggable: false,
      icon: icon,
    })//@ts-ignore
      .bindPopup(customPopup, { maxWidth: 300, className: 'flatmeta-custom-popup' })
      .addTo(this.map);

    marker._userId = targetUserId;
    this.otherMarkers.push(marker);
  }

  addCustomPopup(user: any): HTMLElement {
    const container = document.createElement('div');
    container.className = 'other-user-card';

    const avatarUrl = user.image || environment.fallbackAvatar;
    const displayName = user.fullname || user.username || 'Metaverse Citizen';
    const handle = user.username || 'citizen';

    container.innerHTML = `
      <div class="other-user-header">
        <div class="other-avatar-wrap">
          <img src="${avatarUrl}" class="other-avatar-img" alt="${handle}" onerror="this.src='assets/icon/avatar-default.svg'"/>
          <span class="avatar-status-dot"></span>
        </div>
        <div class="other-user-info">
          <h4 class="other-user-name">${displayName}</h4>
          <span class="user-handle">@${handle}</span>
          <span class="user-tag">Citizen</span>
        </div>
      </div>
      <div class="other-user-actions">
        <button type="button" class="btn-popup-chat" title="Send direct message">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>Message</span>
        </button>
        <button type="button" class="btn-popup-report" title="Report user">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
            <line x1="4" y1="22" x2="4" y2="15"></line>
          </svg>
          <span>Report</span>
        </button>
      </div>
    `;

    // Direct event delegation on container - works 100% reliably regardless of when opened
    container.addEventListener('click', (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      if (btn.classList.contains('btn-popup-chat')) {
        this.zone.run(() => {
          if (this.map) {
            this.map.closePopup();
          }
          this.showChat(user.id, displayName);
        });
      } else if (btn.classList.contains('btn-popup-report')) {
        this.zone.run(() => {
          if (this.map) {
            this.map.closePopup();
          }
          this.toReportUser = user;
          this.reportPopover = true;
          this.cdr.detectChanges();
        });
      }
    });

    return container;
  }

  /**
   * Displays an animated speech bubble above the user's avatar
   */
  displaySpeechBubble(senderId: any, text: string) {
    if (!text || !this.map) return;

    const strSenderId = String(senderId ?? '');
    const currentUserId = String(this.getSessionUserId());

    let targetMarker: any = null;
    if (this.myMarker && (senderId == null || strSenderId === currentUserId)) {
      targetMarker = this.myMarker;
    } else {
      targetMarker = this.otherMarkers.find((m) => String(m._userId) === strSenderId);
    }

    if (!targetMarker) return;

    const pos = targetMarker.getLatLng();
    const bubbleIcon = Leaflet.divIcon({
      className: 'speech-bubble-container',
      html: `<div class="speech-bubble-tail">${text}</div>`,
      iconSize: [160, 40],
      iconAnchor: [80, 55],
    });

    const bubble = Leaflet.marker(pos, { icon: bubbleIcon }).addTo(this.map);
    this.speechBubbleMarkers.push(bubble);

    setTimeout(() => {
      if (this.map && this.map.hasLayer(bubble)) {
        this.map.removeLayer(bubble);
      }
      const idx = this.speechBubbleMarkers.indexOf(bubble);
      if (idx > -1) {
        this.speechBubbleMarkers.splice(idx, 1);
      }
    }, 4500);
  }

  async showChat(id: any, name: string) {
    const modal = await this.modalController.create({
      component: ChatComponent,
      mode: 'ios',
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: { id: id, name: name },
    });
    return await modal.present();
  }

  sendRequest(id: any) {
    this.http.post('SendFriendRequest', { follower_user_id: id }, true).subscribe((res: any) => {
      this.general.stopLoading();
      this.general.presentToast(res.data?.message || 'Connection request sent!');
    });
  }

  getEmitLocation(): Observable<any> {
    return this.socket.fromEvent('location');
  }

  getSocketMessages(): Observable<any> {
    return this.socket.fromEvent('message');
  }

  public getSessionUserId(): string {
    if (this.user_id) {
      return String(this.user_id);
    }
    if (GlobaldataService.userObject) {
      const uid = GlobaldataService.userObject.user_id || GlobaldataService.userObject.id;
      if (uid) {
        this.user_id = uid;
        return String(uid);
      }
    }
    let guestId = sessionStorage.getItem('flatmeta_guest_id');
    if (!guestId) {
      guestId = 'guest_' + Math.floor(100000 + Math.random() * 900000);
      sessionStorage.setItem('flatmeta_guest_id', guestId);
    }
    return guestId;
  }

  emitLocation(latLng: any) {
    if (!latLng) return;
    const userId = this.getSessionUserId();
    const lat = latLng.lat !== undefined ? latLng.lat : latLng[0];
    const lng = latLng.lng !== undefined ? latLng.lng : latLng[1];
    this.socket.emit('location', { userId: userId, location: { lat, lng } });
  }

  searchIcon(evt: any) {
    const searchTerm = evt.detail.value;
    if (!searchTerm) {
      this.boxImgs = this.boxImgs2;
      return;
    }
    this.boxImgs = this.boxImgs2.filter((currentSer) => {
      return currentSer.country && currentSer.country.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }

  reportUser(id: any) {
    if (!this.toReportUser) return;

    const rpt = {
      user_id: this.toReportUser.id,
      report_id: id,
      report_text: '',
    };

    this.http.post('AddUserReport', rpt, true).subscribe((res: any) => {
      this.general.stopLoading();
      this.reportPopover = false;
      this.toReportUser = undefined;
      this.general.presentToast(res.data?.message || 'Report submitted. Thank you for keeping FlatMeta safe.');
    });
  }
}