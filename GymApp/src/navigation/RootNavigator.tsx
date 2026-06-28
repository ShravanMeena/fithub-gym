import React, { useCallback, useState } from 'react';
import { ActivityIndicator, View, TouchableOpacity, Text } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { useUI } from '../context/UIContext';
import { navRef } from './ref';
import { Sidebar } from '../components/Sidebar';
import { Icon, IconName } from '../components/Icon';
import { ProfileAPI } from '../api/client';
import { colors, shadow } from '../theme';

import OrgSelectScreen from '../screens/OrgSelectScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import TodayScreen from '../screens/TodayScreen';
import DietScreen from '../screens/DietScreen';
import FoodScanScreen from '../screens/FoodScanScreen';
import ProgressScreen from '../screens/ProgressScreen';
import CoachScreen from '../screens/CoachScreen';
import FeedScreen from '../screens/FeedScreen';
import ProfileScreen from '../screens/ProfileScreen';
import RemindersScreen from '../screens/RemindersScreen';
import WorkoutScreen from '../screens/WorkoutScreen';
import AttendanceScreen from '../screens/AttendanceScreen';
import ChallengesScreen from '../screens/ChallengesScreen';
import ReferralScreen from '../screens/ReferralScreen';

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.card, text: colors.text, border: colors.border, primary: colors.primary },
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const tabIcon = (name: IconName) => ({ color }: { color: string }) => <Icon name={name} color={color} size={24} />;

// Raised, accent center button for the priority action: Scan a meal.
function ScanTabButton({ onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start' }}>
      <View style={[{ top: -18, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.bg }, shadow]}>
        <Icon name="scan" color="#fff" size={26} />
      </View>
      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800', top: -14 }}>Scan</Text>
    </TouchableOpacity>
  );
}

// Hamburger that opens the sidebar.
function MenuButton() {
  const { openSidebar } = useUI();
  return (
    <TouchableOpacity onPress={openSidebar} style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
      <Icon name="menu" color={colors.text} size={24} />
    </TouchableOpacity>
  );
}

// 5 clear tabs that map to the daily loop.
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.text,
        headerLeft: () => <MenuButton />,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 62, paddingBottom: 8, paddingTop: 6 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textDim,
      }}>
      <Tab.Screen name="Today" component={TodayScreen} options={{ tabBarIcon: tabIcon('home') }} />
      <Tab.Screen name="Diet" component={DietScreen} options={{ tabBarIcon: tabIcon('diet') }} />
      <Tab.Screen
        name="Scan"
        component={FoodScanScreen}
        options={{ title: 'Scan Food', tabBarButton: (props) => <ScanTabButton {...props} /> }}
      />
      <Tab.Screen name="Community" component={FeedScreen} options={{ tabBarIcon: tabIcon('feed') }} />
      <Tab.Screen name="Progress" component={ProgressScreen} options={{ tabBarIcon: tabIcon('progress') }} />
    </Tab.Navigator>
  );
}

// Gate that decides between first-run onboarding and the main app, based on
// whether the member has set up their profile/targets yet.
function AppGate() {
  const [state, setState] = useState<'loading' | 'onboard' | 'app'>('loading');

  const check = useCallback(() => {
    ProfileAPI.get()
      .then(({ profile, targets }) => {
        const ready = !!targets && !!profile?.weight_kg && !!profile?.goal;
        setState(ready ? 'app' : 'onboard');
      })
      .catch(() => setState('app')); // don't trap the user if the check fails
  }, []);

  React.useEffect(() => { check(); }, [check]);

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  if (state === 'onboard') return <OnboardingScreen onDone={() => setState('app')} />;
  return <MainTabs />;
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  const { org, loading: orgLoading } = useOrg();

  if (loading || orgLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer theme={navTheme} ref={navRef}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.card },
            headerTitleStyle: { color: colors.text },
            headerTintColor: colors.text,
          }}>
          {user ? (
            <>
              <Stack.Screen name="Main" component={AppGate} options={{ headerShown: false }} />
              <Stack.Screen name="Workout" component={WorkoutScreen} options={{ title: 'Log Workout' }} />
              <Stack.Screen name="Coach" component={CoachScreen} options={{ title: 'AI Coach' }} />
              <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
              <Stack.Screen name="Reminders" component={RemindersScreen} options={{ title: 'Reminders' }} />
              <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile & Goals' }} />
              <Stack.Screen name="Challenges" component={ChallengesScreen} options={{ title: 'Leaderboard' }} />
              <Stack.Screen name="Referral" component={ReferralScreen} options={{ title: 'Share & Earn' }} />
            </>
          ) : !org ? (
            <Stack.Screen name="OrgSelect" component={OrgSelectScreen} options={{ headerShown: false }} />
          ) : (
            <>
              <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <Sidebar />
    </View>
  );
}
