import { Injectable } from '@angular/core';
import { AlertController, LoadingController, ToastController, PopoverController, Platform, ModalController, MenuController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Location } from '@angular/common';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class GeneralService {
  loading: any;

  globalUrl: string = environment.apiUrl;

  constructor(
    public alertController: AlertController,
    public loadingController: LoadingController,
    public toastController: ToastController,
    private router: Router,
    public modalController: ModalController,
    private popoverController: PopoverController,
    private plt: Platform,
    private _location: Location,
    private menu: MenuController
  ) {

  }

  validateEmail(mail) {
    if (/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(mail)) {
      return true
    }
    return false
  }

  async presentAlert(h, m) {
    const alert = await this.alertController.create({
      header: h,
      message: m,
      buttons: ['OK']
    });

    await alert.present();
  }

  async presentToast(m, d = 3000) {
    const toast = await this.toastController.create({
      message: m,
      duration: d,
      position: 'bottom'
    });
    toast.present();
  }

  async presentLoading(m = 'Please Wait') {
    this.stopLoading();
    this.loading = await this.loadingController.create({
      message: m,
      showBackdrop: true,
      duration: 5000
    });
    await this.loading.present();
  }

  async presentLoading2(m = 'Please Wait') {
    this.stopLoading();
    this.loading = await this.loadingController.create({
      message: m,
      showBackdrop: true,
      duration: 5000
    });
    await this.loading.present();
  }

  stopLoading() {
    if (this.loading) {
      try {
        this.loading.dismiss();
      } catch (e) {}
      this.loading = null;
    }
  }

  closeModal() {
    this.modalController.dismiss();
  }

  async closePopover() {
    await this.popoverController.dismiss();
  }

  async closePopoverWithData(data) {
    await this.popoverController.dismiss(data);
  }

  goToPage(page) {
    this.router.navigate(['/' + page]);
  }

  goToPagewithParam(page, data) {
    this.router.navigate(['/' + page, { data: data }]);
  }

  goBack() {
    this._location.back()
  }

  toggleMenu() {
    this.menu.toggle();
  }

  swapArray(Array: any, Swap1: number, Swap2: number): any {
    var temp = Array[Swap1].img;
    Array[Swap1].img = Array[Swap2].img
    Array[Swap2].img = temp
    return Array;
  }

  randomLatLng(latitude, longitude, radiusInMeters = 200) {

    var getRandomCoordinates = function (radius, uniform) {
      // Generate two random numbers
      var a = Math.random(),
        b = Math.random();

      // Flip for more uniformity.
      if (uniform) {
        if (b < a) {
          var c = b;
          b = a;
          a = c;
        }
      }

      // It's all triangles.
      return [
        b * radius * Math.cos(2 * Math.PI * a / b),
        b * radius * Math.sin(2 * Math.PI * a / b)
      ];
    };

    var randomCoordinates = getRandomCoordinates(radiusInMeters, true);

    // Earths radius in meters via WGS 84 model.
    var earth = 6378137;

    // Offsets in meters.
    var northOffset = randomCoordinates[0],
      eastOffset = randomCoordinates[1];

    // Offset coordinates in radians.
    var offsetLatitude = northOffset / earth,
      offsetLongitude = eastOffset / (earth * Math.cos(Math.PI * (latitude / 180)));

    // Offset position in decimal degrees.
    return {
      lat: latitude + (offsetLatitude * (180 / Math.PI)),
      lng: longitude + (offsetLongitude * (180 / Math.PI))
    }
  };

  getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

}