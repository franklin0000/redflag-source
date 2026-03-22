import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.redflag.app',
  appName: 'RedFlag',
  webDir: 'dist',
  server: {
    // App makes API calls to the live Render backend
    // (no local server in production — everything goes over HTTPS)
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#22101f',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#22101f',
      overlaysWebView: false,
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#22101f',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#22101f',
  },
};

export default config;
