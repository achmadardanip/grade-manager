import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SQLite from 'expo-sqlite';

/**
 * Theme context to manage light/dark mode across the entire application.
 *
 * The theme preference is stored persistently in the SQLite database. When the
 * application loads it will check for an existing setting and apply it; if
 * none exists then it falls back to the device default. Calling
 * `toggleTheme()` will flip between light and dark and persist the choice.
 */

// Shape of our context value
interface ThemeContextValue {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

// Create a context with sensible defaults. Consumers should never use
// undefined values since we provide a default implementation.
const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
});

// Open the database synchronously. Using the next generation SQLite API
// available in expo-sqlite we can perform asynchronous queries on top of a
// synchronous database connection. The database is shared with the student
// management tables so that we only maintain a single database file.
const db = SQLite.openDatabaseSync('nilaiMahasiswa.db');

/**
 * Provider component that should wrap the root of the application. It
 * initialises the database table for storing settings (if needed), reads
 * the persisted theme on mount, and exposes a method to toggle between
 * light and dark mode.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // On mount initialise the settings table and read any existing theme
  useEffect(() => {
    (async () => {
      try {
        // Create a simple settings table with a single row identified by id=1.
        // Using TEXT for the theme so that we can store 'light' or 'dark'.
        await db.execAsync(
          `CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            theme TEXT
          );`
        );
        // Query the existing theme. getAllAsync returns an array of rows.
        const rows = await db.getAllAsync<{ theme: string }>(
          'SELECT theme FROM settings WHERE id = 1'
        );
        if (rows.length > 0) {
          const savedTheme = rows[0].theme as 'light' | 'dark' | undefined;
          if (savedTheme === 'dark' || savedTheme === 'light') {
            setTheme(savedTheme);
          }
        }
      } catch (err) {
        console.warn('Failed to read theme from database', err);
      }
    })();
  }, []);

  // Toggle between light and dark. Persist the new value into the settings
  // table. Using INSERT OR REPLACE ensures that there is always at most one
  // row in the table.
  const toggleTheme = async () => {
    const newTheme: 'light' | 'dark' = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    try {
      await db.runAsync('INSERT OR REPLACE INTO settings (id, theme) VALUES (1, ?)', [
        newTheme,
      ]);
    } catch (err) {
      console.warn('Failed to persist theme preference', err);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook for child components to access the theme context. Using this hook
 * provides access to the current theme and a toggle function.
 */
export function useTheme() {
  return useContext(ThemeContext);
}