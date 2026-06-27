/**
 * @format
 */

import { AppRegistry } from 'react-native';
import notifee from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerBackgroundPushHandler } from './src/notifications/push';

// Required by notifee. Taps that cold-start the app are handled via
// getInitialNotification() inside the app; this just satisfies the handler.
notifee.onBackgroundEvent(async () => {});

// FCM background/quit handler (must be registered at module load).
registerBackgroundPushHandler();

AppRegistry.registerComponent(appName, () => App);
