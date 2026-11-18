import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  buildAssessmentWorkbook,
  IDENTITAS_HEADERS,
  TEMPLATE_VERSION,
} from '../src/utils/excelTemplate';
import {
  ImportValidationContext,
  validateWorkbookBuffer,
} from '../src/utils/excelImportEngine';
import { SchoolClass, Student, AcademicPeriod } from '../src/types/siakhlak';
import { resolveIndicatorScore } from '../src/utils/scoreValidation';

const mockStudent: Student = {
  id: 'stu_01',
  nis: '12345',
  nisn: '0012345',
  name: 'Ahmad Dahlan',
  full_name: 'Ahmad Dahlan',
  gender: 'L',
  classId: 'cls_4a',
  className: '4A',
  unitCode: 'SD',
  education_level: 'SD',
  status: 'ACTIVE',
  cohort_id: 'COHORT-2025',
};

const mockClass: SchoolClass = {
  id: 'cls_4a',
  name: '4A',
  className: '4A',
  unitCode: 'SD',
  educationLevel: 'SD',
  level: 'SD',
  homeroomTeacherName: 'Ustadzah Fatimah',
  studentCount: 30,
  academicYearId: 'ay_2526',
  semesterId: 'sem_1',
};

const mockPeriod: AcademicPeriod = {
  id: 'per_1',
  name: 'Semester Ganjil 2025/2026',
  year: '2025/2026',
  semester: 'Ganjil',
  isActive: true,
  createdBy: 'admin_test',
};

function createContext(): ImportValidationContext {
  return {
    selectedClass: mockClass,
    selectedPeriod: mockPeriod,
    allStudents: [mockStudent],
    existingAssessments: [],
    batchSeenKeys: new Set<string>(),
  };
}

console.log('=== RUNNING EXCEL VERSIONING & WORKBOOK INTEGRITY TESTS ===');

// 1. Generates and imports v1.0-legacy workbook with correct metadata provenance
const wb1 = buildAssessmentWorkbook({
  student: mockStudent,
  schoolClass: mockClass,
  period: mockPeriod,
  assessmentMonth: 'Oktober',
  assessmentYear: '2025',
  teacherIdentifier: 'guru@alchasanah.sch.id',
  cohortName: 'Angkatan 2025',
  instrumentVersion: 'v1.0-legacy',
});
const wsPen1 = wb1.Sheets['PENILAIAN'];
wsPen1['B2'] = { t: 'n', v: 4 };

const buf1 = XLSX.write(wb1, { type: 'buffer', bookType: 'xlsx' });
const preview1 = validateWorkbookBuffer(buf1, 'Ahmad_v1.xlsx', createContext());

assert.strictEqual(preview1.status, 'VALID');
assert.strictEqual(preview1.errors.length, 0);
assert.strictEqual(preview1.instrumentVersion, 'v1.0-legacy');
assert.strictEqual(preview1.identitas?.instrumentVersion, 'v1.0-legacy');
assert.strictEqual(preview1.scores['P01'], 4);
assert.strictEqual(preview1.scores['P1'], 4);
console.log('PASS 1: Generates and imports v1.0-legacy workbook with correct provenance.');

// 2. Generates and imports v2.0-canonical workbook in emulator mode
const wb2 = buildAssessmentWorkbook({
  student: mockStudent,
  schoolClass: mockClass,
  period: mockPeriod,
  assessmentMonth: 'November',
  assessmentYear: '2025',
  teacherIdentifier: 'guru@alchasanah.sch.id',
  cohortName: 'Angkatan 2025',
  instrumentVersion: 'v2.0-canonical',
});
const wsPen2 = wb2.Sheets['PENILAIAN'];
wsPen2['B2'] = { t: 'n', v: 3 };

const buf2 = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' });
const preview2 = validateWorkbookBuffer(buf2, 'Ahmad_v2.xlsx', createContext());

assert.strictEqual(preview2.status, 'VALID');
assert.strictEqual(preview2.errors.length, 0);
assert.strictEqual(preview2.instrumentVersion, 'v2.0-canonical');
assert.strictEqual(preview2.identitas?.instrumentVersion, 'v2.0-canonical');
assert.strictEqual(preview2.scores['P01'], 3);
console.log('PASS 2: Generates and imports v2.0-canonical workbook in emulator mode.');

// 3. Rejects workbook with unknown instrument version
const wb3 = buildAssessmentWorkbook({
  student: mockStudent,
  schoolClass: mockClass,
  period: mockPeriod,
  assessmentMonth: 'Desember',
  assessmentYear: '2025',
  teacherIdentifier: 'guru@alchasanah.sch.id',
  cohortName: 'Angkatan 2025',
});
const wsId3 = wb3.Sheets['IDENTITAS_PENILAIAN'];
wsId3['P2'] = { t: 's', v: 'v9.9-unauthorized' };

const buf3 = XLSX.write(wb3, { type: 'buffer', bookType: 'xlsx' });
const preview3 = validateWorkbookBuffer(buf3, 'Ahmad_unknown.xlsx', createContext());

assert.strictEqual(preview3.status, 'INVALID');
assert.ok(preview3.errors.some((e) => e.includes('Versi instrumen tidak dikenal pada template Excel')));
console.log('PASS 3: Rejects workbook with unknown instrument version.');

// 4. Backward compatibility: 15-column template without instrument_version defaults to v1.0-legacy
const wb4 = buildAssessmentWorkbook({
  student: mockStudent,
  schoolClass: mockClass,
  period: mockPeriod,
  assessmentMonth: 'Oktober',
  assessmentYear: '2025',
  teacherIdentifier: 'guru@alchasanah.sch.id',
});
const wsPen4 = wb4.Sheets['PENILAIAN'];
wsPen4['B2'] = { t: 'n', v: 4 };

// Delete cell P1 and P2 (the 16th column) to simulate legacy 15-column template
const wsId4 = wb4.Sheets['IDENTITAS_PENILAIAN'];
delete wsId4['P1'];
delete wsId4['P2'];
wsId4['!ref'] = 'A1:O2';

const buf4 = XLSX.write(wb4, { type: 'buffer', bookType: 'xlsx' });
const preview4 = validateWorkbookBuffer(buf4, 'Legacy_15col.xlsx', createContext());

assert.strictEqual(preview4.status, 'VALID');
assert.strictEqual(preview4.instrumentVersion, 'v1.0-legacy');
assert.strictEqual(preview4.identitas?.instrumentVersion, 'v1.0-legacy');
console.log('PASS 4: 15-column template without instrument_version defaults to v1.0-legacy.');

// 5. Detects and reports conflicting alias scores when P01 != P1
const wb5 = buildAssessmentWorkbook({
  student: mockStudent,
  schoolClass: mockClass,
  period: mockPeriod,
  assessmentMonth: 'Oktober',
  assessmentYear: '2025',
  teacherIdentifier: 'guru@alchasanah.sch.id',
});
const buf5 = XLSX.write(wb5, { type: 'buffer', bookType: 'xlsx' });
const preview5 = validateWorkbookBuffer(buf5, 'Conflict_test.xlsx', createContext());

preview5.scores['P01'] = 4;
preview5.scores['P1'] = 2; // Conflict!

const result5 = resolveIndicatorScore(preview5.scores, 1);
assert.strictEqual(result5.status, 'CONFLICT_ALIAS');
assert.strictEqual(result5.value, null);
console.log('PASS 5: Detects and reports conflicting alias scores.');

console.log('=== ALL EXCEL VERSIONING & WORKBOOK INTEGRITY TESTS PASSED ===');
