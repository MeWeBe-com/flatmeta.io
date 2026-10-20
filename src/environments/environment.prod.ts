export const environment = {
  production: true,
  apiUrl: 'https://api.flatmeta.io/api/',
  /** Real-time server, proxied by nginx on the API host (deploy/nginx-api.flatmeta.io.conf). */
  socketUrl: 'wss://api.flatmeta.io/ws',
  wsUrl: 'wss://api.flatmeta.io/ws',
  /** Link to the FlatMeta how-to video; the welcome popup hides the link while empty. */
  howToVideoUrl: '',
  fallbackAvatar: 'assets/icon/avatar-default.svg',
  fallbackMarker: 'assets/icon/map-marker.svg',
  fallbackLand: 'assets/icon/placeholder-land.svg'
};
