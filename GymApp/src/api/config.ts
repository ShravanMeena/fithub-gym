import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Backend URL.
//
// The app talks to the deployed production server by default. To temporarily
// test against a LOCAL backend instead, set PROD_API_URL = '' below and point
// LAN_IP at your Mac's IP (find it with `ipconfig getifaddr en0`).
// ---------------------------------------------------------------------------

// 🌐 Production server (live). This is what real builds use.
export const PROD_API_URL = 'https://fithub.shravanmeena.com/api';

// Local-dev fallback (only used when PROD_API_URL is empty).
export const LAN_IP = '192.168.1.15';
const USE_LOCALHOST = false;
function resolveHost() {
  if (!USE_LOCALHOST) return LAN_IP;
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}

export const API_BASE = PROD_API_URL || `http://${resolveHost()}:4000/api`;
