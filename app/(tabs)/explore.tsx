import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as SQLite from 'expo-sqlite';
import { Button, useTheme as usePaperTheme } from 'react-native-paper';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
// Import the theme context from a relative path rather than using the @ alias.
import { useTheme } from '../../hooks/themeContext';

/**
 * Reuse grading helpers from the students screen. If these helpers change
 * there they should be updated here too to maintain consistent grading.
 */
function calculateFinalScore(tb1: number, tb2: number, uas: number): number {
  return tb1 * 0.3 + tb2 * 0.3 + uas * 0.4;
}
function scoreToGrade(score: number): string {
  if (score >= 80) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 69) return 'B';
  if (score >= 65) return 'C+';
  if (score >= 56) return 'C';
  return 'D';
}
const gradeColours: Record<string, { background: string; foreground: string }> = {
  A: { background: '#34A853', foreground: '#FFFFFF' },
  'B+': { background: '#3F6CD8', foreground: '#FFFFFF' },
  B: { background: '#F6C026', foreground: '#000000' },
  'C+': { background: '#D97706', foreground: '#FFFFFF' },
  C: { background: '#E69B02', foreground: '#FFFFFF' },
  D: { background: '#D82C20', foreground: '#FFFFFF' },
  default: { background: '#666666', foreground: '#FFFFFF' },
};

// Open the shared database
const db = SQLite.openDatabaseSync('nilaiMahasiswa.db');

export default function AddStudentScreen() {
  const paperTheme = usePaperTheme();
  const colours = paperTheme.colors;
  const { theme, toggleTheme } = useTheme();

  const [nama, setNama] = useState('');
  const [nim, setNim] = useState('');
  const [matkul, setMatkul] = useState('');
  const [tb1, setTb1] = useState('');
  const [tb2, setTb2] = useState('');
  const [uas, setUas] = useState('');
  const [nimError, setNimError] = useState('');

  // Ensure the mahasiswa table and index exist. Running these statements
  // repeatedly has no harmful effect because of the IF NOT EXISTS clause.
  useEffect(() => {
    (async () => {
      try {
        await db.execAsync(`CREATE TABLE IF NOT EXISTS mahasiswa (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nama TEXT NOT NULL,
            nim TEXT NOT NULL,
            matkul TEXT NOT NULL,
            tb1 REAL NOT NULL,
            tb2 REAL NOT NULL,
            uas REAL NOT NULL
          );`);
        await db.execAsync(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_mahasiswa_nim ON mahasiswa (nim);'
        );
      } catch (err) {
        console.warn('Error preparing database in AddStudentScreen', err);
      }
    })();
  }, []);

  /**
   * Handle numeric input changes. Strips any non-numeric characters, removes
   * leading zeros and ensures the value is within the range 0–100. The
   * sanitized value is passed to the provided setter.
   */
  const handleNumericChange = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    let sanitized = value.replace(/[^0-9]/g, '');
    sanitized = sanitized.replace(/^0+(?=\d)/, '');
    if (sanitized.length > 3) sanitized = sanitized.slice(0, 3);
    const num = parseInt(sanitized || '0', 10);
    if (num > 100) sanitized = '100';
    setter(sanitized);
  };

  // Compute final score and grade preview
  const finalScore = useMemo(() => {
    const t1 = parseFloat(tb1) || 0;
    const t2 = parseFloat(tb2) || 0;
    const u = parseFloat(uas) || 0;
    return calculateFinalScore(t1, t2, u);
  }, [tb1, tb2, uas]);
  const finalGrade = useMemo(() => scoreToGrade(finalScore), [finalScore]);
  const gradeColour = gradeColours[finalGrade] ?? gradeColours.default;

  /**
   * Clear all form fields and reset any validation errors.
   */
  const clearForm = () => {
    setNama('');
    setNim('');
    setMatkul('');
    setTb1('');
    setTb2('');
    setUas('');
    setNimError('');
  };

  /**
   * Validate the form and insert a new student record into the database. If
   * validation fails an error message is shown to the user. On success the
   * form is cleared and a confirmation alert is displayed.
   */
  const handleSaveStudent = async () => {
    if (!nama || !nim || !matkul || !tb1 || !tb2 || !uas) {
      Alert.alert('Peringatan', 'Semua field harus diisi');
      return;
    }
    const t1 = parseFloat(tb1);
    const t2 = parseFloat(tb2);
    const u = parseFloat(uas);
    if (
      isNaN(t1) || isNaN(t2) || isNaN(u) ||
      t1 < 0 || t1 > 100 ||
      t2 < 0 || t2 > 100 ||
      u < 0 || u > 100
    ) {
      Alert.alert('Peringatan', 'Nilai harus angka antara 0 dan 100');
      return;
    }
    try {
      // Check for duplicate NIM
      const existing = await db.getAllAsync<{ nim: string }>(
        'SELECT nim FROM mahasiswa WHERE nim = ?',
        [nim]
      );
      if (existing.length > 0) {
        setNimError('NIM sudah terdaftar');
        return;
      }
      setNimError('');
      // Insert the student into the database
      await db.runAsync(
        'INSERT INTO mahasiswa (nama, nim, matkul, tb1, tb2, uas) VALUES (?, ?, ?, ?, ?, ?)',
        [nama.trim(), nim.trim(), matkul.trim(), t1, t2, u]
      );
      Alert.alert('Berhasil', 'Data mahasiswa berhasil disimpan');
      clearForm();
    } catch (err) {
      console.warn('Error inserting student', err);
      Alert.alert('Error', 'Terjadi kesalahan saat menyimpan data');
    }
  };

  // Derive some colours from the current theme
  const backgroundColor = colours.background;
  const surfaceColor = colours.elevation?.level2 ?? colours.surface;
  const sectionColor = colours.elevation?.level1 ?? colours.surface;
  const textColor = colours.onSurface;
  const placeholderColor = colours.onSurfaceVariant ?? '#888888';

  return (
    <View style={[styles.container, { backgroundColor }]}>\
      {/* Custom header */}
      <View style={styles.headerContainer}>
        <Text style={[styles.headerTitle, { color: colours.primary }]}>Pengelola Nilai</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            onPress={toggleTheme}
            accessibilityLabel="Toggle theme"
            style={styles.iconButton}
          >
            {theme === 'dark' ? (
              <MaterialCommunityIcons name="weather-sunny" size={22} color={colours.primary} />
            ) : (
              <MaterialCommunityIcons name="weather-night" size={22} color={colours.primary} />
            )}
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>\
        {/* Page title */}
        <Text style={[styles.pageTitle, { color: textColor }]}>Tambah Mahasiswa Baru</Text>
        {/* Student Information Section */}
        <View style={[styles.sectionContainer, { backgroundColor: surfaceColor }]}>\
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons
              name="account"
              size={18}
              color={colours.primary}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.sectionTitle, { color: colours.primary }]}>Informasi Mahasiswa</Text>
          </View>
          <TextInput
            value={nama}
            onChangeText={setNama}
            placeholder="Nama mahasiswa"
            placeholderTextColor={placeholderColor}
            style={[styles.input, { color: textColor, borderColor: colours.outline }]}
          />
          <TextInput
            value={nim}
            onChangeText={setNim}
            placeholder="NIM"
            placeholderTextColor={placeholderColor}
            keyboardType="numeric"
            style={[styles.input, { color: textColor, borderColor: colours.outline }]}
          />
          {nimError ? (
            <Text style={{ color: colours.error, fontSize: 12, marginBottom: 4 }}>{nimError}</Text>
          ) : null}
          <TextInput
            value={matkul}
            onChangeText={setMatkul}
            placeholder="Program studi"
            placeholderTextColor={placeholderColor}
            style={[styles.input, { color: textColor, borderColor: colours.outline }]}
          />
        </View>
        {/* Test Scores Section */}
        <View style={[styles.sectionContainer, { backgroundColor: surfaceColor }]}>\
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons
              name="clipboard-text"
              size={18}
              color={colours.primary}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.sectionTitle, { color: colours.primary }]}>Nilai Ujian</Text>
          </View>
          <TextInput
            value={tb1}
            onChangeText={(text) => handleNumericChange(text, setTb1)}
            placeholder="Nilai TB1 (0-100)"
            placeholderTextColor={placeholderColor}
            keyboardType="numeric"
            style={[styles.input, { color: textColor, borderColor: colours.outline }]}
          />
          <TextInput
            value={tb2}
            onChangeText={(text) => handleNumericChange(text, setTb2)}
            placeholder="Nilai TB2 (0-100)"
            placeholderTextColor={placeholderColor}
            keyboardType="numeric"
            style={[styles.input, { color: textColor, borderColor: colours.outline }]}
          />
          <TextInput
            value={uas}
            onChangeText={(text) => handleNumericChange(text, setUas)}
            placeholder="Nilai UAS (0-100)"
            placeholderTextColor={placeholderColor}
            keyboardType="numeric"
            style={[styles.input, { color: textColor, borderColor: colours.outline }]}
          />
        </View>
        {/* Grade Preview Section */}
        <View style={[styles.sectionContainer, { backgroundColor: surfaceColor }]}>\
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons
              name="chart-bar"
              size={18}
              color={colours.primary}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.sectionTitle, { color: colours.primary }]}>Preview Nilai</Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={[styles.previewScore, { color: colours.primary }]}>{finalScore.toFixed(1)}</Text>
            <View
              style={[styles.previewGradeBadge, { backgroundColor: gradeColour.background }]}
            >
              <Text style={[styles.previewGradeText, { color: gradeColour.foreground }]}>{finalGrade}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: placeholderColor }}>
            Formula: (TB1 × 30%) + (TB2 × 30%) + (UAS × 40%)
          </Text>
        </View>
        {/* Buttons */}
        <View style={styles.buttonRow}>
          <Button
            mode="outlined"
            onPress={clearForm}
            style={{ flex: 1, marginRight: 8 }}
          >
            Bersihkan Form
          </Button>
          <Button mode="contained" onPress={handleSaveStudent} style={{ flex: 1 }}>
            Simpan Mahasiswa
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 6,
    marginHorizontal: 4,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginVertical: 8,
  },
  sectionContainer: {
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    marginBottom: 8,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  previewScore: {
    fontSize: 28,
    fontWeight: '700',
  },
  previewGradeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  previewGradeText: {
    fontSize: 20,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 32,
  },
});