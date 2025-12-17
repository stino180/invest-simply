import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.eac1ea43e7834ace9ca6eb750745fa83',
  appName: 'StackFlow',
  webDir: 'dist',
  server: {
    url: 'https://eac1ea43-e783-4ace-9ca6-eb750745fa83.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  ios: {
    contentInset: 'automatic'
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
