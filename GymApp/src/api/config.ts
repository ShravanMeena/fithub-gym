import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Backend host.
//
// A PHYSICAL device cannot reach "localhost" / "10.0.2.2" — those only work in
// the simulator/emulator. On a real phone the app must hit your computer's LAN
// IP, and the phone must be on the SAME Wi-Fi network as this Mac.
//
// 👉 If your Mac's IP changes (new network / router), update LAN_IP below.
//    Find it with:  ipconfig getifaddr en0
// ---------------------------------------------------------------------------
export const LAN_IP = '192.168.1.15';

// ---------------------------------------------------------------------------
// PRODUCTION: once your server is deployed (GCP), set this to your HTTPS API,
// e.g. 'https://api.yourgym.com/api'. When non-empty it overrides everything
// below — that's what real app-store builds should use.
// ---------------------------------------------------------------------------
export const PROD_API_URL = '';

// Set to true to use the simulator/emulator loopback instead of the LAN IP.
const USE_LOCALHOST = false;

function resolveHost() {
  if (!USE_LOCALHOST) return LAN_IP; // physical device + also works on sim/emulator
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}

export const API_BASE = PROD_API_URL || `http://${resolveHost()}:4000/api`;
