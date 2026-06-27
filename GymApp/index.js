/**
 * @format
 */

import { AppRegistry } from 'react-native';
import notifee from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';

// Required by notifee. Taps that cold-start the app are handled via
// getInitialNotification() inside the app; this just satisfies the handler.
notifee.onBackgroundEvent(async () => {});

AppRegistry.registerComponent(appName, () => App);
