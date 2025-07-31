import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import { Provider as PaperProvider, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

// Use relative imports to avoid relying on the @ alias. These point to the
// hooks directory one level up from the app folder.
import { useColorScheme } from '../hooks/useColorScheme';
import { ThemeProvider as AppThemeProvider, useTheme } from '../hooks/themeContext';

export default function RootLayout() {
  // Load any custom fonts. If they aren't loaded yet, we don't render
  // anything. We removed the unused systemColorScheme variable and instead
  // read the system color inside the AppThemeConsumer. Keeping unused
  // variables would cause linter warnings.
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) {
    // Async font loading only occurs in development. Return null until
    // fonts are ready.
    return null;
  }

  return (
    // Wrap the entire app in our ThemeProvider to persist and manage theme
    <AppThemeProvider>
      {/* Consume the theme from our context to choose between light and dark themes */}
      <AppThemeConsumer />
    </AppThemeProvider>
  );
}

/**
 * A helper component used within RootLayout to connect our custom theme
 * context with the navigation and paper providers. Separating this out
 * ensures that hooks are called in the correct order and avoids conditional
 * hooks within the main component. It reads the theme from our context and
 * passes the appropriate theme objects to both navigation and paper.
 */
function AppThemeConsumer() {
  const { theme } = useTheme();
  // Always call useColorScheme at the top of the component. We then compute
  // the final theme based on the persisted preference (if any) and the
  // system setting. This avoids conditionally calling hooks and satisfies
  // React's rules of hooks.
  const systemColor = useColorScheme();
  const finalTheme = theme ?? (systemColor ?? 'light');
  const navigationTheme =
    finalTheme === 'dark' ? NavigationDarkTheme : NavigationDefaultTheme;
  const paperTheme = finalTheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
  return (
    <NavigationThemeProvider value={navigationTheme}>
      <PaperProvider theme={paperTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </PaperProvider>
    </NavigationThemeProvider>
  );
}
