import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as SQLite from 'expo-sqlite';
import { useTheme as usePaperTheme, Menu, Divider, Button } from 'react-native-paper';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
// Import the theme context from a relative path rather than using the @ alias.
import { useTheme } from '../../hooks/themeContext';

/**
 * Type definition for a single student row in the database. The field names
 * mirror the column names in the mahasiswa table. All numeric values are
 * stored as numbers rather than strings.
 */
interface Student {
  id: number;
  nama: string;
  nim: string;
  matkul: string;
  tb1: number;
  tb2: number;
  uas: number;
}

// Open the shared database. All screens use the same file name so that
// students and settings live in one place. The sync API returns a
// connection that exposes async methods like runAsync() and getAllAsync().
const db = SQLite.openDatabaseSync('nilaiMahasiswa.db');

/**
 * Compute the final numeric score based on the weightings of TB1, TB2 and
 * UAS. TB1 and TB2 contribute 30% each and UAS 40%. If any value is
 * undefined the result will be NaN.
 */
function calculateFinalScore(tb1: number, tb2: number, uas: number): number {
  return tb1 * 0.3 + tb2 * 0.3 + uas * 0.4;
}

/**
 * Convert a numeric score into a letter grade according to the provided
 * grading scheme. Values outside the defined ranges default to 'D'.
 */
function scoreToGrade(score: number): string {
  if (score >= 80) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 69) return 'B';
  if (score >= 65) return 'C+';
  if (score >= 56) return 'C';
  return 'D';
}

/**
 * Mapping of letter grades to colours used in the UI. These colours are
 * applied to the grade pill and avatar background to visually differentiate
 * between grade ranges. Feel free to adjust these values to better match
 * your desired palette.
 */
const gradeColours: Record<string, { background: string; foreground: string }> = {
  A: { background: '#34A853', foreground: '#FFFFFF' }, // green
  'B+': { background: '#3F6CD8', foreground: '#FFFFFF' }, // blue
  B: { background: '#F6C026', foreground: '#000000' }, // yellow
  'C+': { background: '#D97706', foreground: '#FFFFFF' }, // orange
  C: { background: '#E69B02', foreground: '#FFFFFF' }, // light orange
  D: { background: '#D82C20', foreground: '#FFFFFF' }, // red
  default: { background: '#666666', foreground: '#FFFFFF' },
};

/**
 * Primary component for the students tab. Displays a list of all student
 * records from the database with support for searching, filtering, editing
 * and deleting. Pagination controls at the bottom let the user decide how
 * many items to show per page.
 */
export default function StudentsScreen() {
  const paperTheme = usePaperTheme();
  const { theme, toggleTheme } = useTheme();
  const colours = paperTheme.colors;

  // State for the raw student data and derived lists
  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('Semua Grade');
  const [courseFilter, setCourseFilter] = useState<string>('Semua Program Studi');
  const [courseOptions, setCourseOptions] = useState<string[]>([]);
  // Pagination state
  const [itemsPerPage, setItemsPerPage] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPageOptions = [5, 10, 20];

  // Menu visibility state
  const [gradeMenuVisible, setGradeMenuVisible] = useState(false);
  const [courseMenuVisible, setCourseMenuVisible] = useState(false);
  const [itemsMenuVisible, setItemsMenuVisible] = useState(false);

  // Edit modal state
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);

  /**
   * Initialise the students table if it hasn't already been created and
   * optionally add a unique index on the NIM field to enforce uniqueness.
   */
  const prepareDatabase = useCallback(async () => {
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
      // Ensure NIM remains unique. If the index exists this statement is a no-op.
      await db.execAsync(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_mahasiswa_nim ON mahasiswa (nim);'
      );
    } catch (error) {
      console.warn('Error initialising mahasiswa table', error);
    }
  }, []);

  /**
   * Load all students from the database and update local state. Also update
   * the list of course filter options based on unique values present.
   */
  const loadStudents = useCallback(async () => {
    try {
      const rows = await db.getAllAsync<Student>('SELECT * FROM mahasiswa ORDER BY id DESC');
      setStudents(rows);
      // Deduce unique course names for the filter dropdown. Use matkul field
      const uniqueCourses = Array.from(new Set(rows.map((s) => s.matkul))).sort();
      setCourseOptions(uniqueCourses);
    } catch (error) {
      console.warn('Failed to load students', error);
    }
  }, []);

  // On first render, prepare the database and load existing students
  useEffect(() => {
    (async () => {
      await prepareDatabase();
      await loadStudents();
    })();
  }, [prepareDatabase, loadStudents]);

  /**
   * Compute the filtered and sorted list of students based on the search query
   * and selected grade/course filters. The search matches on name, nim and
   * course in a case-insensitive manner. Filtering is done entirely in
   * JavaScript to avoid complicating the SQL query.
   */
  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      const matchesSearch =
        query.length === 0 ||
        s.nama.toLowerCase().includes(query) ||
        s.nim.toLowerCase().includes(query) ||
        s.matkul.toLowerCase().includes(query);
      const score = calculateFinalScore(s.tb1, s.tb2, s.uas);
      const grade = scoreToGrade(score);
      const matchesGrade = gradeFilter === 'Semua Grade' || gradeFilter === grade;
      const matchesCourse =
        courseFilter === 'Semua Program Studi' || courseFilter === s.matkul;
      return matchesSearch && matchesGrade && matchesCourse;
    });
  }, [students, searchQuery, gradeFilter, courseFilter]);

  // Compute pagination details. Whenever the list of filtered students or
  // itemsPerPage changes ensure that the current page remains valid.
  const totalFiltered = filteredStudents.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / itemsPerPage));
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);
  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredStudents.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredStudents, currentPage, itemsPerPage]);

  /**
   * Trigger the deletion of a student record after user confirmation. The
   * Alert API from React Native provides a blocking confirm dialog on both
   * platforms. On success reload the student list.
   */
  const handleDeleteStudent = (studentId: number) => {
    Alert.alert(
      'Hapus Data Mahasiswa',
      'Apakah Anda yakin ingin menghapus data mahasiswa ini? Tindakan ini tidak dapat dibatalkan.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.runAsync('DELETE FROM mahasiswa WHERE id = ?', [studentId]);
              await loadStudents();
            } catch (error) {
              console.warn('Failed to delete student', error);
            }
          },
        },
      ]
    );
  };

  /**
   * Open the edit modal for a specific student. Pass the full student object
   * into the modal for editing. The modal is closed automatically after
   * saving or cancelling.
   */
  const handleEditStudent = (student: Student) => {
    setEditingStudent(student);
    setEditModalVisible(true);
  };

  /**
   * Save handler passed into the edit modal. After updating the student in
   * the database reload the list and hide the modal.
   */
  const handleSaveEditedStudent = async (student: Student) => {
    try {
      await db.runAsync(
        'UPDATE mahasiswa SET nama = ?, nim = ?, matkul = ?, tb1 = ?, tb2 = ?, uas = ? WHERE id = ?',
        [student.nama, student.nim, student.matkul, student.tb1, student.tb2, student.uas, student.id]
      );
      await loadStudents();
      setEditModalVisible(false);
      setEditingStudent(null);
    } catch (error) {
      console.warn('Failed to update student', error);
    }
  };

  // Grade options for the filter menu
  const gradeOptions = ['Semua Grade', 'A', 'B+', 'B', 'C+', 'C', 'D'];
  // Compose course options array with an "All Courses" option at the top
  const courseOptionsWithAll = useMemo(() => ['Semua Program Studi', ...courseOptions], [courseOptions]);

  // Derive colours for background and text based on the current paper theme
  const backgroundColor = colours.background;
  const surfaceColor = colours.elevation?.level2 ?? colours.surface;
  const cardColor = colours.elevation?.level3 ?? colours.surface;
  const textColor = colours.onSurface;
  const placeholderColor = colours.onSurfaceVariant ?? '#888888';

  return (
    <View style={[styles.container, { backgroundColor }]}>\
      {/* Custom header. Displays the app title and theme toggle icons */}
      <View style={styles.headerContainer}>
        <Text style={[styles.headerTitle, { color: colours.primary }]}>Pengelola Nilai</Text>
        <View style={styles.headerIcons}>
          {/* Theme toggle */}
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

      {/* Section title and result count */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>Data Mahasiswa</Text>
        <View style={styles.resultCountContainer}>
          <Text style={{ color: textColor, fontSize: 12 }}>{`${totalFiltered} dari ${students.length}`}</Text>
        </View>
      </View>

      {/* Search bar */}
      <View style={[styles.searchContainer, { backgroundColor: surfaceColor }]}>\
        <MaterialCommunityIcons
          name="magnify"
          size={18}
          color={placeholderColor}
          style={{ marginHorizontal: 8 }}
        />
        <TextInput
          value={searchQuery}
          onChangeText={(text) => {
            setSearchQuery(text);
            setCurrentPage(1);
          }}
          placeholder="Cari berdasarkan nama, NIM, atau program studi..."
          placeholderTextColor={placeholderColor}
          style={[styles.searchInput, { color: textColor }]}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
            <MaterialIcons name="close" size={16} color={placeholderColor} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter section */}
      <View style={[styles.filtersContainer, { backgroundColor: surfaceColor }]}>\
        <View style={styles.filtersHeader}>
          <MaterialCommunityIcons
            name="filter-variant"
            size={18}
            color={textColor}
            style={{ marginRight: 4 }}
          />
          <Text style={[styles.filtersTitle, { color: textColor }]}>Filter</Text>
          {/* Clear all filters button */}
          {(gradeFilter !== 'All Grades' || courseFilter !== 'All Courses') && (
            <TouchableOpacity
              onPress={() => {
                setGradeFilter('Semua Grade');
                setCourseFilter('Semua Program Studi');
              }}
              style={styles.clearFiltersButton}
            >
              <Text style={{ color: colours.primary, fontSize: 12 }}>Reset</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* Dropdowns for grade and course */}
        <View style={styles.dropdownRow}>
          {/* Grade dropdown */}
          <Menu
            visible={gradeMenuVisible}
            onDismiss={() => setGradeMenuVisible(false)}
            anchor={
              <TouchableOpacity
                onPress={() => setGradeMenuVisible(true)}
                style={[styles.dropdownButton, { backgroundColor: cardColor }]}
              >
                <Text style={{ color: textColor, fontSize: 14 }}>{gradeFilter}</Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={16}
                  color={textColor}
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>
            }
          >
            {gradeOptions.map((grade) => (
              <Menu.Item
                key={grade}
                onPress={() => {
                  setGradeFilter(grade);
                  setGradeMenuVisible(false);
                  setCurrentPage(1);
                }}
                title={grade}
              />
            ))}
          </Menu>
          {/* Course dropdown */}
          <Menu
            visible={courseMenuVisible}
            onDismiss={() => setCourseMenuVisible(false)}
            anchor={
              <TouchableOpacity
                onPress={() => setCourseMenuVisible(true)}
                style={[styles.dropdownButton, { backgroundColor: cardColor }]}
              >
                <Text style={{ color: textColor, fontSize: 14 }}>{courseFilter}</Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={16}
                  color={textColor}
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>
            }
          >
            {courseOptionsWithAll.map((course) => (
              <Menu.Item
                key={course}
                onPress={() => {
                  setCourseFilter(course);
                  setCourseMenuVisible(false);
                  setCurrentPage(1);
                }}
                title={course}
              />
            ))}
          </Menu>
        </View>
      </View>

      {/* List of students */}
      <FlatList
        data={paginatedStudents}
        keyExtractor={(item) => item.id.toString()}
        style={{ flex: 1, marginTop: 12 }}
        renderItem={({ item }) => {
          const score = calculateFinalScore(item.tb1, item.tb2, item.uas);
          const grade = scoreToGrade(score);
          const colour = gradeColours[grade] ?? gradeColours.default;
          // Derive initials (use first letters of each name part)
          const names = item.nama.trim().split(/\s+/);
          const initials = names
            .slice(0, 2)
            .map((n) => n.charAt(0).toUpperCase())
            .join('');
          return (
            <View style={[styles.card, { backgroundColor: cardColor }]}>\
              {/* Avatar with initials */}
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: colour.background },
                ]}
              >
                <Text style={[styles.avatarText, { color: colour.foreground }]}>{initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardName, { color: textColor }]}>{item.nama}</Text>
                <Text style={[styles.cardNim, { color: placeholderColor }]}>NIM: {item.nim}</Text>
                <Text style={[styles.cardCourse, { color: placeholderColor }]}>{item.matkul}</Text>
                <View style={styles.cardScoresRow}>
                  <Text style={[styles.cardScoreLabel, { color: placeholderColor }]}>TB1: {item.tb1}</Text>
                  <Text style={[styles.cardScoreLabel, { color: placeholderColor }]}>TB2: {item.tb2}</Text>
                  <Text style={[styles.cardScoreLabel, { color: placeholderColor }]}>UAS: {item.uas}</Text>
                </View>
              </View>
              {/* Grade pill and score */}
              <View style={styles.gradeContainer}>
                <View
                  style={[
                    styles.gradePill,
                    { backgroundColor: colour.background },
                  ]}
                >
                  <Text style={[styles.gradeText, { color: colour.foreground }]}>{grade}</Text>
                </View>
                <Text
                  style={[styles.finalScoreText, { color: colour.background }]}
                >
                  {score.toFixed(1)}
                </Text>
              </View>
              {/* Action buttons */}
              <View style={styles.cardActions}>
                <TouchableOpacity
                  onPress={() => handleEditStudent(item)}
                  style={{ padding: 4 }}
                >
                  <MaterialIcons
                    name="edit"
                    size={18}
                    color={colours.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteStudent(item.id)}
                  style={{ padding: 4 }}
                >
                  <MaterialIcons
                    name="delete"
                    size={18}
                    color={colours.error ?? '#D82C20'}
                  />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={() => (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ color: placeholderColor }}>Tidak ada data mahasiswa.</Text>
          </View>
        )}
      />

      {/* Pagination controls */}
      <View style={[styles.paginationContainer, { backgroundColor: surfaceColor }]}>\
        <TouchableOpacity
          disabled={currentPage === 1}
          onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
          style={styles.paginationButton}
        >
          <MaterialIcons
            name="chevron-left"
            size={20}
            color={currentPage === 1 ? placeholderColor : colours.primary}
          />
        </TouchableOpacity>
        <Text style={{ color: textColor, fontSize: 14 }}>{`${currentPage} dari ${totalPages}`}</Text>
        <TouchableOpacity
          disabled={currentPage >= totalPages}
          onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          style={styles.paginationButton}
        >
          <MaterialIcons
            name="chevron-right"
            size={20}
            color={currentPage >= totalPages ? placeholderColor : colours.primary}
          />
        </TouchableOpacity>
        {/* Items per page dropdown */}
        <Menu
          visible={itemsMenuVisible}
          onDismiss={() => setItemsMenuVisible(false)}
          anchor={
            <TouchableOpacity
              onPress={() => setItemsMenuVisible(true)}
              style={[styles.itemsPerPageButton, { backgroundColor: cardColor }]}
            >
              <Text style={{ color: textColor, fontSize: 14 }}>{itemsPerPage} / halaman</Text>
              <MaterialCommunityIcons
                name="chevron-down"
                size={16}
                color={textColor}
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
          }
        >
          {itemsPerPageOptions.map((opt) => (
            <Menu.Item
              key={opt.toString()}
              onPress={() => {
                setItemsPerPage(opt);
                setCurrentPage(1);
                setItemsMenuVisible(false);
              }}
              title={`${opt} per halaman`}
            />
          ))}
        </Menu>
      </View>

      {/* Edit Student Modal */}
      {editingStudent && editModalVisible && (
        <EditStudentModal
          student={editingStudent}
          onDismiss={() => {
            setEditModalVisible(false);
            setEditingStudent(null);
          }}
          onSave={handleSaveEditedStudent}
        />
      )}
    </View>
  );
}

/**
 * Modal component for editing an existing student. It receives the current
 * student object as a prop and exposes callbacks for saving and dismissing.
 */
function EditStudentModal({
  student,
  onDismiss,
  onSave,
}: {
  student: Student;
  onDismiss: () => void;
  onSave: (student: Student) => void;
}) {
  const paperTheme = usePaperTheme();
  const colours = paperTheme.colors;
  const placeholderColor = colours.onSurfaceVariant ?? '#888888';
  const [name, setName] = useState(student.nama);
  const [nim, setNim] = useState(student.nim);
  const [course, setCourse] = useState(student.matkul);
  const [tb1, setTb1] = useState(student.tb1.toString());
  const [tb2, setTb2] = useState(student.tb2.toString());
  const [uas, setUas] = useState(student.uas.toString());
  const [nimError, setNimError] = useState('');

  /**
   * Sanitize and update numeric inputs. Removes leading zeros and restricts
   * values to the 0–100 range. Non-numeric characters are ignored.
   */
  const handleNumericChange = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    // Remove any non-digit characters
    let sanitized = value.replace(/[^0-9]/g, '');
    // Strip leading zeros
    sanitized = sanitized.replace(/^0+(?=\d)/, '');
    // Restrict to max of 3 digits (0-100)
    if (sanitized.length > 3) sanitized = sanitized.slice(0, 3);
    // Limit to 100
    const num = parseInt(sanitized || '0', 10);
    if (num > 100) sanitized = '100';
    setter(sanitized);
  };

  // Compute final score and grade for preview
  const finalScore = useMemo(() => {
    const t1 = parseFloat(tb1) || 0;
    const t2 = parseFloat(tb2) || 0;
    const u = parseFloat(uas) || 0;
    return calculateFinalScore(t1, t2, u);
  }, [tb1, tb2, uas]);
  const finalGrade = useMemo(() => scoreToGrade(finalScore), [finalScore]);
  const gradeColour = gradeColours[finalGrade] ?? gradeColours.default;

  /**
   * Validate inputs before saving. Checks that all fields are filled, numeric
   * scores are within range and the NIM is either unchanged or unique. If
   * validation passes the onSave callback is invoked with the updated
   * student.
   */
  const handleSave = async () => {
    // Basic presence validation
    if (!name || !nim || !course || !tb1 || !tb2 || !uas) {
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
      // Check NIM uniqueness if changed
      if (nim !== student.nim) {
        const existing = await db.getAllAsync<Student>('SELECT * FROM mahasiswa WHERE nim = ?', [nim]);
        if (existing.length > 0) {
          setNimError('NIM sudah terdaftar');
          return;
        }
      }
      setNimError('');
      onSave({ id: student.id, nama: name, nim, matkul: course, tb1: t1, tb2: t2, uas: u });
    } catch (err) {
      console.warn('Error validating NIM', err);
    }
  };

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: colours.background }]}>\
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colours.primary }]}>Edit Student</Text>
            <TouchableOpacity onPress={onDismiss} style={{ padding: 4 }}>
              <MaterialIcons name="close" size={20} color={colours.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalSection}>
            <View style={styles.modalSectionHeader}>
              <MaterialCommunityIcons
                name="account"
                size={18}
                color={colours.primary}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.modalSectionTitle, { color: colours.primary }]}>Informasi Mahasiswa</Text>
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nama mahasiswa"
              placeholderTextColor={placeholderColor}
              style={[styles.modalInput, { color: colours.onSurface, borderColor: colours.outline }]}
            />
            <TextInput
              value={nim}
              onChangeText={setNim}
              placeholder="NIM"
              placeholderTextColor={placeholderColor}
              keyboardType="numeric"
              style={[styles.modalInput, { color: colours.onSurface, borderColor: colours.outline }]}
            />
            {nimError ? (
              <Text style={{ color: colours.error, fontSize: 12, marginBottom: 4 }}>{nimError}</Text>
            ) : null}
            <TextInput
              value={course}
              onChangeText={setCourse}
              placeholder="Program studi"
              placeholderTextColor={placeholderColor}
              style={[styles.modalInput, { color: colours.onSurface, borderColor: colours.outline }]}
            />
          </View>
          <View style={styles.modalSection}>
            <View style={styles.modalSectionHeader}>
              <MaterialCommunityIcons
                name="clipboard-text"
                size={18}
                color={colours.primary}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.modalSectionTitle, { color: colours.primary }]}>Nilai Ujian</Text>
            </View>
            <TextInput
              value={tb1}
              onChangeText={(text) => handleNumericChange(text, setTb1)}
              placeholder="Nilai TB1 (0-100)"
              placeholderTextColor={placeholderColor}
              keyboardType="numeric"
              style={[styles.modalInput, { color: colours.onSurface, borderColor: colours.outline }]}
            />
            <TextInput
              value={tb2}
              onChangeText={(text) => handleNumericChange(text, setTb2)}
              placeholder="Nilai TB2 (0-100)"
              placeholderTextColor={placeholderColor}
              keyboardType="numeric"
              style={[styles.modalInput, { color: colours.onSurface, borderColor: colours.outline }]}
            />
            <TextInput
              value={uas}
              onChangeText={(text) => handleNumericChange(text, setUas)}
              placeholder="Nilai UAS (0-100)"
              placeholderTextColor={placeholderColor}
              keyboardType="numeric"
              style={[styles.modalInput, { color: colours.onSurface, borderColor: colours.outline }]}
            />
          </View>
          <View style={styles.modalSection}>
            <View style={styles.modalSectionHeader}>
              <MaterialCommunityIcons
                name="chart-bar"
                size={18}
                color={colours.primary}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.modalSectionTitle, { color: colours.primary }]}>Preview Nilai</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={[styles.previewScore, { color: colours.primary }]}>{finalScore.toFixed(1)}</Text>
              <Text style={[styles.previewGrade, { color: gradeColour.background }]}>{finalGrade}</Text>
            </View>
            <Text style={{ fontSize: 12, color: placeholderColor }}>
              Formula: (TB1 × 30%) + (TB2 × 30%) + (UAS × 40%)
            </Text>
          </View>
          <View style={styles.modalActions}>
            <Button onPress={onDismiss} mode="outlined" style={{ marginRight: 8 }}>
              Batal
            </Button>
            <Button onPress={handleSave} mode="contained">
              Perbarui Mahasiswa
            </Button>
          </View>
        </View>
      </View>
    </Modal>
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  resultCountContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 4,
  },
  filtersContainer: {
    marginTop: 12,
    borderRadius: 8,
    padding: 8,
  },
  filtersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filtersTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  clearFiltersButton: {
    marginLeft: 'auto',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dropdownRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  dropdownButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    marginBottom: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardNim: {
    fontSize: 12,
  },
  cardCourse: {
    fontSize: 12,
    marginBottom: 4,
  },
  cardScoresRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cardScoreLabel: {
    fontSize: 12,
  },
  gradeContainer: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginLeft: 8,
  },
  gradePill: {
    minWidth: 28,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  finalScoreText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#cccccc',
  },
  paginationButton: {
    padding: 4,
    marginHorizontal: 4,
  },
  itemsPerPageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 12,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSection: {
    marginTop: 12,
  },
  modalSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    marginBottom: 8,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginVertical: 4,
  },
  previewScore: {
    fontSize: 24,
    fontWeight: '700',
  },
  previewGrade: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
});