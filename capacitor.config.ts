import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flatmeta.app',
  appName: 'FlatMeta',
  webDir: 'www',
  server: {
    // The app talks to https://api.flatmeta.io and wss://api.flatmeta.io/ws only; no plain-HTTP traffic.
    androidScheme: 'https',
  },
};

export default config;
