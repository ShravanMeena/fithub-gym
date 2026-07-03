import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE, APP_VERSION } from './config';

export const TOKEN_KEY = 'gym.token';

export const api = axios.create({ baseURL: API_BASE, timeout: 60000 });

// Attach the JWT to every request.
api.interceptors.request.use(async (cfg) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Server origin (without the /api suffix) for building image URLs.
export const SERVER_ORIGIN = API_BASE.replace(/\/api$/, '');

// Build an <Image> source for a protected photo URL (sends the JWT as a header).
export async function authedImageSource(path: string) {
  // Direct GCS signed URL — self-authorizing, served straight from Google (fast).
  if (/^https?:\/\//.test(path)) return { uri: path };
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  return { uri: `${SERVER_ORIGIN}${path}`, headers: { Authorization: `Bearer ${token}` } };
}

// Build a <Video> source. A direct GCS signed URL needs no auth; otherwise pass
// the JWT as a query param (the media route accepts ?token=).
export async function authedVideoSource(path: string) {
  if (/^https?:\/\//.test(path)) return { uri: path };
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  return { uri: `${SERVER_ORIGIN}${path}?token=${token}` };
}

// Surface a clean error message.
export function apiError(err: any): string {
  return (
    err?.response?.data?.error ||
    err?.message ||
    'Something went wrong. Check your connection.'
  );
}

// ---- Typed endpoint helpers ------------------------------------------------
export const AuthAPI = {
  signup: (name: string, email: string, password: string, org_id?: number, phone?: string, referral_code?: string) =>
    api.post('/auth/signup', { name, email, password, org_id, phone, referral_code }).then((r) => r.data),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
  deleteAccount: () => api.delete('/auth/account').then((r) => r.data),
};

export const ReferralAPI = {
  get: () => api.get('/referral').then((r) => r.data),
};

export const OrgAPI = {
  list: () => api.get('/orgs').then((r) => r.data),
  get: (slug: string) => api.get(`/orgs/${slug}`).then((r) => r.data),
};

export const DeviceAPI = {
  register: (token: string, platform: string, orgId?: number) =>
    api.post('/devices/register', { token, platform, orgId, tz_offset: -new Date().getTimezoneOffset() }).then((r) => r.data),
  unregister: (token: string) =>
    api.post('/devices/unregister', { token }).then((r) => r.data),
};

export const AttendanceAPI = {
  status: () => api.get('/attendance').then((r) => r.data),
  stats: () => api.get('/attendance/stats').then((r) => r.data),
  rest: () => api.post('/attendance/rest').then((r) => r.data),
  checkin: () => api.post('/attendance/checkin').then((r) => r.data),
  checkout: (reason?: string) => api.post('/attendance/checkout', { reason }).then((r) => r.data),
  setReason: (id: number, reason: string) => api.put(`/attendance/${id}/reason`, { reason }).then((r) => r.data),
  setFocus: (id: number, focus: string[]) => api.put(`/attendance/${id}/focus`, { focus }).then((r) => r.data),
  crew: () => api.get('/attendance/crew').then((r) => r.data),
  cheer: (userId: number) => api.post(`/attendance/cheer/${userId}`).then((r) => r.data),
};

export const AppAPI = {
  checkUpdate: () =>
    api.get('/app/update', { params: { platform: Platform.OS, version: APP_VERSION } }).then((r) => r.data),
};

export const AnalyticsAPI = {
  // Fire-and-forget; never throws into the app.
  track: (event: string) => { api.post('/analytics/track', { event }).catch(() => {}); },
};

export const MeAPI = {
  week: () => api.get('/me/week').then((r) => r.data),
  badges: () => api.get('/me/badges').then((r) => r.data),
  challenge: () => api.get('/me/challenge').then((r) => r.data),
};

export const PRsAPI = {
  list: () => api.get('/prs').then((r) => r.data),
  add: (lift: string, weight_kg: number, reps: number) => api.post('/prs', { lift, weight_kg, reps }).then((r) => r.data),
  remove: (id: number) => api.delete(`/prs/${id}`).then((r) => r.data),
};

export const WaterAPI = {
  today: () => api.get('/water').then((r) => r.data),
  add: (ml: number) => api.post('/water/add', { ml }).then((r) => r.data),
  setGoal: (goalMl: number) => api.put('/water/goal', { goalMl }).then((r) => r.data),
  history: () => api.get('/water/history').then((r) => r.data),
};

export const ChallengeAPI = {
  leaderboard: (period: 'month' | 'week' = 'month') =>
    api.get('/challenges/leaderboard', { params: { period } }).then((r) => r.data),
};

export const WorkoutAPI = {
  list: () => api.get('/workouts').then((r) => r.data),
  prs: () => api.get('/workouts/prs').then((r) => r.data),
  strength: () => api.get('/workouts/strength').then((r) => r.data),
  create: (body: Record<string, any>) => api.post('/workouts', body).then((r) => r.data),
  remove: (id: number) => api.delete(`/workouts/${id}`).then((r) => r.data),
};

export const FeedAPI = {
  list: (before?: number) => api.get('/feed', { params: before ? { before } : {} }).then((r) => r.data),
  publicFeed: (before?: number) => api.get('/feed/public', { params: before ? { before } : {} }).then((r) => r.data),
  create: (body: Record<string, any>) => api.post('/feed', body, { timeout: 180000 }).then((r) => r.data),
  // Video is uploaded as a streamed multipart file via fetch (React Native sets
  // the multipart boundary natively — reliable on iOS + Android, no base64).
  createVideo: async (uri: string, mediaType: string, content: string | undefined, isPublic: boolean) => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    const form = new FormData();
    form.append('video', { uri, type: mediaType || 'video/mp4', name: 'upload.mp4' } as any);
    if (content) form.append('content', content);
    form.append('is_public', isPublic ? 'true' : 'false');
    // NOTE: do NOT set Content-Type — RN adds "multipart/form-data; boundary=…" itself.
    const resp = await fetch(`${API_BASE}/feed/video`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(t || `Video upload failed (${resp.status})`);
    }
    return resp.json();
  },
  like: (id: number) => api.post(`/feed/${id}/like`).then((r) => r.data),
  unlike: (id: number) => api.delete(`/feed/${id}/like`).then((r) => r.data),
  react: (id: number, reaction: string) => api.post(`/feed/${id}/react`, { reaction }).then((r) => r.data),
  comments: (id: number) => api.get(`/feed/${id}/comments`).then((r) => r.data),
  addComment: (id: number, body: string) => api.post(`/feed/${id}/comments`, { body }).then((r) => r.data),
  remove: (id: number) => api.delete(`/feed/${id}`).then((r) => r.data),
};

export const ProfileAPI = {
  get: () => api.get('/profile').then((r) => r.data),
  update: (patch: Record<string, any>) => api.put('/profile', patch).then((r) => r.data),
  uploadAvatar: (imageBase64: string, mediaType?: string) =>
    api.post('/profile/avatar', { imageBase64, mediaType }).then((r) => r.data),
};

// <Image> source for any user's avatar (sends the JWT as a header).
// `v` busts the image cache after a re-upload (same URL would show the old pic).
export const avatarSource = (userId: number, v?: number) =>
  authedImageSource(`/profile/avatar/${userId}${v ? `?v=${v}` : ''}`);

export const DietAPI = {
  generate: () => api.post('/diet/generate').then((r) => r.data),
  normal: () => api.post('/diet/normal').then((r) => r.data),
  current: () => api.get('/diet/current').then((r) => r.data),
};

export const FoodAPI = {
  estimate: (imageBase64: string, mediaType?: string, note?: string) =>
    api.post('/food/estimate', { imageBase64, mediaType, note }).then((r) => r.data),
  estimateText: (text: string) =>
    api.post('/food/estimate-text', { text }).then((r) => r.data),
  log: (entry: Record<string, any>) => api.post('/food/log', entry).then((r) => r.data),
  today: () => api.get('/food/today').then((r) => r.data),
  day: (date?: string) => api.get('/food/day', { params: date ? { date } : {} }).then((r) => r.data),
  recent: () => api.get('/food/recent').then((r) => r.data),
  remove: (id: number) => api.delete(`/food/log/${id}`).then((r) => r.data),
};

export const ProgressAPI = {
  list: () => api.get('/progress').then((r) => r.data),
  add: (entry: Record<string, any>) => api.post('/progress', entry).then((r) => r.data),
  update: (id: number, entry: Record<string, any>) => api.put(`/progress/${id}`, entry).then((r) => r.data),
  remove: (id: number) => api.delete(`/progress/${id}`).then((r) => r.data),
  coach: (question?: string) => api.post('/progress/coach', { question }).then((r) => r.data),
};

export const PhotoAPI = {
  upload: (imageBase64: string, visibility: 'private' | 'public', mediaType?: string, weight_kg?: number, note?: string) =>
    api.post('/photos', { imageBase64, visibility, mediaType, weight_kg, note }).then((r) => r.data),
  list: () => api.get('/photos').then((r) => r.data),
  setVisibility: (id: number, visibility: 'private' | 'public') =>
    api.put(`/photos/${id}`, { visibility }).then((r) => r.data),
  remove: (id: number) => api.delete(`/photos/${id}`).then((r) => r.data),
  analyze: () => api.post('/photos/analyze').then((r) => r.data),
};

export const NoticeAPI = {
  active: () => api.get('/notices').then((r) => r.data),
  seen: (id: number) => api.post(`/notices/${id}/seen`).then((r) => r.data),
  dismiss: (id: number) => api.post(`/notices/${id}/dismiss`).then((r) => r.data),
  respond: (id: number, response: 'yes' | 'no' | 'ack') => api.post(`/notices/${id}/respond`, { response }).then((r) => r.data),
};

// Minutes this device is ahead of UTC (IST = +330). The server uses this to
// fire each reminder at the user's local time via push.
const tzOffset = () => -new Date().getTimezoneOffset();

export const ReminderAPI = {
  list: () => api.get('/reminders').then((r) => r.data),
  create: (r: Record<string, any>) =>
    api.post('/reminders', { ...r, tz_offset: tzOffset() }).then((res) => res.data),
  update: (id: number, patch: Record<string, any>) =>
    api.put(`/reminders/${id}`, { ...patch, tz_offset: tzOffset() }).then((res) => res.data),
  remove: (id: number) => api.delete(`/reminders/${id}`).then((res) => res.data),
};
