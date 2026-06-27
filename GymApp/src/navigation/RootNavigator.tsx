import React from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { useUI } from '../context/UIContext';
import { navRef } from './ref';
import { Sidebar } from '../components/Sidebar';
import { Icon, IconName } from '../components/Icon';
import { colors } from '../theme';

import OrgSelectScreen from '../screens/OrgSelectScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import HomeScreen from '../screens/HomeScreen';
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

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.card, text: colors.text, border: colors.border, primary: colors.primary },
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const tabIcon = (name: IconName) => ({ color }: { color: string }) => <Icon name={name} color={color} size={24} />;

// Hamburger that opens the sidebar.
function MenuButton() {
  const { openSidebar } = useUI();
  return (
    <TouchableOpacity onPress={openSidebar} style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
      <Icon name="menu" color={colors.text} size={24} />
    </TouchableOpacity>
  );
}

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
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: tabIcon('home') }} />
      <Tab.Screen name="Diet" component={DietScreen} options={{ tabBarIcon: tabIcon('diet') }} />
      <Tab.Screen name="Scan" component={FoodScanScreen} options={{ title: 'Scan Food', tabBarIcon: tabIcon('scan') }} />
      <Tab.Screen name="Feed" component={FeedScreen} options={{ tabBarIcon: tabIcon('feed') }} />
    </Tab.Navigator>
  );
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
              <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
              <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile & Goals' }} />
              <Stack.Screen name="Reminders" component={RemindersScreen} options={{ title: 'Reminders' }} />
              <Stack.Screen name="Workout" component={WorkoutScreen} options={{ title: 'Workout' }} />
              <Stack.Screen name="Progress" component={ProgressScreen} options={{ title: 'Progress' }} />
              <Stack.Screen name="Coach" component={CoachScreen} options={{ title: 'AI Coach' }} />
              <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Attendance' }} />
              <Stack.Screen name="Challenges" component={ChallengesScreen} options={{ title: 'Leaderboard' }} />
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
