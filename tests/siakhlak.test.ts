import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import {
  AKHLAK_31_INDICATORS,
  LEGACY_31_INDICATORS,
  CANONICAL_31_INDICATORS,
  INSTRUMENT_DEFINITIONS,
  AcademicPeriod,
  AcademicYearDoc,
  CanonicalRole,
  ClassAssignment,
  ClassStudentHistory,
  DEFAULT_ORGANIZATION_ID,
  defaultPermissionsForRole,
  EDUCATION_LEVELS,
  isAccountActive,
  LOGIN_EDUCATION_LEVEL_OPTIONS,
  loginRouteForPortal,
  matchesEducationLevel,
  normalizeAccountStatus,
  normalizeEducationLevel,
  normalizeRole,
  portalFromLoginRoute,
  SchoolClass,
  Student,
  StudentAssessment,
} from '../src/types/siakhlak';
import {
  buildAssessmentWorkbook,
  buildStudentParentTemplateWorkbook,
  buildTeacherAssignmentAssessmentWorkbook,
  buildTemplateFilename,
  IDENTITAS_HEADERS,
  PENILAIAN_HEADERS,
  REFERENSI_HEADERS,
  STUDENT_PARENT_HEADERS,
  TEACHER_ASSIGNMENT_HEADERS,
  BATCH_PENILAIAN_HEADERS,
  REKAP_PENILAIAN_HEADERS,
  TEMPLATE_VERSION,
} from '../src/utils/excelTemplate';
import {
  computeScaleAveragePct,
  generateErrorReportCsv,
  ImportValidationContext,
  ParsedAssessmentPreview,
  validateAssessmentRevisionInput,
  validateWorkbookBuffer,
  validateStudentParentWorkbookBuffer,
  validateTeacherAssignmentWorkbookBuffer,
  validateBatchAssessmentWorkbookBuffer,
} from '../src/utils/excelImportEngine';
import {
  checkPortalAccess,
  defaultMenuForRole,
  isMenuAuthorizedForRole,
  isProtectedRoutePath,
  isRoutePathAuthorizedForRole,
  parseMasterSubmenuFromRoute,
  parseMenuFromRoute,
  parseStudentSelectionFromUrlSearch,
  parseTeacherSelectionFromUrlSearch,
  routePathForMenu,
} from '../src/utils/portalRouting';
import {
  checkPermanentDeleteEligibility,
  computeStudentPromotionState,
  expandAssignedUnitsForQuery,
  extractUnitsForEducationLevel,
  filterActiveAllowedAcademicYears,
  filterStudentLoginClasses,
  formatFirebaseAuthError,
  normalizeUserProfileDoc,
  validateStudentLoginPlacement,
  validateStudentUniqueness,
  validateTeacherLoginAssignment,
} from '../src/services/siakhlakService';

// --- Local in-memory test fixtures for automated verification ---
const TEST_CLASS: SchoolClass = {
  id: 'cls_sd_4a',
  unitCode: 'SD',
  name: '4A',
  level: '4',
  homeroomTeacherName: 'Ustadz Ahmad',
  studentCount: 2,
};

const OTHER_CLASS: SchoolClass = {
  id: 'cls_smp_7b',
  unitCode: 'SMP',
  name: '7B',
  level: '7',
  homeroomTeacherName: 'Ustadzah Fatimah',
  studentCount: 1,
};

const TEST_PERIOD: AcademicPeriod = {
  id: 'per_2025_genap',
  name: '2025/2026 Genap',
  year: '2025/2026',
  semester: 'Genap',
  isActive: true,
  createdBy: 'uid_foundation',
};

const OTHER_PERIOD: AcademicPeriod = {
  id: 'per_2025_ganjil',
  name: '2025/2026 Ganjil',
  year: '2025/2026',
  semester: 'Ganjil',
  isActive: false,
  createdBy: 'uid_foundation',
};

const STUDENT_1: Student = {
  id: 'stu_001',
  nis: '2025001',
  nisn: '0123456789',
  name: 'Aisyah Zahra',
  unitCode: 'SD',
  education_level: 'SD',
  cohort_id: 'coh_sd_2025',
  admission_year: '2025',
  classId: 'cls_sd_4a',
  className: '4A',
  gender: 'P',
};

const STUDENT_2: Student = {
  id: 'stu_002',
  nis: '2025002',
  nisn: '0123456790',
  name: 'Muhammad Bilal',
  unitCode: 'SD',
  education_level: 'SD',
  cohort_id: 'coh_sd_2025',
  admission_year: '2025',
  classId: 'cls_sd_4a',
  className: '4A',
  gender: 'L',
};

const STUDENT_OTHER_CLASS: Student = {
  id: 'stu_003',
  nis: '2025003',
  nisn: '0123456791',
  name: 'Zaid Al-Harits',
  unitCode: 'SMP',
  classId: 'cls_smp_7b',
  className: '7B',
  gender: 'L',
};

const ALL_STUDENTS = [STUDENT_1, STUDENT_2, STUDENT_OTHER_CLASS];

function wbToUint8(wb: XLSX.WorkBook): Uint8Array {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

function makeFilledWorkbook(
  student: Student,
  cls: SchoolClass,
  period: AcademicPeriod,
  scoresMap: Record<string, unknown>,
  teacherNotes = 'Perkembangan baik.'
): XLSX.WorkBook {
  const wb = buildAssessmentWorkbook({
    student,
    schoolClass: cls,
    period,
    assessmentMonth: 'Maret',
    assessmentYear: '2026',
    teacherIdentifier: 'guru@siakhlak.test',
  });
  const row: unknown[] = [student.nis];
  for (const ind of AKHLAK_31_INDICATORS) {
    const pShort = `P${ind.number}`;
    const val =
      ind.excelCode in scoresMap
        ? scoresMap[ind.excelCode]
        : pShort in scoresMap
        ? scoresMap[pShort]
        : '';
    row.push(val);
  }
  row.push(teacherNotes);
  const ws = XLSX.utils.aoa_to_sheet([[...PENILAIAN_HEADERS], row]);
  wb.Sheets['PENILAIAN'] = ws;
  return wb;
}

const asyncTests: Promise<void>[] = [];
function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      const p = res
        .then(() => {
          console.log(`PASS: ${name}`);
        })
        .catch((err) => {
          console.error(`FAIL: ${name}`);
          console.error(err);
          process.exitCode = 1;
        });
      asyncTests.push(p);
      return p;
    }
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// =========================================================
// SECTION J: FOUR PORTALS, 6 ROLES & ACCESS CONTROL TESTS (1–18)
// =========================================================

runTest('J01–J05: Empat portal login terpisah & routing ke 6 role resmi', () => {
  assert.equal(loginRouteForPortal('parent_student'), '/login/student-parent');
  assert.equal(loginRouteForPortal('teacher'), '/login/teacher');
  assert.equal(loginRouteForPortal('committee'), '/login/committee');
  assert.equal(loginRouteForPortal('foundation'), '/login/foundation');

  assert.equal(portalFromLoginRoute('/login/student-parent'), 'parent_student');
  assert.equal(portalFromLoginRoute('/login/parent-student'), 'parent_student');
  assert.equal(portalFromLoginRoute('/login/teacher'), 'teacher');
  assert.equal(portalFromLoginRoute('/login/committee'), 'committee');
  assert.equal(portalFromLoginRoute('/login/foundation'), 'foundation');

  // Portal 1: STUDENT & PARENT
  assert.equal(checkPortalAccess('STUDENT', 'parent_student').allowed, true);
  assert.equal(checkPortalAccess('PARENT', 'parent_student').allowed, true);
  assert.equal(routePathForMenu('siswa_dashboard', 'STUDENT'), '/student/dashboard');
  assert.equal(routePathForMenu('siswa_dashboard', 'PARENT'), '/parent/dashboard');

  // Portal 2: TEACHER & HOMEROOM_TEACHER
  assert.equal(checkPortalAccess('TEACHER', 'teacher').allowed, true);
  assert.equal(checkPortalAccess('HOMEROOM_TEACHER', 'teacher').allowed, true);
  assert.equal(routePathForMenu('core_dashboard', 'TEACHER'), '/teacher/dashboard');

  // Portal 3: COMMITTEE_ADMIN
  assert.equal(checkPortalAccess('COMMITTEE_ADMIN', 'committee').allowed, true);
  assert.equal(routePathForMenu('komite_dashboard', 'COMMITTEE_ADMIN'), '/committee/dashboard');

  // Portal 4: FOUNDATION_ADMIN & SUPER_ADMIN
  assert.equal(checkPortalAccess('FOUNDATION_ADMIN', 'foundation').allowed, true);
  assert.equal(checkPortalAccess('SUPER_ADMIN', 'foundation').allowed, true);
  assert.equal(routePathForMenu('core_dashboard', 'FOUNDATION_ADMIN'), '/foundation/dashboard');
  assert.equal(routePathForMenu('core_dashboard', 'SUPER_ADMIN'), '/foundation/dashboard');
});

runTest('J06–J09: Cross-portal login rejection (tanpa auto-ubah role)', () => {
  assert.equal(checkPortalAccess('STUDENT', 'teacher').allowed, false);
  assert.equal(checkPortalAccess('STUDENT', 'teacher').officialPortal, 'parent_student');

  assert.equal(checkPortalAccess('TEACHER', 'committee').allowed, false);
  assert.equal(checkPortalAccess('TEACHER', 'committee').officialPortal, 'teacher');

  assert.equal(checkPortalAccess('COMMITTEE_ADMIN', 'foundation').allowed, false);
  assert.equal(checkPortalAccess('COMMITTEE_ADMIN', 'foundation').officialPortal, 'committee');

  assert.equal(checkPortalAccess('PARENT', 'foundation').allowed, false);
  assert.equal(checkPortalAccess('PARENT', 'foundation').officialPortal, 'parent_student');

  assert.equal(checkPortalAccess('SUPER_ADMIN', 'parent_student').allowed, false);
  assert.equal(checkPortalAccess('SUPER_ADMIN', 'teacher').allowed, false);
  assert.equal(checkPortalAccess('SUPER_ADMIN', 'committee').allowed, false);
  assert.equal(checkPortalAccess('SUPER_ADMIN', 'foundation').allowed, true);
});

runTest('J10: Inactive / suspended / pending / archived lifecycle normalization & organization check', () => {
  const suspendedUser = normalizeUserProfileDoc('u_susp', {
    uid: 'u_susp',
    email: 'suspended@siakhlak.test',
    full_name: 'Akun Nonaktif',
    roles: ['TEACHER'],
    account_status: 'suspended',
    organization_id: DEFAULT_ORGANIZATION_ID,
  });
  assert.equal(suspendedUser.account_status, 'SUSPENDED');
  assert.equal(isAccountActive(suspendedUser.account_status), false);
  assert.equal(suspendedUser.role, 'TEACHER');

  const inactiveUser = normalizeUserProfileDoc('u_inact', {
    uid: 'u_inact',
    email: 'inactive@siakhlak.test',
    roles: ['STUDENT'],
    account_status: 'inactive',
    organization_id: DEFAULT_ORGANIZATION_ID,
  });
  assert.equal(inactiveUser.account_status, 'INACTIVE');
  assert.equal(isAccountActive(inactiveUser.account_status), false);

  const pendingUser = normalizeUserProfileDoc('u_pend', {
    uid: 'u_pend',
    email: 'pending@siakhlak.test',
    roles: ['STUDENT'],
    account_status: 'PENDING',
    organization_id: DEFAULT_ORGANIZATION_ID,
  });
  assert.equal(pendingUser.account_status, 'PENDING');
  assert.equal(isAccountActive(pendingUser.account_status), false);

  assert.equal(normalizeAccountStatus('active'), 'ACTIVE');
  assert.equal(isAccountActive('ACTIVE'), true);
  assert.equal(isAccountActive('ARCHIVED'), false);

  // Legacy role alias backward compatibility
  assert.equal(normalizeRole('yayasan'), 'FOUNDATION_ADMIN');
  assert.equal(normalizeRole('komite_pendidikan_agama'), 'COMMITTEE_ADMIN');
  assert.equal(normalizeRole('guru'), 'TEACHER');
  assert.equal(normalizeRole('siswa'), 'STUDENT');
  assert.equal(normalizeRole('orang_tua'), 'PARENT');
});

runTest('J11–J12: Route guard & cross-role isolation (Guru ke /foundation/users, Komite ke ubah nilai/sistem)', () => {
  // Guru accessing Foundation / Committee routes -> DENIED
  assert.equal(isRoutePathAuthorizedForRole('/foundation/users', 'TEACHER'), false);
  assert.equal(isRoutePathAuthorizedForRole('/foundation/settings', 'HOMEROOM_TEACHER'), false);
  assert.equal(isRoutePathAuthorizedForRole('/committee/dashboard', 'TEACHER'), false);
  assert.equal(isRoutePathAuthorizedForRole('/teacher/assessments', 'TEACHER'), true);

  // Komite accessing score editing, master data, system settings, audit trail -> DENIED
  assert.equal(isRoutePathAuthorizedForRole('/teacher/assessments', 'COMMITTEE_ADMIN'), false);
  assert.equal(isRoutePathAuthorizedForRole('/foundation/users', 'COMMITTEE_ADMIN'), false);
  assert.equal(isMenuAuthorizedForRole('core_penilaian_akhlak', 'COMMITTEE_ADMIN'), false);
  assert.equal(isMenuAuthorizedForRole('core_pengaturan_sistem', 'COMMITTEE_ADMIN'), false);
  assert.equal(isMenuAuthorizedForRole('core_master_data', 'COMMITTEE_ADMIN'), false);
  assert.equal(isMenuAuthorizedForRole('core_audit_trail', 'COMMITTEE_ADMIN'), false);

  // Komite accessing all 9 Komite menus -> ALLOWED
  assert.equal(isMenuAuthorizedForRole('komite_dashboard', 'COMMITTEE_ADMIN'), true);
  assert.equal(isMenuAuthorizedForRole('komite_temuan_rekomendasi', 'COMMITTEE_ADMIN'), true);
  assert.equal(isMenuAuthorizedForRole('komite_rapat_keputusan', 'COMMITTEE_ADMIN'), true);
  assert.equal(isMenuAuthorizedForRole('komite_laporan', 'COMMITTEE_ADMIN'), true);

  // Student & Parent isolation
  assert.equal(isRoutePathAuthorizedForRole('/parent/assessments', 'PARENT'), true);
  assert.equal(isRoutePathAuthorizedForRole('/student/assessments', 'PARENT'), false);
  assert.equal(isRoutePathAuthorizedForRole('/teacher/assessments', 'STUDENT'), false);
  assert.equal(isRoutePathAuthorizedForRole('/committee/dashboard', 'STUDENT'), false);
  assert.equal(isRoutePathAuthorizedForRole('/foundation/dashboard', 'PARENT'), false);

  // Protected route recognition for Logout Browser-Back protection
  assert.equal(isProtectedRoutePath('/foundation/users'), true);
  assert.equal(isProtectedRoutePath('/teacher/assessments'), true);
  assert.equal(isProtectedRoutePath('/committee/dashboard'), true);
  assert.equal(isProtectedRoutePath('/parent/dashboard'), true);
  assert.equal(isProtectedRoutePath('/login/teacher'), false);
  assert.equal(isProtectedRoutePath('/'), false);

  const parsedFoundationUsers = parseMenuFromRoute('/foundation/users');
  assert.equal(parsedFoundationUsers, 'core_pengaturan_sistem');
});

runTest('J13–J15: Explicit verifier permission, Komite individual student opt-in, & role defaults', () => {
  const teacherPerms = defaultPermissionsForRole('TEACHER');
  const homeroomPerms = defaultPermissionsForRole('HOMEROOM_TEACHER');
  const komitePerms = defaultPermissionsForRole('COMMITTEE_ADMIN');
  const foundationPerms = defaultPermissionsForRole('FOUNDATION_ADMIN');

  // By default, TEACHER & HOMEROOM_TEACHER do NOT have assessment:verify
  assert.equal(teacherPerms.includes('assessment:verify'), false);
  assert.equal(homeroomPerms.includes('assessment:verify'), false);
  assert.equal(homeroomPerms.includes('assessment:publish'), true);
  assert.equal(foundationPerms.includes('assessment:verify'), true);

  // By default, COMMITTEE_ADMIN does NOT have individual student access
  assert.equal(komitePerms.includes('committee:view_individual_students'), false);

  // Every canonical role has valid default menu
  (['STUDENT', 'PARENT', 'TEACHER', 'HOMEROOM_TEACHER', 'COMMITTEE_ADMIN', 'FOUNDATION_ADMIN'] as CanonicalRole[]).forEach(
    (role) => {
      const def = defaultMenuForRole(role);
      assert.equal(isMenuAuthorizedForRole(def, role), true);
    }
  );
});

runTest('J16–J18: Firestore Rules security invariants & Excel integrity verification', () => {
  const rulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.ok(rulesContent.includes('function isActiveUser()'), 'Account active & org check required');
  assert.ok(rulesContent.includes("function isGuruAuthorizedForUnitAndClass"), 'Guru unit & class guard required');
  assert.ok(rulesContent.includes("hasPermission('assessment:verify')"), 'Explicit verifier permission required');
  assert.ok(rulesContent.includes('.data.isActive == true'), 'Active period enforcement on assessment writes required');
  assert.ok(rulesContent.includes('isLinkedToStudent(resource.data.studentId)'), 'Parent/Student isolation required');
  assert.ok(rulesContent.includes('match /user_permissions/{userId}'), 'user_permissions collection rules required');
  assert.ok(rulesContent.includes('match /student_guardians/{relationshipId}'), 'student_guardians collection rules required');
  assert.ok(rulesContent.includes('match /class_assignments/{assignmentId}'), 'class_assignments collection rules required');
  assert.ok(rulesContent.includes('match /excelImportLogs/{logId}'), 'Import history rules required');
  assert.ok(rulesContent.includes('allow update, delete: if false;'), 'Immutable import/audit logs required');
  assert.ok(rulesContent.includes('isCommitteeAdmin()'), 'Komite RBAC checks present');
  assert.ok(!rulesContent.includes('allow read, write: if true'), 'No permissive wildcard rules allowed');
});

// =========================================================
// EXCEL TEMPLATE GENERATOR & MULTI-FILE VALIDATION REGRESSION TESTS
// =========================================================

runTest('EXCEL-01: Download Template Excel 4 sheet resmi & kosong tanpa default 4', () => {
  const wb = buildAssessmentWorkbook({
    student: STUDENT_1,
    schoolClass: TEST_CLASS,
    period: TEST_PERIOD,
    assessmentMonth: 'Maret',
    assessmentYear: '2026',
    teacherIdentifier: 'guru@siakhlak.test',
  });

  assert.deepEqual(wb.SheetNames, [
    'PETUNJUK',
    'IDENTITAS_PENILAIAN',
    'PENILAIAN',
    'REFERENSI_INDIKATOR',
  ]);

  const idRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['IDENTITAS_PENILAIAN'], {
    header: 1,
    defval: '',
  });
  assert.deepEqual(idRows[0], [...IDENTITAS_HEADERS]);
  assert.equal(idRows[1][0], TEMPLATE_VERSION);
  assert.equal(idRows[1][1], STUDENT_1.nis);

  const penRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['PENILAIAN'], {
    header: 1,
    defval: '',
  });
  assert.deepEqual(penRows[0], [...PENILAIAN_HEADERS]);
  assert.equal(penRows.length, 2);
  for (let i = 1; i <= 31; i += 1) {
    assert.equal(penRows[1][i], '', `Template column P${i} must be empty`);
  }

  const refRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['REFERENSI_INDIKATOR'], {
    header: 1,
    defval: '',
  });
  assert.deepEqual(refRows[0], [...REFERENSI_HEADERS]);
  assert.equal(refRows.length, 32);

  const fname = buildTemplateFilename(TEST_CLASS, STUDENT_1, TEST_PERIOD);
  assert.ok(fname.endsWith('.xlsx'));
});

runTest('EXCEL-02: Import valid multi-file, NULL empty cells, invalid values, tampered headers, & duplicates', () => {
  const ctx: ImportValidationContext = {
    selectedClass: TEST_CLASS,
    selectedPeriod: TEST_PERIOD,
    allStudents: ALL_STUDENTS,
    existingAssessments: [],
    batchSeenKeys: new Set(),
  };

  // Valid partial -> NULL for empty indicators
  const wbPartial = makeFilledWorkbook(STUDENT_1, TEST_CLASS, TEST_PERIOD, { P1: 4, P2: 2 });
  const resPartial = validateWorkbookBuffer(wbToUint8(wbPartial), 'partial.xlsx', ctx);
  assert.equal(resPartial.status, 'VALID');
  assert.equal(resPartial.scores['P3'], null);
  assert.equal(resPartial.averagePct, 75.0);

  // Invalid score (<1, >4, text)
  const wbBad = makeFilledWorkbook(STUDENT_2, TEST_CLASS, TEST_PERIOD, { P1: 0, P2: 5, P3: 'X' });
  const resBad = validateWorkbookBuffer(wbToUint8(wbBad), 'bad.xlsx', ctx);
  assert.equal(resBad.status, 'INVALID');

  // All empty -> NULL + NEEDS REVIEW
  const wbEmpty = buildAssessmentWorkbook({
    student: STUDENT_2,
    schoolClass: TEST_CLASS,
    period: TEST_PERIOD,
    assessmentMonth: 'Maret',
    assessmentYear: '2026',
    teacherIdentifier: 'guru@siakhlak.test',
  });
  const resEmpty = validateWorkbookBuffer(wbToUint8(wbEmpty), 'empty.xlsx', ctx);
  assert.equal(resEmpty.status, 'NEEDS REVIEW');
  assert.equal(resEmpty.averagePct, null);
  assert.equal(computeScaleAveragePct(resEmpty.scores), null);

  // Tampered headers
  const wbTampered = makeFilledWorkbook(STUDENT_1, TEST_CLASS, TEST_PERIOD, { P1: 4 });
  const tamperedHeaders = [...PENILAIAN_HEADERS];
  tamperedHeaders[1] = 'FAKE';
  wbTampered.Sheets['PENILAIAN'] = XLSX.utils.aoa_to_sheet([tamperedHeaders, [STUDENT_1.nis, 4]]);
  assert.equal(validateWorkbookBuffer(wbToUint8(wbTampered), 'tampered.xlsx', ctx).status, 'INVALID');

  // Duplicate against existing assessment
  const existingAssessment: StudentAssessment = {
    id: 'ass_1',
    studentId: STUDENT_1.id,
    studentName: STUDENT_1.name,
    unitCode: TEST_CLASS.unitCode,
    classId: TEST_CLASS.id,
    periodId: TEST_PERIOD.id,
    className: TEST_CLASS.name,
    scores: { P1: 3 },
    averageScore: 75,
    verificationStatus: 'Draft',
    createdBy: 'guru_uid',
  };
  const ctxDup: ImportValidationContext = {
    selectedClass: TEST_CLASS,
    selectedPeriod: TEST_PERIOD,
    allStudents: ALL_STUDENTS,
    existingAssessments: [existingAssessment],
    batchSeenKeys: new Set(),
  };
  const wbDup = makeFilledWorkbook(STUDENT_1, TEST_CLASS, TEST_PERIOD, { P1: 4 });
  assert.equal(validateWorkbookBuffer(wbToUint8(wbDup), 'dup.xlsx', ctxDup).status, 'DUPLICATE');

  // Error CSV generation
  const previews: ParsedAssessmentPreview[] = [resPartial, resBad];
  const csv = generateErrorReportCsv(previews);
  assert.ok(csv.includes('bad.xlsx'));
  assert.ok(!csv.includes('partial.xlsx'));
});

// =========================================================
// CHANGE REQUEST TESTS: 5 JENJANG, PROFIL, KENAIKAN KELAS, GUARDED DELETE, V2/V3 EXCEL
// =========================================================

runTest('CR-01: 5 Jenjang Resmi (TK, SD, SMP, SMA, SMK) & normalisasi kompatibilitas', () => {
  assert.deepEqual([...EDUCATION_LEVELS], ['TK', 'SD', 'SMP', 'SMA', 'SMK']);
  assert.equal(normalizeEducationLevel('KB/TK'), 'TK');
  assert.equal(normalizeEducationLevel('SD/SDI'), 'SD');
  assert.equal(normalizeEducationLevel('SMK'), 'SMK');
  assert.equal(matchesEducationLevel('SD/SDI', 'SD'), true);
  assert.equal(matchesEducationLevel('KB/TK', 'TK'), true);
  assert.equal(matchesEducationLevel('SMP', 'SD'), false);
});

runTest('CR-02: Master Data 15 submenus & Profil Saya routing across all roles', () => {
  assert.equal(parseMasterSubmenuFromRoute('/foundation/master-data/units'), 'unit_pendidikan');
  assert.equal(parseMasterSubmenuFromRoute('/foundation/master-data/cohorts'), 'data_angkatan');
  assert.equal(parseMasterSubmenuFromRoute('/foundation/master-data/students'), 'data_siswa');
  assert.equal(parseMasterSubmenuFromRoute('/foundation/master-data/audit'), 'audit_trail');
  assert.equal(parseMenuFromRoute('/foundation/master-data/cohorts'), 'core_master_data');

  (['TEACHER', 'HOMEROOM_TEACHER', 'COMMITTEE_ADMIN', 'FOUNDATION_ADMIN'] as CanonicalRole[]).forEach(
    (role) => {
      assert.equal(isMenuAuthorizedForRole('profil_saya', role), true);
    }
  );
  assert.equal(isMenuAuthorizedForRole('siswa_profil', 'STUDENT'), true);
  assert.equal(isMenuAuthorizedForRole('siswa_profil', 'PARENT'), true);
  assert.equal(routePathForMenu('profil_saya', 'TEACHER'), '/teacher/profile');
  assert.equal(routePathForMenu('profil_saya', 'COMMITTEE_ADMIN'), '/committee/profile');
  assert.equal(routePathForMenu('profil_saya', 'FOUNDATION_ADMIN'), '/foundation/profile');
});

runTest('CR-03: Kenaikan Kelas menjaga cohort_id, admission_year & mengupdate kelas/tahun ajaran/semester', () => {
  const targetClass: SchoolClass = {
    id: 'cls_sd_5a',
    unitCode: 'SD',
    name: '5A',
    level: '5',
    homeroomTeacherName: 'Ustadzah Aminah',
    studentCount: 25,
  };
  const { studentPatch, historyEntry } = computeStudentPromotionState(
    STUDENT_1,
    targetClass,
    'ay_2026_2027',
    'sem_2026_ganjil'
  );
  assert.equal(studentPatch.cohort_id, STUDENT_1.cohort_id);
  assert.equal(studentPatch.admission_year, STUDENT_1.admission_year);
  assert.equal(studentPatch.classId, 'cls_sd_5a');
  assert.equal(studentPatch.className, '5A');
  assert.equal(studentPatch.academic_year_id, 'ay_2026_2027');
  assert.equal(studentPatch.semester_id, 'sem_2026_ganjil');
  assert.equal(historyEntry.cohortId, STUDENT_1.cohort_id);
  assert.equal(historyEntry.movementType, 'PROMOTION');
});

runTest('CR-04: Validasi unik NIS & NISN siswa', () => {
  assert.ok(validateStudentUniqueness({ nis: '2025001', nisn: '9999999999' }, ALL_STUDENTS) !== null);
  assert.ok(validateStudentUniqueness({ nis: '2025999', nisn: '0123456789' }, ALL_STUDENTS) !== null);
  assert.equal(
    validateStudentUniqueness({ nis: '2025001', nisn: '0123456789' }, ALL_STUDENTS, STUDENT_1.id),
    null
  );
  assert.equal(validateStudentUniqueness({ nis: '2025999', nisn: '9999999999' }, ALL_STUDENTS), null);
});

runTest('CR-05: Guarded Permanent Delete memblokir penghapusan jika ada riwayat penilaian/mutabaah/kelas/wali', () => {
  const ass: StudentAssessment = {
    id: 'ass_hist',
    studentId: STUDENT_1.id,
    studentName: STUDENT_1.name,
    unitCode: 'SD',
    classId: TEST_CLASS.id,
    className: TEST_CLASS.name,
    periodId: TEST_PERIOD.id,
    scores: { P1: 4 },
    averageScore: 100,
    verificationStatus: 'Draft',
    createdBy: 'uid_teacher',
  };
  const blockedStudent = checkPermanentDeleteEligibility('students', STUDENT_1.id, {
    assessments: [ass],
    mutabaahLogs: [],
    classHistory: [],
    studentGuardians: [],
    students: ALL_STUDENTS,
  });
  assert.equal(blockedStudent.allowed, false);

  const hist: ClassStudentHistory = {
    id: 'hist_1',
    studentId: STUDENT_2.id,
    nis: STUDENT_2.nis,
    studentName: STUDENT_2.name,
    educationLevel: 'SD',
    educationUnitId: 'unit_sd',
    cohortId: 'coh_sd_2025',
    academicYearId: 'ay_2025',
    semesterId: 'sem_1',
    toClassId: TEST_CLASS.id,
    toClassName: TEST_CLASS.name,
    movementType: 'ENROLLMENT',
    movedByUid: 'uid_foundation',
    movedByName: 'Admin',
  };
  const blockedClass = checkPermanentDeleteEligibility('classes', TEST_CLASS.id, {
    assessments: [ass],
    mutabaahLogs: [],
    classHistory: [hist],
    studentGuardians: [],
    students: ALL_STUDENTS,
  });
  assert.equal(blockedClass.allowed, false);

  const cleanDelete = checkPermanentDeleteEligibility('cohorts', 'coh_unused', {
    assessments: [],
    mutabaahLogs: [],
    classHistory: [],
    studentGuardians: [],
    students: [],
  });
  assert.equal(cleanDelete.allowed, true);
});

runTest('CR-06: Kompatibilitas mundur Excel Import V2.0 (header lama & SD/SDI -> SD)', () => {
  const wbV2 = makeFilledWorkbook(STUDENT_1, TEST_CLASS, TEST_PERIOD, { P1: 4, P2: 3 });
  const v2Headers = [
    'template_version',
    'student_nis',
    'student_nisn',
    'student_name',
    'education_unit',
    'class_id',
    'class_name',
    'academic_year',
    'semester',
    'period_id',
    'assessment_month',
    'assessment_year',
    'teacher_identifier',
  ];
  const v2Row = [
    'SIAKHLAK-31-V2.0',
    STUDENT_1.nis,
    STUDENT_1.nisn || '',
    STUDENT_1.name,
    'SD/SDI',
    TEST_CLASS.id,
    TEST_CLASS.name,
    TEST_PERIOD.year,
    TEST_PERIOD.semester,
    TEST_PERIOD.id,
    'Maret',
    '2026',
    'guru@siakhlak.test',
  ];
  wbV2.Sheets['IDENTITAS_PENILAIAN'] = XLSX.utils.aoa_to_sheet([v2Headers, v2Row]);
  const resV2 = validateWorkbookBuffer(wbToUint8(wbV2), 'legacy_v2.xlsx', {
    selectedClass: TEST_CLASS,
    selectedPeriod: TEST_PERIOD,
    allStudents: ALL_STUDENTS,
    existingAssessments: [],
    batchSeenKeys: new Set(),
  });
  assert.equal(resV2.status, 'VALID');
  assert.equal(resV2.identitas?.educationLevel, 'SD');
  assert.equal(TEMPLATE_VERSION, 'SIAKHLAK-31-V3.0');
});

// =========================================================
// STUDENT LOGIN: EDUCATION LEVEL, ACADEMIC YEAR & CLASS SELECTION TESTS (SL-01..SL-09)
// =========================================================

runTest('SL-01–SL-03: 5 pilihan jenjang (KB/TK terpisah unit KB vs TK), filter tahun ajaran aktif & kelas', () => {
  assert.deepEqual(
    LOGIN_EDUCATION_LEVEL_OPTIONS.map((o) => o.label),
    ['KB/TK', 'SD', 'SMP', 'SMA', 'SMK']
  );

  const years: AcademicYearDoc[] = [
    {
      id: 'ay_old_active',
      yearName: '2025/2026',
      startDate: '2025-07-01',
      isActive: true,
      status: 'ACTIVE',
      createdBy: 'uid_foundation',
    },
    {
      id: 'ay_inactive',
      yearName: '2024/2025',
      startDate: '2024-07-01',
      isActive: false,
      status: 'ACTIVE',
      createdBy: 'uid_foundation',
    },
    {
      id: 'ay_archived',
      yearName: '2023/2024',
      startDate: '2023-07-01',
      isActive: true,
      status: 'ARCHIVED',
      createdBy: 'uid_foundation',
    },
    {
      id: 'ay_newest',
      yearName: '2026/2027',
      startDate: '2026-07-01',
      isActive: true,
      status: 'ACTIVE',
      createdBy: 'uid_foundation',
    },
  ];
  const activeYears = filterActiveAllowedAcademicYears(years);
  assert.deepEqual(
    activeYears.map((y) => y.id),
    ['ay_newest', 'ay_old_active']
  );
  assert.equal(filterActiveAllowedAcademicYears([]).length, 0);

  const loginClasses: SchoolClass[] = [
    {
      id: 'cls_kb_1',
      unitCode: 'TK',
      educationLevel: 'TK',
      educationUnitId: 'KB',
      educationUnitName: 'KB Al-Chasanah',
      name: 'KB Bintang',
      level: 'KB',
      academicYearId: 'ay_newest',
      homeroomTeacherName: 'Bunda Rina',
      studentCount: 12,
      status: 'ACTIVE',
    },
    {
      id: 'cls_tk_a',
      unitCode: 'TK',
      educationLevel: 'TK',
      educationUnitId: 'TK',
      educationUnitName: 'TK Islam Al-Chasanah',
      name: 'TK A1',
      level: 'A',
      academicYearId: 'ay_newest',
      homeroomTeacherName: 'Bunda Sari',
      studentCount: 18,
      status: 'ACTIVE',
    },
    {
      id: 'cls_tk_inactive',
      unitCode: 'TK',
      educationLevel: 'TK',
      educationUnitId: 'TK',
      name: 'TK Arsip',
      level: 'B',
      academicYearId: 'ay_newest',
      homeroomTeacherName: '-',
      studentCount: 0,
      status: 'INACTIVE',
    },
    {
      id: 'cls_sd_1a',
      unitCode: 'SD',
      educationLevel: 'SD',
      educationUnitId: 'SD',
      name: '1A',
      level: '1',
      academicYearId: 'ay_newest',
      homeroomTeacherName: 'Ustadz Ali',
      studentCount: 25,
      status: 'ACTIVE',
    },
    {
      id: 'cls_sd_old',
      unitCode: 'SD',
      educationLevel: 'SD',
      educationUnitId: 'SD',
      name: '1B',
      level: '1',
      academicYearId: 'ay_old_active',
      homeroomTeacherName: 'Ustadzah Ani',
      studentCount: 24,
      status: 'ACTIVE',
    },
  ];

  // Grouped KB/TK reveals separate KB and TK units
  const kbtkUnits = extractUnitsForEducationLevel(loginClasses, 'TK');
  assert.deepEqual(
    kbtkUnits.map((u) => u.unitId),
    ['KB', 'TK']
  );

  // Class filter narrows by level, year, active status, and unit
  assert.deepEqual(
    filterStudentLoginClasses(loginClasses, 'TK', 'ay_newest', 'KB').map((c) => c.id),
    ['cls_kb_1']
  );
  assert.deepEqual(
    filterStudentLoginClasses(loginClasses, 'TK', 'ay_newest', 'TK').map((c) => c.id),
    ['cls_tk_a']
  );
  assert.deepEqual(
    filterStudentLoginClasses(loginClasses, 'SD', 'ay_newest').map((c) => c.id),
    ['cls_sd_1a']
  );
});

runTest('SL-04–SL-07: Validasi penempatan siswa pasca-login, penolakan ketidaksesuaian, nonaktif, & manipulasi URL', () => {
  const activeYear: AcademicYearDoc = {
    id: 'ay_2026',
    yearName: '2026/2027',
    startDate: '2026-07-01',
    isActive: true,
    status: 'ACTIVE',
    createdBy: 'uid_foundation',
  };
  const clsTkA: SchoolClass = {
    id: 'cls_tk_a',
    unitCode: 'TK',
    educationLevel: 'TK',
    educationUnitId: 'TK',
    name: 'TK A1',
    level: 'A',
    academicYearId: 'ay_2026',
    homeroomTeacherName: 'Bunda Sari',
    studentCount: 15,
    status: 'ACTIVE',
  };
  const studentProfile = normalizeUserProfileDoc('uid_stu_1', {
    uid: 'uid_stu_1',
    email: 'siswa@siakhlak.test',
    full_name: 'Hasan Al-Banna',
    roles: ['STUDENT'],
    account_status: 'ACTIVE',
    organization_id: DEFAULT_ORGANIZATION_ID,
  });
  const studentDoc: Student = {
    id: 'stu_hasan',
    student_id: 'stu_hasan',
    nis: '2026001',
    name: 'Hasan Al-Banna',
    gender: 'L',
    unitCode: 'TK',
    education_level: 'TK',
    education_unit_id: 'TK',
    academic_year_id: 'ay_2026',
    classId: 'cls_tk_a',
    class_id: 'cls_tk_a',
    className: 'TK A1',
    studentUid: 'uid_stu_1',
    student_uid: 'uid_stu_1',
    status: 'ACTIVE',
    account_status: 'ACTIVE',
  };

  // 1. Valid match
  const validRes = validateStudentLoginPlacement({
    profile: studentProfile,
    studentDoc,
    selection: {
      educationLevel: 'TK',
      educationUnitId: 'TK',
      academicYearId: 'ay_2026',
      classId: 'cls_tk_a',
    },
    selectedClass: clsTkA,
    selectedYear: activeYear,
  });
  assert.equal(validRes.valid, true);

  // 2. Wrong class
  const wrongClass = validateStudentLoginPlacement({
    profile: studentProfile,
    studentDoc,
    selection: {
      educationLevel: 'TK',
      educationUnitId: 'TK',
      academicYearId: 'ay_2026',
      classId: 'cls_tk_b',
    },
  });
  assert.equal(wrongClass.valid, false);
  assert.equal(wrongClass.code, 'CLASS_MISMATCH');

  // 3. Wrong jenjang
  const wrongLevel = validateStudentLoginPlacement({
    profile: studentProfile,
    studentDoc,
    selection: {
      educationLevel: 'SD',
      academicYearId: 'ay_2026',
      classId: 'cls_tk_a',
    },
  });
  assert.equal(wrongLevel.valid, false);
  assert.equal(wrongLevel.code, 'LEVEL_MISMATCH');

  // 4. Wrong sub-unit under KB/TK (KB instead of TK)
  const wrongUnit = validateStudentLoginPlacement({
    profile: studentProfile,
    studentDoc,
    selection: {
      educationLevel: 'TK',
      educationUnitId: 'KB',
      academicYearId: 'ay_2026',
      classId: 'cls_tk_a',
    },
  });
  assert.equal(wrongUnit.valid, false);
  assert.equal(wrongUnit.code, 'UNIT_MISMATCH');

  // 5. Wrong academic year
  const wrongYear = validateStudentLoginPlacement({
    profile: studentProfile,
    studentDoc,
    selection: {
      educationLevel: 'TK',
      educationUnitId: 'TK',
      academicYearId: 'ay_2025',
      classId: 'cls_tk_a',
    },
  });
  assert.equal(wrongYear.valid, false);
  assert.equal(wrongYear.code, 'YEAR_MISMATCH');

  // 6. Inactive student status
  const inactiveStu = validateStudentLoginPlacement({
    profile: studentProfile,
    studentDoc: { ...studentDoc, account_status: 'INACTIVE', status: 'INACTIVE' },
    selection: {
      educationLevel: 'TK',
      academicYearId: 'ay_2026',
      classId: 'cls_tk_a',
    },
  });
  assert.equal(inactiveStu.valid, false);
  assert.equal(inactiveStu.code, 'INACTIVE_STUDENT');

  // 7. Unregistered user or unregistered student doc
  const unregUser = validateStudentLoginPlacement({
    profile: null,
    studentDoc: null,
    selection: {
      educationLevel: 'TK',
      academicYearId: 'ay_2026',
      classId: 'cls_tk_a',
    },
  });
  assert.equal(unregUser.valid, false);
  assert.equal(unregUser.code, 'UNREGISTERED_USER');

  const unregStu = validateStudentLoginPlacement({
    profile: studentProfile,
    studentDoc: null,
    selection: {
      educationLevel: 'TK',
      academicYearId: 'ay_2026',
      classId: 'cls_tk_a',
    },
  });
  assert.equal(unregStu.valid, false);
  assert.equal(unregStu.code, 'UNREGISTERED_STUDENT');

  // 8. URL query manipulation blocked
  const tamperedUrl = parseStudentSelectionFromUrlSearch(
    '?level=SMA&academicYearId=ay_2026&classId=cls_sma_10a'
  );
  assert.ok(tamperedUrl);
  const urlBlocked = validateStudentLoginPlacement({
    profile: studentProfile,
    studentDoc,
    selection: {
      educationLevel: normalizeEducationLevel(tamperedUrl.educationLevel),
      academicYearId: tamperedUrl.academicYearId,
      classId: tamperedUrl.classId,
    },
  });
  assert.equal(urlBlocked.valid, false);
});

runTest('SL-08–SL-09: Kenaikan kelas mengikuti kelas terbaru & Parent login tetap tanpa pilihan kelas', () => {
  const promotedClass: SchoolClass = {
    id: 'cls_sd_5a',
    unitCode: 'SD',
    educationLevel: 'SD',
    educationUnitId: 'SD',
    name: '5A',
    level: '5',
    academicYearId: 'ay_2026_2027',
    homeroomTeacherName: 'Ustadzah Aminah',
    studentCount: 25,
    status: 'ACTIVE',
  };
  const stuWithUid: Student = {
    ...STUDENT_1,
    studentUid: 'uid_aisyah',
    student_uid: 'uid_aisyah',
    academic_year_id: 'ay_2025_2026',
  };
  const { studentPatch } = computeStudentPromotionState(
    stuWithUid,
    promotedClass,
    'ay_2026_2027',
    'sem_2026_ganjil'
  );
  const promotedStudent: Student = { ...stuWithUid, ...studentPatch };
  const stuProfile = normalizeUserProfileDoc('uid_aisyah', {
    uid: 'uid_aisyah',
    email: 'aisyah@siakhlak.test',
    roles: ['STUDENT'],
    account_status: 'ACTIVE',
    organization_id: DEFAULT_ORGANIZATION_ID,
  });

  // Login using OLD class is rejected after promotion
  assert.equal(
    validateStudentLoginPlacement({
      profile: stuProfile,
      studentDoc: promotedStudent,
      selection: {
        educationLevel: 'SD',
        academicYearId: 'ay_2025_2026',
        classId: 'cls_sd_4a',
      },
    }).valid,
    false
  );

  // Login using NEW promoted class succeeds
  assert.equal(
    validateStudentLoginPlacement({
      profile: stuProfile,
      studentDoc: promotedStudent,
      selection: {
        educationLevel: 'SD',
        academicYearId: 'ay_2026_2027',
        classId: 'cls_sd_5a',
      },
    }).valid,
    true
  );

  // Parent still allowed via parent_student portal without class selection
  assert.equal(checkPortalAccess('PARENT', 'parent_student').allowed, true);
});

// =========================================================
// OFFICIAL FOUNDATION BRANDING & LOGO INTEGRATION TESTS (BRAND-01)
// =========================================================

runTest('BRAND-01: Official Foundation logo asset, metadata HTML, & centralized FoundationBrand integration', () => {
  const root = process.cwd();
  const logoPath = path.resolve(root, 'public/assets/logo-yayasan-al-chasanah.png');
  const uploadedOriginalPath = path.resolve(
    root,
    'public/assets/aistudio/Radiant_Islamic_Educational_Foundation_Emblem_2c0a4f1b.png'
  );
  assert.ok(fs.existsSync(logoPath), 'Official logo asset must exist at public/assets/logo-yayasan-al-chasanah.png');

  const logoBytes = fs.readFileSync(logoPath);
  assert.ok(
    logoBytes[0] === 0x89 && logoBytes[1] === 0x50 && logoBytes[2] === 0x4e && logoBytes[3] === 0x47,
    'Official logo asset must be a valid PNG file'
  );
  if (fs.existsSync(uploadedOriginalPath)) {
    const origBytes = fs.readFileSync(uploadedOriginalPath);
    assert.equal(
      Buffer.compare(logoBytes, origBytes),
      0,
      'Official logo file must match the exact unmodified uploaded PNG'
    );
  }

  const indexHtml = fs.readFileSync(path.resolve(root, 'index.html'), 'utf8');
  assert.ok(
    indexHtml.includes('<title>SIAKHLAK | Yayasan Pendidikan Al Chasanah</title>'),
    'index.html title must match official branding'
  );
  assert.ok(
    indexHtml.includes('/assets/logo-yayasan-al-chasanah.png'),
    'index.html must reference official favicon/logo asset'
  );

  const brandSrc = fs.readFileSync(
    path.resolve(root, 'src/components/branding/FoundationBrand.tsx'),
    'utf8'
  );
  assert.ok(brandSrc.includes('YAYASAN PENDIDIKAN AL CHASANAH'));
  assert.ok(brandSrc.includes('SIAKHLAK'));
  assert.ok(brandSrc.includes('Sistem Informasi Akhlakul Karimah'));
  assert.ok(brandSrc.includes('/assets/logo-yayasan-al-chasanah.png'));
  assert.ok(brandSrc.includes('object-contain'));

  const requiredBrandedFiles = [
    'src/components/AuthGate.tsx',
    'src/components/Sidebar.tsx',
    'src/App.tsx',
    'src/components/profile/MyProfileView.tsx',
    'src/components/profile/ProfileOnboardingGate.tsx',
    'src/components/student/StudentParentPortal.tsx',
    'src/components/core/CoreDashboard.tsx',
    'src/components/core/CoreAssessmentModule.tsx',
    'src/components/core/CoreProgramsModule.tsx',
    'src/components/core/CoreUnitFollowUp.tsx',
    'src/components/core/CoreAuditTrail.tsx',
    'src/components/core/CoreMasterData.tsx',
    'src/components/komite/KomiteDashboard.tsx',
    'src/components/komite/LaporanKomite.tsx',
  ];

  for (const relPath of requiredBrandedFiles) {
    const content = fs.readFileSync(path.resolve(root, relPath), 'utf8');
    assert.ok(
      content.includes('FoundationBrand') || content.includes('FoundationReportHeader'),
      `${relPath} must integrate FoundationBrand or FoundationReportHeader`
    );
    assert.ok(
      !content.includes('siakhlak_yayasan_crest'),
      `${relPath} must not contain stale placeholder crest path`
    );
  }
});

// =========================================================
// PHASE FINAL UAT HARDENING TESTS (UAT-FINAL-01..03)
// =========================================================

runTest('UAT-FINAL-01: expandAssignedUnitsForQuery expands canonical & legacy unit codes safely', () => {
  assert.deepEqual(expandAssignedUnitsForQuery([]), []);
  assert.deepEqual(expandAssignedUnitsForQuery(['TK']), ['TK', 'KB/TK']);
  assert.deepEqual(expandAssignedUnitsForQuery(['KB/TK']), ['TK', 'KB/TK']);
  assert.deepEqual(expandAssignedUnitsForQuery(['SD']), ['SD', 'SD/SDI']);
  assert.deepEqual(expandAssignedUnitsForQuery(['SD', 'SD/SDI', 'SMP']), ['SD', 'SD/SDI', 'SMP']);
});

runTest('UAT-FINAL-02: validateAssessmentRevisionInput enforces >= 5 char reason on Terverifikasi', () => {
  assert.deepEqual(validateAssessmentRevisionInput(undefined, ''), {
    valid: true,
    requiresReason: false,
  });
  assert.deepEqual(
    validateAssessmentRevisionInput({ verificationStatus: 'Draft' }, ''),
    { valid: true, requiresReason: false }
  );
  assert.deepEqual(
    validateAssessmentRevisionInput({ verificationStatus: 'Menunggu Verifikasi' }, ''),
    { valid: true, requiresReason: false }
  );

  const missingReason = validateAssessmentRevisionInput(
    { verificationStatus: 'Terverifikasi' },
    '   '
  );
  assert.equal(missingReason.valid, false);
  assert.equal(missingReason.requiresReason, true);

  const shortReason = validateAssessmentRevisionInput(
    { verificationStatus: 'Terverifikasi' },
    'rev'
  );
  assert.equal(shortReason.valid, false);
  assert.equal(shortReason.requiresReason, true);

  const validReason = validateAssessmentRevisionInput(
    { verificationStatus: 'Terverifikasi' },
    'Koreksi nilai P5 berdasarkan observasi wali kelas'
  );
  assert.equal(validReason.valid, true);
  assert.equal(validReason.requiresReason, true);
});

runTest('UAT-FINAL-03: Hardened Firestore Rules & App teacher scoping invariants', () => {
  const rulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.ok(
    rulesContent.includes('function isUnitAuthorizedForTeacher(unitCode)'),
    'isUnitAuthorizedForTeacher helper must exist in firestore.rules'
  );
  assert.ok(
    rulesContent.includes('function isClassAuthorizedForTeacher(classId)'),
    'isClassAuthorizedForTeacher helper must exist in firestore.rules'
  );
  assert.ok(
    rulesContent.includes("request.auth.token.firebase.sign_in_provider == 'password'"),
    'isSignedIn in firestore.rules must permit Firebase Email/Password users alongside verified Google Auth'
  );
  assert.ok(
    rulesContent.includes("('assignedClassIds' in userData()) && userData().assignedClassIds.size() > 0 && (classId in userData().assignedClassIds)") ||
      rulesContent.includes("&& ('assignedClassIds' in userData())\n        && userData().assignedClassIds.size() > 0\n        && (classId in userData().assignedClassIds)"),
    'Teacher class authorization in firestore.rules must enforce assignedClassIds membership'
  );

  const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.ok(
    appSrc.includes("subscribeClassScopedCollection<MutabaahLog>(\n            'mutabaahLogs'"),
    'App.tsx must use class-scoped subscription for teacher mutabaahLogs'
  );
  assert.ok(
    appSrc.includes("subscribeClassScopedCollection<Student>(\n              'students'"),
    'App.tsx must use class-scoped subscription for teacher students'
  );
  assert.ok(
    appSrc.includes("subscribeClassScopedCollection<StudentAssessment>(\n              'studentAssessments'"),
    'App.tsx must use class-scoped subscription for teacher studentAssessments'
  );
});

// =====================================================================
// AUTH CORRECTION TESTS: EMAIL/PASSWORD, NO-DROPDOWN STUDENT/PARENT,
// & CLASS-BASED TEACHER LOGIN (AUTH-CORRECTION-01..19)
// =====================================================================

runTest('AUTH-CORRECTION-01: Firebase Auth error mapping handles operation-not-allowed & standard errors cleanly', () => {
  const opNotAllowed = formatFirebaseAuthError({
    code: 'auth/operation-not-allowed',
    message: 'Firebase: Error (auth/operation-not-allowed).',
  });
  assert.equal(
    opNotAllowed,
    'Login Email/Password belum diaktifkan oleh administrator sistem. Silakan hubungi Admin Yayasan.'
  );
  assert.ok(!opNotAllowed.includes('Firebase: Error'));

  assert.equal(
    formatFirebaseAuthError({ code: 'auth/admin-restricted-operation' }),
    'Login Email/Password belum diaktifkan oleh administrator sistem. Silakan hubungi Admin Yayasan.'
  );
  assert.equal(
    formatFirebaseAuthError({ code: 'auth/invalid-credential' }),
    'Email atau password yang Anda masukkan salah.'
  );
  assert.equal(
    formatFirebaseAuthError({ code: 'auth/wrong-password' }),
    'Email atau password yang Anda masukkan salah.'
  );
  assert.equal(
    formatFirebaseAuthError({ code: 'auth/user-not-found' }),
    'Akun email tidak ditemukan pada sistem autentikasi.'
  );
  assert.equal(
    formatFirebaseAuthError({ code: 'auth/invalid-email' }),
    'Format alamat email tidak valid.'
  );
  assert.equal(
    formatFirebaseAuthError({ code: 'auth/user-disabled' }),
    'Akun Anda telah dinonaktifkan pada sistem autentikasi. Hubungi Admin Yayasan.'
  );
  assert.equal(
    formatFirebaseAuthError({ code: 'auth/too-many-requests' }),
    'Terlalu banyak percobaan login gagal. Tunggu beberapa menit sebelum mencoba lagi.'
  );
  assert.equal(
    formatFirebaseAuthError({ code: 'auth/network-request-failed' }),
    'Koneksi jaringan bermasalah. Periksa koneksi internet Anda lalu coba kembali.'
  );
  const fallbackMsg = formatFirebaseAuthError(new Error('raw internal token trace'));
  assert.ok(!fallbackMsg.includes('raw internal token trace'));
});

runTest('AUTH-CORRECTION-02: Student Email/Password login validates account & linked active student without manual class dropdown', () => {
  const activeStuProfile = normalizeUserProfileDoc('uid_stu_1', {
    uid: 'uid_stu_1',
    email: 'siswa1@alchasanah.sch.id',
    full_name: 'Fulan Siswa',
    roles: ['STUDENT'],
    account_status: 'ACTIVE',
    organization_id: DEFAULT_ORGANIZATION_ID,
    linkedStudentIds: ['stu_smp_8a'],
  });
  const activeStuDoc: Student = {
    ...STUDENT_1,
    id: 'stu_smp_8a',
    unitCode: 'SMP',
    education_level: 'SMP',
    education_unit_id: 'SMP',
    academic_year_id: 'ay_2026',
    classId: 'cls_smp_8a',
    className: '8A',
    studentUid: 'uid_stu_1',
    status: 'ACTIVE',
    account_status: 'ACTIVE',
  };

  // Valid login without manual dropdown selection
  assert.deepEqual(
    validateStudentLoginPlacement({
      profile: activeStuProfile,
      studentDoc: activeStuDoc,
      selection: null,
    }),
    { valid: true }
  );

  // Missing user profile rejected (no auto-create)
  assert.equal(
    validateStudentLoginPlacement({
      profile: null,
      studentDoc: activeStuDoc,
      selection: null,
    }).code,
    'UNREGISTERED_USER'
  );

  // Unlinked / missing student document rejected
  assert.equal(
    validateStudentLoginPlacement({
      profile: activeStuProfile,
      studentDoc: null,
      selection: null,
    }).code,
    'UNREGISTERED_STUDENT'
  );

  // Inactive student rejected
  assert.equal(
    validateStudentLoginPlacement({
      profile: activeStuProfile,
      studentDoc: { ...activeStuDoc, status: 'INACTIVE', account_status: 'INACTIVE' },
      selection: null,
    }).code,
    'INACTIVE_STUDENT'
  );

  // UID mismatch rejected
  assert.equal(
    validateStudentLoginPlacement({
      profile: activeStuProfile,
      studentDoc: { ...activeStuDoc, studentUid: 'uid_other' },
      selection: null,
    }).code,
    'UID_MISMATCH'
  );
});

runTest('AUTH-CORRECTION-03: Teacher 3-step class-based selection & assignment authorization matrix', () => {
  const years: AcademicYearDoc[] = [
    {
      id: 'ay_2026',
      yearName: '2026/2027',
      isActive: true,
      status: 'ACTIVE',
      createdBy: 'uid_admin',
    },
    {
      id: 'ay_2025',
      yearName: '2025/2026',
      isActive: false,
      status: 'INACTIVE',
      createdBy: 'uid_admin',
    },
  ];
  const classes: SchoolClass[] = [
    {
      id: 'cls_kb_1',
      unitCode: 'TK',
      educationLevel: 'TK',
      educationUnitId: 'KB',
      name: 'KB A',
      level: 'KB',
      academicYearId: 'ay_2026',
      homeroomTeacherName: 'Ustadzah KB',
      studentCount: 12,
      status: 'ACTIVE',
    },
    {
      id: 'cls_tk_1',
      unitCode: 'TK',
      educationLevel: 'TK',
      educationUnitId: 'TK',
      name: 'TK A',
      level: 'TK A',
      academicYearId: 'ay_2026',
      homeroomTeacherName: 'Ustadzah TK',
      studentCount: 15,
      status: 'ACTIVE',
    },
    {
      id: 'cls_sd_4a',
      unitCode: 'SD',
      educationLevel: 'SD',
      educationUnitId: 'SD',
      name: '4A',
      level: '4',
      academicYearId: 'ay_2026',
      homeroomTeacherName: 'Ustadz Ahmad',
      studentCount: 24,
      status: 'ACTIVE',
    },
    {
      id: 'cls_sd_5a',
      unitCode: 'SD',
      educationLevel: 'SD',
      educationUnitId: 'SD',
      name: '5A',
      level: '5',
      academicYearId: 'ay_2026',
      homeroomTeacherName: 'Ustadz Ahmad',
      studentCount: 25,
      status: 'ACTIVE',
    },
    {
      id: 'cls_sd_6b',
      unitCode: 'SD',
      educationLevel: 'SD',
      educationUnitId: 'SD',
      name: '6B',
      level: '6',
      academicYearId: 'ay_2026',
      homeroomTeacherName: 'Ustadzah Lain',
      studentCount: 20,
      status: 'ACTIVE',
    },
    {
      id: 'cls_sd_inactive',
      unitCode: 'SD',
      educationLevel: 'SD',
      educationUnitId: 'SD',
      name: '4Z',
      level: '4',
      academicYearId: 'ay_2026',
      homeroomTeacherName: '-',
      studentCount: 0,
      status: 'INACTIVE',
    },
  ];

  // Dynamic filtering for pre-auth dropdowns (KB vs TK sub-unit & active year)
  assert.deepEqual(
    filterActiveAllowedAcademicYears(years).map((y) => y.id),
    ['ay_2026']
  );
  assert.deepEqual(
    filterStudentLoginClasses(classes, 'TK', 'ay_2026', 'KB').map((c) => c.id),
    ['cls_kb_1']
  );
  assert.deepEqual(
    filterStudentLoginClasses(classes, 'SD', 'ay_2026').map((c) => c.id),
    ['cls_sd_4a', 'cls_sd_5a', 'cls_sd_6b']
  );

  const teacherProfile = normalizeUserProfileDoc('uid_teacher_ahmad', {
    uid: 'uid_teacher_ahmad',
    email: 'ahmad@alchasanah.sch.id',
    full_name: 'Ustadz Ahmad',
    roles: ['HOMEROOM_TEACHER'],
    account_status: 'ACTIVE',
    organization_id: DEFAULT_ORGANIZATION_ID,
    assignedUnits: ['SD'],
    assignedClassIds: ['cls_sd_4a', 'cls_sd_5a'],
  });

  const activeAssignments: ClassAssignment[] = [
    {
      id: 'assign_4a',
      teacher_uid: 'uid_teacher_ahmad',
      class_id: 'cls_sd_4a',
      education_unit_id: 'SD',
      academic_year_id: 'ay_2026',
      assignment_status: 'active',
      is_homeroom: true,
      organization_id: DEFAULT_ORGANIZATION_ID,
      created_by: 'uid_admin',
    },
    {
      id: 'assign_5a',
      teacher_uid: 'uid_teacher_ahmad',
      class_id: 'cls_sd_5a',
      education_unit_id: 'SD',
      academic_year_id: 'ay_2026',
      assignment_status: 'active',
      is_homeroom: false,
      organization_id: DEFAULT_ORGANIZATION_ID,
      created_by: 'uid_admin',
    },
  ];

  // 1. Valid HOMEROOM_TEACHER login to assigned class 4A & multi-class 5A
  assert.deepEqual(
    validateTeacherLoginAssignment({
      profile: teacherProfile,
      selection: { educationLevel: 'SD', academicYearId: 'ay_2026', classId: 'cls_sd_4a' },
      selectedClass: classes.find((c) => c.id === 'cls_sd_4a'),
      selectedYear: years[0],
      classAssignments: activeAssignments,
    }),
    { valid: true }
  );
  assert.deepEqual(
    validateTeacherLoginAssignment({
      profile: teacherProfile,
      selection: { educationLevel: 'SD', academicYearId: 'ay_2026', classId: 'cls_sd_5a' },
      selectedClass: classes.find((c) => c.id === 'cls_sd_5a'),
      selectedYear: years[0],
      classAssignments: activeAssignments,
    }),
    { valid: true }
  );

  // 2. Rejects unassigned class in same unit/year (6B)
  const unauthClass = validateTeacherLoginAssignment({
    profile: teacherProfile,
    selection: { educationLevel: 'SD', academicYearId: 'ay_2026', classId: 'cls_sd_6b' },
    selectedClass: classes.find((c) => c.id === 'cls_sd_6b'),
    selectedYear: years[0],
    classAssignments: activeAssignments,
  });
  assert.equal(unauthClass.valid, false);
  assert.equal(unauthClass.code, 'TEACHER_CLASS_UNAUTHORIZED');

  // 3. Rejects inactive academic year
  const inactiveYear = validateTeacherLoginAssignment({
    profile: teacherProfile,
    selection: { educationLevel: 'SD', academicYearId: 'ay_2025', classId: 'cls_sd_4a' },
    selectedClass: classes.find((c) => c.id === 'cls_sd_4a'),
    selectedYear: years[1],
    classAssignments: activeAssignments,
  });
  assert.equal(inactiveYear.valid, false);
  assert.equal(inactiveYear.code, 'INACTIVE_YEAR');

  // 4. Rejects inactive class
  const inactiveClass = validateTeacherLoginAssignment({
    profile: teacherProfile,
    selection: { educationLevel: 'SD', academicYearId: 'ay_2026', classId: 'cls_sd_inactive' },
    selectedClass: classes.find((c) => c.id === 'cls_sd_inactive'),
    selectedYear: years[0],
    classAssignments: activeAssignments,
  });
  assert.equal(inactiveClass.valid, false);
  assert.equal(inactiveClass.code, 'INACTIVE_CLASS');

  // 5. Rejects wrong jenjang mismatch (choosing SMP for SD class)
  const levelMismatch = validateTeacherLoginAssignment({
    profile: teacherProfile,
    selection: { educationLevel: 'SMP', academicYearId: 'ay_2026', classId: 'cls_sd_4a' },
    selectedClass: classes.find((c) => c.id === 'cls_sd_4a'),
    selectedYear: years[0],
    classAssignments: activeAssignments,
  });
  assert.equal(levelMismatch.valid, false);
  assert.equal(levelMismatch.code, 'LEVEL_MISMATCH');

  // 6. Rejects sub-unit mismatch (KB vs TK)
  const unitMismatch = validateTeacherLoginAssignment({
    profile: teacherProfile,
    selection: {
      educationLevel: 'TK',
      educationUnitId: 'TK',
      academicYearId: 'ay_2026',
      classId: 'cls_kb_1',
    },
    selectedClass: classes.find((c) => c.id === 'cls_kb_1'),
    selectedYear: years[0],
    classAssignments: activeAssignments,
  });
  assert.equal(unitMismatch.valid, false);
  assert.equal(unitMismatch.code, 'UNIT_MISMATCH');

  // 7. Rejects inactive teacher or non-teacher role
  assert.equal(
    validateTeacherLoginAssignment({
      profile: { ...teacherProfile, account_status: 'INACTIVE' },
      selection: { educationLevel: 'SD', academicYearId: 'ay_2026', classId: 'cls_sd_4a' },
      selectedClass: classes.find((c) => c.id === 'cls_sd_4a'),
      selectedYear: years[0],
      classAssignments: activeAssignments,
    }).code,
    'INACTIVE_USER'
  );
  assert.equal(
    validateTeacherLoginAssignment({
      profile: normalizeUserProfileDoc('uid_stu', {
        uid: 'uid_stu',
        email: 's@test.id',
        roles: ['STUDENT'],
        account_status: 'ACTIVE',
      }),
      selection: { educationLevel: 'SD', academicYearId: 'ay_2026', classId: 'cls_sd_4a' },
      selectedClass: classes.find((c) => c.id === 'cls_sd_4a'),
      selectedYear: years[0],
      classAssignments: activeAssignments,
    }).code,
    'ROLE_MISMATCH'
  );

  // 8. Rejects when class_assignment has been deactivated (inactive)
  const deactivatedAssignment = validateTeacherLoginAssignment({
    profile: teacherProfile,
    selection: { educationLevel: 'SD', academicYearId: 'ay_2026', classId: 'cls_sd_4a' },
    selectedClass: classes.find((c) => c.id === 'cls_sd_4a'),
    selectedYear: years[0],
    classAssignments: activeAssignments.map((ca) =>
      ca.class_id === 'cls_sd_4a' ? { ...ca, assignment_status: 'inactive' } : ca
    ),
  });
  assert.equal(deactivatedAssignment.valid, false);
  assert.equal(deactivatedAssignment.code, 'TEACHER_CLASS_UNAUTHORIZED');

  // 9. URL manipulation on teacher selection is caught cleanly
  const urlTampered = parseTeacherSelectionFromUrlSearch(
    '?level=SD&academicYearId=ay_2026&classId=cls_sd_6b'
  );
  assert.ok(urlTampered);
  assert.equal(
    validateTeacherLoginAssignment({
      profile: teacherProfile,
      selection: {
        educationLevel: normalizeEducationLevel(urlTampered.educationLevel),
        academicYearId: urlTampered.academicYearId,
        classId: urlTampered.classId,
      },
      selectedClass: classes.find((c) => c.id === urlTampered.classId),
      selectedYear: years[0],
      classAssignments: activeAssignments,
    }).valid,
    false
  );
});

runTest('AUTH-CORRECTION-04: Portal UI & App security invariants (4 Email/Password portals, eye toggles, no student class dropdown, no stored passwords, strict class scoping)', () => {
  const root = process.cwd();
  const authGateSrc = fs.readFileSync(path.resolve(root, 'src/components/AuthGate.tsx'), 'utf8');
  const appSrc = fs.readFileSync(path.resolve(root, 'src/App.tsx'), 'utf8');
  const dashSrc = fs.readFileSync(path.resolve(root, 'src/components/core/CoreDashboard.tsx'), 'utf8');
  const assessSrc = fs.readFileSync(path.resolve(root, 'src/components/core/CoreAssessmentModule.tsx'), 'utf8');
  const progSrc = fs.readFileSync(path.resolve(root, 'src/components/core/CoreProgramsModule.tsx'), 'utf8');

  // Password field with Eye/EyeOff toggle across all 4 portals
  assert.ok(authGateSrc.includes('Eye') && authGateSrc.includes('EyeOff'));
  assert.ok(authGateSrc.includes('onStudentEmailSignIn'));
  assert.ok(authGateSrc.includes('onParentEmailSignIn'));
  assert.ok(authGateSrc.includes('onTeacherEmailSignIn'));
  assert.ok(authGateSrc.includes('onCommitteeEmailSignIn'));
  assert.ok(authGateSrc.includes('onFoundationEmailSignIn'));
  assert.ok(authGateSrc.includes('MASUK KE PORTAL GURU'));

  // Parent Email/Password portal without class selection & child isolation checks
  assert.equal(checkPortalAccess(['PARENT'], 'parent_student').allowed, true);
  assert.equal(checkPortalAccess(['PARENT'], 'teacher').allowed, false);
  assert.equal(checkPortalAccess(['COMMITTEE_ADMIN'], 'committee').allowed, true);
  assert.equal(checkPortalAccess(['COMMITTEE_ADMIN'], 'foundation').allowed, false);
  assert.equal(checkPortalAccess(['FOUNDATION_ADMIN'], 'foundation').allowed, true);
  assert.equal(checkPortalAccess(['FOUNDATION_ADMIN'], 'committee').allowed, false);

  // Student/Parent tabs use Email + Password without manual class dropdown
  assert.ok(!authGateSrc.includes('studentLoginClassId'));
  assert.ok(authGateSrc.includes('Email / Akun Siswa'));
  assert.ok(authGateSrc.includes('Email Orang Tua / Wali'));

  // Teacher ordered 6-step form & selection gate
  assert.ok(authGateSrc.includes('1. Jenjang Pendidikan'));
  assert.ok(authGateSrc.includes('2. Tahun Ajaran'));
  assert.ok(authGateSrc.includes('3. Kelas'));
  assert.ok(authGateSrc.includes('4. Email Guru'));
  assert.ok(authGateSrc.includes('5. Password'));
  assert.ok(authGateSrc.includes('TeacherSelectionMismatchGate'));

  // App.tsx never creates users automatically on Email/Password & never stores passwords
  assert.ok(appSrc.includes('signInWithEmailAndPassword'));
  assert.ok(appSrc.includes('fetchRegisteredUserProfile'));
  assert.ok(appSrc.includes('validateTeacherLoginAssignment'));
  assert.ok(!appSrc.includes("sessionStorage.setItem('password'"));
  assert.ok(!appSrc.includes("localStorage.setItem('password'"));
  assert.ok(!authGateSrc.includes("sessionStorage.setItem('password'"));
  assert.ok(!authGateSrc.includes("localStorage.setItem('password'"));

  // Strict class scoping in Guru dashboard, assessment, and mutabaah modules
  assert.ok(dashSrc.includes('Pindah Kelas Penugasan'));
  assert.ok(dashSrc.includes('if (explicitIds.size === 0) return []'));
  assert.ok(assessSrc.includes('if (explicitClassIds.size === 0) return []'));
  assert.ok(progSrc.includes('if (authorizedTeacherClassIds.size === 0) return []'));
});

runTest('EXCEL-MASTER-01: Template 1 (Siswa & Orang Tua) & Template 2 (Guru, Wali Kelas & 31 Indikator)', () => {
  // Test Template 1: DATA SISWA DAN ORANG TUA
  const wb1 = buildStudentParentTemplateWorkbook();
  assert.deepEqual(wb1.SheetNames, [
    'PETUNJUK',
    'DATA_SISWA_ORANG_TUA',
    'REFERENSI',
    'MASTER_31_INDIKATOR',
  ]);

  const sheet1Data = XLSX.utils.sheet_to_json<string[]>(wb1.Sheets['DATA_SISWA_ORANG_TUA'], { header: 1 });
  const headers1 = sheet1Data[0];
  assert.deepEqual(headers1, [...STUDENT_PARENT_HEADERS]);
  assert.equal(headers1.length, 16);
  assert.equal(headers1[0], 'NIS');
  assert.equal(headers1[1], 'NAMA_SISWA');
  assert.equal(headers1[15], 'ALAMAT');

  // Check 31 Indicators sheet in Template 1
  const sheet1Ind = XLSX.utils.sheet_to_json<string[]>(wb1.Sheets['MASTER_31_INDIKATOR'], { header: 1 });
  assert.equal(sheet1Ind.length, 32); // Header + 31 rows
  assert.equal(sheet1Ind[1][0], 'P01');
  assert.equal(sheet1Ind[31][0], 'P31');

  // Test Template 2: DATA GURU, WALI KELAS, & PENILAIAN 31 INDIKATOR
  const wb2 = buildTeacherAssignmentAssessmentWorkbook([STUDENT_1, STUDENT_2], TEST_CLASS, TEST_PERIOD);
  assert.deepEqual(wb2.SheetNames, [
    'PETUNJUK',
    'DATA_GURU_WALI_KELAS',
    'REFERENSI',
    'MASTER_31_INDIKATOR',
    'PENILAIAN_31_INDIKATOR',
    'REKAP_PENILAIAN',
  ]);

  const sheet2Guru = XLSX.utils.sheet_to_json<string[]>(wb2.Sheets['DATA_GURU_WALI_KELAS'], { header: 1 });
  assert.deepEqual(sheet2Guru[0], [...TEACHER_ASSIGNMENT_HEADERS]);

  const sheet2Penilaian = XLSX.utils.sheet_to_json<string[]>(wb2.Sheets['PENILAIAN_31_INDIKATOR'], { header: 1 });
  assert.deepEqual(sheet2Penilaian[0], [...BATCH_PENILAIAN_HEADERS]);

  // Verify that all score cells for prefilled students are EMPTY/NULL (NO default 4!)
  const rowStudent1 = sheet2Penilaian[1];
  assert.equal(rowStudent1[0], STUDENT_1.nis);
  // Indices 10 to 40 correspond to P01..P31
  for (let c = 10; c <= 40; c++) {
    assert.equal(rowStudent1[c], '', `Indikator kolom ke-${c} harus kosong tanpa nilai default 4`);
  }

  // Check Sheet 6: REKAP_PENILAIAN formulas
  const wsRekap = wb2.Sheets['REKAP_PENILAIAN'];
  assert.ok(wsRekap['F2'], 'Cell F2 (INDIKATOR_DINILAI) harus ada');
  assert.equal(wsRekap['F2'].f, 'COUNT(PENILAIAN_31_INDIKATOR!K2:AO2)');
  assert.equal(wsRekap['G2'].f, '31-COUNT(PENILAIAN_31_INDIKATOR!K2:AO2)');
  assert.equal(wsRekap['H2'].f, 'SUM(PENILAIAN_31_INDIKATOR!K2:AO2)');
  assert.ok(wsRekap['I2'].f?.includes('AVERAGE(PENILAIAN_31_INDIKATOR!K2:AO2)'));
  assert.ok(wsRekap['J2'].f?.includes('"LENGKAP"'));
  assert.ok(wsRekap['K2'].f?.includes('"MENUNGGU KEBIJAKAN PREDIKAT YAYASAN"'));
  assert.ok(!wsRekap['K2'].f?.includes('"SB"'), 'Formula tidak boleh menggunakan predikat SB/B/C/K yang belum disahkan');
});

runTest('EXCEL-MASTER-02: Validasi Import Siswa, Orang Tua, Guru & Penilaian 31 Indikator', () => {
  // Test Student/Parent parser & validator
  const validWb = buildStudentParentTemplateWorkbook();
  const validBuf = XLSX.write(validWb, { bookType: 'xlsx', type: 'array' });
  const resStudent = validateStudentParentWorkbookBuffer(validBuf, 'test_siswa.xlsx');
  // Sample rows with [CONTOH] and empty rows are skipped
  assert.equal(resStudent.globalErrors.length, 0);

  // Test with invalid data: same student and parent email
  const badWb = XLSX.utils.book_new();
  const badRows = [
    [...STUDENT_PARENT_HEADERS],
    [
      '20269999',
      'Test Siswa',
      'L',
      'Jakarta',
      '2012-01-01',
      'SMP',
      'SMP Al-Chasanah',
      '2025/2026',
      '7A',
      'ACTIVE',
      'same@test.com',
      'Orang Tua',
      'ayah',
      'same@test.com', // SAME EMAIL!
      '08123',
      'Alamat',
    ],
  ];
  XLSX.utils.book_append_sheet(badWb, XLSX.utils.aoa_to_sheet(badRows), 'DATA_SISWA_ORANG_TUA');
  const badBuf = XLSX.write(badWb, { bookType: 'xlsx', type: 'array' });
  const resBadStudent = validateStudentParentWorkbookBuffer(badBuf, 'bad_siswa.xlsx');
  assert.equal(resBadStudent.invalidRows, 1);
  assert.ok(
    resBadStudent.rows[0].errors.some((e) => e.includes('Email Siswa dan Email Orang Tua tidak boleh sama'))
  );

  // Test Batch Assessment Validator
  const batchWb = buildTeacherAssignmentAssessmentWorkbook([STUDENT_1], TEST_CLASS, TEST_PERIOD);
  // Fill partial scores for STUDENT_1 in PENILAIAN_31_INDIKATOR
  const ws = batchWb.Sheets['PENILAIAN_31_INDIKATOR'];
  // Set cell K2 (P01) to 4, L2 (P02) to 3
  XLSX.utils.sheet_add_aoa(ws, [[4, 3]], { origin: 'K2' });
  const batchBuf = XLSX.write(batchWb, { bookType: 'xlsx', type: 'array' });

  const ctx: ImportValidationContext = {
    selectedClass: TEST_CLASS,
    selectedPeriod: TEST_PERIOD,
    allStudents: ALL_STUDENTS,
    existingAssessments: [],
    batchSeenKeys: new Set(),
  };

  const batchPreviews = validateBatchAssessmentWorkbookBuffer(batchBuf, 'batch.xlsx', ctx);
  assert.equal(batchPreviews.length, 1);
  assert.equal(batchPreviews[0].identitas?.nis, STUDENT_1.nis);
  assert.equal(batchPreviews[0].scores['P01'], 4);
  assert.equal(batchPreviews[0].scores['P02'], 3);
  assert.equal(batchPreviews[0].scores['P03'], null);
  assert.equal(batchPreviews[0].filledCount, 2);
  assert.equal(batchPreviews[0].emptyCount, 29);
  assert.equal(batchPreviews[0].status, 'VALID');
});

runTest('EMULATOR-SAFETY-01: Hard Production Safety Gate & Emulator Isolation Invariants', async () => {
  const {
    EMULATOR_CONFIG,
    getEmulatorConfig,
    checkEmulatorHealth,
    assertEmulatorActive,
  } = await import('../src/lib/firebase');

  // 1. Invariants of Emulator Configuration
  const cfg = getEmulatorConfig();
  assert.equal(cfg.authHost, '127.0.0.1');
  assert.equal(cfg.authPort, 9099);
  assert.equal(cfg.authUrl, 'http://127.0.0.1:9099');
  assert.equal(cfg.firestoreHost, '127.0.0.1');
  assert.equal(cfg.firestorePort, 8080);
  assert.equal(cfg.firestoreUrl, 'http://127.0.0.1:8080');
  assert.equal(cfg.uiUrl, 'http://127.0.0.1:4000');

  // 2. Connectivity probe against active local emulators
  const health = await checkEmulatorHealth();
  assert.equal(health.auth, true, 'Auth emulator at 127.0.0.1:9099 must be responsive');
  assert.equal(health.firestore, true, 'Firestore emulator at 127.0.0.1:8080 must be responsive');
  assert.equal(health.ok, true, 'Both emulators must be healthy');
  assert.equal(health.error, undefined);

  // 3. assertEmulatorActive does not throw when running
  await assertEmulatorActive();

  // 4. Hard Safety Gate fail-fast check: Reject startup when emulator endpoints fail
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      throw new Error('Connection refused: ECONNREFUSED');
    }) as any;

    const offlineHealth = await checkEmulatorHealth();
    assert.equal(offlineHealth.ok, false);
    assert.equal(offlineHealth.auth, false);
    assert.equal(offlineHealth.firestore, false);
    assert.ok(
      offlineHealth.error?.includes('HARD PRODUCTION SAFETY GATE') &&
        offlineHealth.error?.includes('DIBLOKIR SECARA KETAT'),
      'Safety Gate error message must strictly block fallback to Firebase Production'
    );

    // assertEmulatorActive must throw the safety gate violation
    let threw = false;
    try {
      await assertEmulatorActive();
    } catch (err: any) {
      threw = true;
      assert.ok(err.message.includes('HARD PRODUCTION SAFETY GATE'));
      assert.ok(err.message.includes('DIBLOKIR SECARA KETAT'));
    }
    assert.equal(threw, true, 'Startup MUST fail when emulators are offline');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 5. Source code audits: no hidden production fallback in src/lib/firebase.ts
  const fbSource = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/firebase.ts'), 'utf8');
  assert.ok(fbSource.includes('connectAuthEmulator'), 'connectAuthEmulator must be used');
  assert.ok(fbSource.includes('connectFirestoreEmulator'), 'connectFirestoreEmulator must be used');
  assert.ok(fbSource.includes('127.0.0.1'), '127.0.0.1 loopback binding must be enforced');
  assert.ok(fbSource.includes('9099'), 'Auth port 9099 must be configured');
  assert.ok(fbSource.includes('8080'), 'Firestore port 8080 must be configured');
  assert.ok(!fbSource.includes('fallbackToProduction'), 'No production fallback allowed');
});

runTest('CANONICAL-31-LOCK: Mengunci jumlah tepat 31 indikator, kode P01–P31, urutan, pembagian ranah, dan sentralisasi modul', () => {
  // 1. Tepat 31 Indikator
  assert.equal(AKHLAK_31_INDICATORS.length, 31, 'Jumlah indikator AKHLAK_31_INDICATORS harus tepat 31');

  // 2. Kode P01-P31 dan nomor 1-31 berurutan
  AKHLAK_31_INDICATORS.forEach((ind, index) => {
    const expectedNum = index + 1;
    const expectedCode = `P${String(expectedNum).padStart(2, '0')}`;
    assert.equal(ind.number, expectedNum, `Indikator ke-${index} harus bernomor ${expectedNum}`);
    assert.equal(ind.excelCode, expectedCode, `Indikator ${expectedNum} harus berkode ${expectedCode}`);
    assert.ok(ind.title && ind.title.trim().length > 5, `Indikator ${expectedCode} judul tidak boleh kosong`);
    assert.ok(ind.description && ind.description.trim().length > 10, `Indikator ${expectedCode} deskripsi tidak boleh kosong`);
  });

  // 3. Distribusi Ranah (5 Ranah Resmi)
  const domainA = AKHLAK_31_INDICATORS.filter((i) => i.domain === 'Akidah & Ibadah');
  const domainB = AKHLAK_31_INDICATORS.filter((i) => i.domain === 'Dzikir & Adab Ibadah');
  const domainC = AKHLAK_31_INDICATORS.filter((i) => i.domain === 'Adab Relasional');
  const domainD = AKHLAK_31_INDICATORS.filter((i) => i.domain === 'Integritas Pribadi');
  const domainE = AKHLAK_31_INDICATORS.filter((i) => i.domain === 'Disiplin & Kepedulian');

  assert.equal(domainA.length, 7, 'Ranah A (Akidah & Ibadah) harus berisi tepat 7 indikator (P01-P07)');
  assert.equal(domainB.length, 5, 'Ranah B (Dzikir & Adab Ibadah) harus berisi tepat 5 indikator (P08-P12)');
  assert.equal(domainC.length, 6, 'Ranah C (Adab Relasional) harus berisi tepat 6 indikator (P13-P18)');
  assert.equal(domainD.length, 7, 'Ranah D (Integritas Pribadi) harus berisi tepat 7 indikator (P19-P25)');
  assert.equal(domainE.length, 6, 'Ranah E (Disiplin & Kepedulian) harus berisi tepat 6 indikator (P26-P31)');
  assert.equal(domainA.length + domainB.length + domainC.length + domainD.length + domainE.length, 31);

  // 4. P25 & P27 terpisah secara tegas
  const p25 = AKHLAK_31_INDICATORS.find((i) => i.excelCode === 'P25');
  const p27 = AKHLAK_31_INDICATORS.find((i) => i.excelCode === 'P27');
  assert.ok(p25, 'P25 harus terdaftar');
  assert.ok(p27, 'P27 harus terdaftar');
  assert.equal(p25?.domain, 'Integritas Pribadi');
  assert.equal(p27?.domain, 'Disiplin & Kepedulian');
  assert.notEqual(p25?.title, p27?.title, 'P25 dan P27 tidak boleh memiliki judul yang sama');

  // 5. Sentralisasi: excelTemplate headers menggunakan kode yang identik 100%
  const templateCodes = PENILAIAN_HEADERS.slice(1, 1 + 31);
  const masterCodes = AKHLAK_31_INDICATORS.map((i) => i.excelCode);
  assert.deepEqual(templateCodes, masterCodes, 'Headers template Excel penilaian harus identik dengan master AKHLAK_31_INDICATORS');
});

runTest('DUAL-MASTER-01: Verifikasi Dual-Master (Legacy v1.0 & Canonical v2.0) & Imutabilitas', () => {
  // 1. Exactly 31 legacy indicators & 31 canonical indicators
  assert.equal(LEGACY_31_INDICATORS.length, 31, 'Legacy indicators must be exactly 31');
  assert.equal(CANONICAL_31_INDICATORS.length, 31, 'Canonical indicators must be exactly 31');
  assert.equal(AKHLAK_31_INDICATORS, LEGACY_31_INDICATORS, 'AKHLAK_31_INDICATORS must alias LEGACY_31_INDICATORS for 100% backward compatibility');

  // 2. Full P01-P31 sequential codes without duplicates
  const expectedCodes = Array.from({ length: 31 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
  assert.deepEqual(LEGACY_31_INDICATORS.map((i) => i.excelCode), expectedCodes, 'Legacy codes P01-P31');
  assert.deepEqual(CANONICAL_31_INDICATORS.map((i) => i.excelCode), expectedCodes, 'Canonical codes P01-P31');

  // 3. Domain separation
  // Legacy: 5 thematic domains (7, 5, 6, 7, 6)
  assert.equal(LEGACY_31_INDICATORS.filter((i) => i.domain === 'Akidah & Ibadah').length, 7);
  assert.equal(LEGACY_31_INDICATORS.filter((i) => i.domain === 'Dzikir & Adab Ibadah').length, 5);
  assert.equal(LEGACY_31_INDICATORS.filter((i) => i.domain === 'Adab Relasional').length, 6);
  assert.equal(LEGACY_31_INDICATORS.filter((i) => i.domain === 'Integritas Pribadi').length, 7);
  assert.equal(LEGACY_31_INDICATORS.filter((i) => i.domain === 'Disiplin & Kepedulian').length, 6);

  // Canonical: 5 Al-Chasanah relational domains (6, 2, 7, 6, 10) from [S2]
  assert.equal(CANONICAL_31_INDICATORS.filter((i) => i.domain === 'Akhlak kepada Allah SWT').length, 6);
  assert.equal(CANONICAL_31_INDICATORS.filter((i) => i.domain === 'Akhlak terhadap Rasul').length, 2);
  assert.equal(CANONICAL_31_INDICATORS.filter((i) => i.domain === 'Akhlak terhadap Orang Tua').length, 7);
  assert.equal(CANONICAL_31_INDICATORS.filter((i) => i.domain === 'Akhlak terhadap Guru').length, 6);
  assert.equal(CANONICAL_31_INDICATORS.filter((i) => i.domain === 'Akhlak terhadap Sesama Teman').length, 10);

  // 4. Verification of exact canonical wording from primary source [S2]
  const p01Can = CANONICAL_31_INDICATORS[0];
  assert.equal(p01Can.title, 'Melaksanakan ibadah shalat (shalat dhuha dan shalat zuhur berjamaah)');
  assert.equal(p01Can.description, 'Melaksanakan ibadah shalat (shalat dhuha dan shalat zuhur berjamaah)');

  const p03Can = CANONICAL_31_INDICATORS[2];
  assert.equal(p03Can.title, "Mengikuti kegiatan tahfiz, membaca surah Yasin, dan sholawat Imrithi (khusus hari Jum'at)");

  const p25Can = CANONICAL_31_INDICATORS[24];
  const p27Can = CANONICAL_31_INDICATORS[26];
  assert.equal(p25Can.title, 'Saling memaafkan jika ada teman yang berbuat salah');
  assert.equal(p27Can.title, 'Bersikap pemaaf terhadap sesama');
  assert.notEqual(p25Can.title, p27Can.title, 'P25 and P27 must remain distinct');

  // 5. Metadata verification & lifecycle separation
  const v1Meta = INSTRUMENT_DEFINITIONS['v1.0-legacy'];
  assert.equal(v1Meta.version, 'v1.0-legacy');
  assert.equal(v1Meta.instrumentStatus, 'ACTIVE_PRODUCTION');
  assert.equal(v1Meta.approvalStatus, 'OPERATIONAL_LEGACY');
  assert.equal(v1Meta.effectiveDate, null);
  assert.equal(v1Meta.indicators.length, 31);

  const v2Meta = INSTRUMENT_DEFINITIONS['v2.0-canonical'];
  assert.equal(v2Meta.version, 'v2.0-canonical');
  assert.equal(v2Meta.instrumentStatus, 'EMULATOR_TESTING_ONLY');
  assert.equal(v2Meta.approvalStatus, 'PENDING_FOUNDATION_DECREE');
  assert.equal(v2Meta.effectiveDate, null);
  assert.equal(v2Meta.indicators.length, 31);
});

await Promise.all(asyncTests);







