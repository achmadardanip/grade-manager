import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

// Resolve imports relative to this file instead of using the @ alias. The
// `(tabs)` directory lives under `app`, so we go up two levels to access
// components, constants, and hooks.
import { HapticTab } from '../../components/HapticTab';
import { IconSymbol } from '../../components/ui/IconSymbol';
import TabBarBackground from '../../components/ui/TabBarBackground';
import { Colors } from '../../constants/Colors';
import { useColorScheme } from '../../hooks/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
          },
          default: {},
        }),
      }}>
      {/* First tab shows the list of students */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Students',
          // Use an appropriate icon for the students tab. person.2.fill shows two
          // people which fits the idea of multiple students. See
          // https://developer.apple.com/sf-symbols/ for available names.
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.2.fill" color={color} />, 
        }}
      />
      {/* Second tab shows the add new student form */}
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Add New',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="plus" color={color} />,
        }}
      />
    </Tabs>
  );
}
