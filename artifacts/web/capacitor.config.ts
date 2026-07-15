import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL || undefined;

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID || "com.chowdharymart.app",
  appName: "Chowdhary Mart",
  webDir: "dist/public",
  bundledWebRuntime: false,
  server: serverUrl ? { url: serverUrl, cleartext: true } : undefined,
  android: {
    path: "android",
    buildOptions: {
      releaseType: "APK",
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0757ee",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#0757ee",
    },
    Keyboard: {
      resize: "body",
      style: "dark",
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_chowdhary",
      iconColor: "#0757ee",
      sound: "default",
    },
  },
};

export default config;
