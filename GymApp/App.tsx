import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { OrgProvider } from './src/context/OrgContext';
import { UIProvider } from './src/context/UIContext';
import { BillingProvider } from './src/context/BillingContext';
import RootNavigator from './src/navigation/RootNavigator';
import { setupPushHandlers } from './src/notifications/push';
import { colors } from './src/theme';

export default function App() {
  // Wire foreground display + notification-tap routing once at startup.
  useEffect(() => {
    setupPushHandlers();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <OrgProvider>
        <AuthProvider>
          <BillingProvider>
            <UIProvider>
              <RootNavigator />
            </UIProvider>
          </BillingProvider>
        </AuthProvider>
      </OrgProvider>
    </SafeAreaProvider>
  );
}
