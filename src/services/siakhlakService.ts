import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  AcademicPeriod,
  AcademicYearDoc,
  AccountStatus,
  CanonicalRole,
  ClassAssignment,
  ClassStudentHistory,
  Cohort,
  CommitteeMemberProfile,
  DecisionExecutionStatus,
  DEFAULT_ORGANIZATION_ID,
  defaultPermissionsForRole,
  EducationLevel,
  EducationUnit,
  FindingAspect,
  FindingPriority,
  FollowUpStatus,
  FoundationAdminProfile,
  GuardianProfile,
  isAccountActive,
  LifecycleStatus,
  LoginPortal,
  matchesEducationLevel,
  MutabaahLog,
  normalizeAccountStatus,
  normalizeEducationLevel,
  normalizeRole,
  normalizeRolesList,
  PermissionKey,
  ProfileStatus,
  ProgramCategory,
  ProgramStatus,
  roleLabel as roleLabelCanonical,
  SchoolClass,
  SemesterDoc,
  Student,
  StudentAssessment,
  StudentGuardian,
  StudentLoginSelection,
  Teacher,
  TeacherLoginSelection,
  UnitCode,
  UnitScope,
  UserPermissionsDoc,
  UserProfile,
  UserRole,
  VerificationStatus,
} from '../types/siakhlak';
import { ParsedAssessmentPreview } from '../utils/excelImportEngine';

export function formatFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const raw = err instanceof Error ? err.message : String(err || '');
  const haystack = `${code} ${raw}`;

  if (
    haystack.includes('auth/operation-not-allowed') ||
    haystack.includes('auth/admin-restricted-operation')
  ) {
    return 'Login Email/Password belum diaktifkan oleh administrator sistem. Silakan hubungi Admin Yayasan.';
  }
  if (
    haystack.includes('auth/invalid-credential') ||
    haystack.includes('auth/wrong-password')
  ) {
    return 'Email atau password yang Anda masukkan salah.';
  }
  if (haystack.includes('auth/user-not-found')) {
    return 'Akun email tidak ditemukan pada sistem autentikasi.';
  }
  if (haystack.includes('auth/invalid-email')) {
    return 'Format alamat email tidak valid.';
  }
  if (haystack.includes('auth/user-disabled')) {
    return 'Akun Anda telah dinonaktifkan pada sistem autentikasi. Hubungi Admin Yayasan.';
  }
  if (haystack.includes('auth/too-many-requests')) {
    return 'Terlalu banyak percobaan login gagal. Tunggu beberapa menit sebelum mencoba lagi.';
  }
  if (haystack.includes('auth/network-request-failed')) {
    return 'Koneksi jaringan bermasalah. Periksa koneksi internet Anda lalu coba kembali.';
  }
  if (
    haystack.includes('auth/popup-closed-by-user') ||
    haystack.includes('auth/cancelled-popup-request')
  ) {
    return 'Proses masuk dengan Google dibatalkan sebelum selesai.';
  }
  return 'Autentikasi gagal diproses. Periksa kembali akun dan koneksi Anda atau hubungi Admin Yayasan.';
}

const clampStr = (val: string, max: number) => val.trim().slice(0, max);

export function formatTimestamp(ts: unknown): string {
  if (!ts) return '-';
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'toDate' in ts &&
    typeof (ts as { toDate: () => Date }).toDate === 'function'
  ) {
    const d = (ts as { toDate: () => Date }).toDate();
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (typeof ts === 'string') {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
    return ts;
  }
  return '-';
}

export function normalizeUserProfileDoc(
  id: string,
  raw: Record<string, unknown>,
  permDoc?: UserPermissionsDoc | null
): UserProfile {
  const roles = normalizeRolesList(
    Array.isArray(raw.roles) ? (raw.roles as string[]) : null,
    typeof raw.role === 'string' ? raw.role : null
  );
  const primaryRole = roles[0] || 'STUDENT';
  const fullName =
    (typeof raw.full_name === 'string' && raw.full_name) ||
    (typeof raw.displayName === 'string' && raw.displayName) ||
    'Pengguna SIAKHLAK';

  const accountStatus: LifecycleStatus = normalizeAccountStatus(
    typeof raw.account_status === 'string' ? raw.account_status : 'ACTIVE'
  );

  const rawUnits = Array.isArray(raw.assignedUnits)
    ? (raw.assignedUnits as string[])
    : permDoc?.assigned_units || [];
  const normalizedUnits = Array.from(
    new Set(rawUnits.map((u) => normalizeEducationLevel(u)))
  ) as EducationLevel[];

  const profileStatus: ProfileStatus | undefined =
    raw.profile_status === 'PENDING' ||
    raw.profile_status === 'VERIFIED' ||
    raw.profile_status === 'REJECTED'
      ? raw.profile_status
      : accountStatus === 'PENDING' || accountStatus === 'PENDING_VERIFICATION'
      ? 'PENDING'
      : 'VERIFIED';

  const emailVerified =
    typeof raw.emailVerified === 'boolean'
      ? raw.emailVerified
      : typeof raw.email_verified === 'boolean'
      ? raw.email_verified
      : undefined;

  const requestedPortal =
    raw.requested_portal === 'parent_student' ||
    raw.requested_portal === 'teacher' ||
    raw.requested_portal === 'committee' ||
    raw.requested_portal === 'foundation'
      ? raw.requested_portal
      : undefined;

  const requestedRole =
    typeof raw.requested_role === 'string'
      ? normalizeRole(raw.requested_role)
      : undefined;

  return {
    id,
    uid: typeof raw.uid === 'string' ? raw.uid : id,
    email: typeof raw.email === 'string' ? raw.email : '',
    full_name: fullName,
    displayName: fullName,
    phone: typeof raw.phone === 'string' ? raw.phone : undefined,
    profile_photo: typeof raw.profile_photo === 'string' ? raw.profile_photo : undefined,
    roles,
    role: primaryRole,
    account_status: accountStatus,
    profile_status: profileStatus,
    ...(emailVerified !== undefined ? { emailVerified } : {}),
    requested_portal: requestedPortal,
    requested_role: requestedRole,
    organization_id:
      typeof raw.organization_id === 'string' && raw.organization_id
        ? raw.organization_id
        : DEFAULT_ORGANIZATION_ID,
    assignedUnits: normalizedUnits,
    assignedClassIds: Array.isArray(raw.assignedClassIds)
      ? (raw.assignedClassIds as string[])
      : permDoc?.assigned_classes || [],
    linkedStudentIds: Array.isArray(raw.linkedStudentIds)
      ? (raw.linkedStudentIds as string[])
      : [],
    permissions: permDoc?.permissions || defaultPermissionsForRole(primaryRole),
    allowIndividualStudentAccess: Boolean(raw.allowIndividualStudentAccess),
    created_at: raw.created_at || raw.createdAt,
    updated_at: raw.updated_at || raw.updatedAt,
    createdAt: raw.createdAt || raw.created_at,
    updatedAt: raw.updatedAt || raw.updated_at,
  };
}

export async function ensureUserProfile(
  user: User,
  requestedPortal?: LoginPortal
): Promise<UserProfile> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const permRef = doc(db, 'user_permissions', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      let permDoc: UserPermissionsDoc | null = null;
      try {
        const permSnap = await getDoc(permRef);
        if (permSnap.exists()) {
          permDoc = {
            id: permSnap.id,
            ...(permSnap.data() as Omit<UserPermissionsDoc, 'id'>),
          };
        }
      } catch {
        // Ignore if permissions doc hasn't been initialized yet
      }
      return normalizeUserProfileDoc(snap.id, snap.data() as Record<string, unknown>, permDoc);
    }

    const initialRole: CanonicalRole = 'STUDENT';
    const initialStatus: LifecycleStatus = user.emailVerified ? 'PENDING' : 'PENDING_VERIFICATION';
    const initialProfileStatus: ProfileStatus = 'PENDING';
    const fullName = clampStr(
      user.displayName || user.email?.split('@')[0] || 'Pengguna SIAKHLAK',
      120
    );

    const payload: Record<string, unknown> = {
      uid: user.uid,
      email: clampStr(user.email || 'user@siakhlak.local', 200),
      full_name: fullName,
      displayName: fullName,
      roles: [initialRole],
      role: initialRole,
      account_status: initialStatus,
      profile_status: initialProfileStatus,
      emailVerified: Boolean(user.emailVerified),
      organization_id: DEFAULT_ORGANIZATION_ID,
      assignedUnits: [] as UnitCode[],
      assignedClassIds: [] as string[],
      linkedStudentIds: [] as string[],
      allowIndividualStudentAccess: false,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (requestedPortal) {
      payload.requested_portal = requestedPortal;
    }
    if (user.photoURL) {
      payload.profile_photo = clampStr(user.photoURL, 500);
    }

    await setDoc(ref, payload);

    const created = await getDoc(ref);
    return normalizeUserProfileDoc(created.id, created.data() as Record<string, unknown>, null);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Read-only profile lookup used for Student Login flow so unregistered accounts
 * are strictly rejected and NEVER auto-created during login.
 */
export async function fetchRegisteredUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const permRef = doc(db, 'user_permissions', uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return null;
    }
    let permDoc: UserPermissionsDoc | null = null;
    try {
      const permSnap = await getDoc(permRef);
      if (permSnap.exists()) {
        permDoc = {
          id: permSnap.id,
          ...(permSnap.data() as Omit<UserPermissionsDoc, 'id'>),
        };
      }
    } catch {
      // Ignore optional permissions lookup error
    }
    return normalizeUserProfileDoc(snap.id, snap.data() as Record<string, unknown>, permDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function filterActiveAllowedAcademicYears(
  years: AcademicYearDoc[]
): AcademicYearDoc[] {
  return [...years]
    .filter((y) => Boolean(y.isActive) && (y.status || 'ACTIVE') === 'ACTIVE')
    .sort((a, b) => {
      const startA = (a.startDate || '').trim();
      const startB = (b.startDate || '').trim();
      if (startA !== startB) return startB.localeCompare(startA);
      return (b.yearName || '').localeCompare(a.yearName || '');
    });
}

export function extractUnitsForEducationLevel(
  classes: SchoolClass[],
  level: EducationLevel
): { unitId: string; unitLabel: string }[] {
  const normalizedTarget = normalizeEducationLevel(level);
  const map = new Map<string, string>();
  for (const cls of classes) {
    if ((cls.status || 'ACTIVE') !== 'ACTIVE') continue;
    const clsLevel = normalizeEducationLevel(cls.educationLevel || cls.unitCode);
    if (clsLevel !== normalizedTarget) continue;
    const rawUnitId = (cls.educationUnitId || clsLevel).trim().toUpperCase();
    if (!map.has(rawUnitId)) {
      const defaultLabel =
        rawUnitId === 'KB'
          ? 'KB (Kelompok Bermain)'
          : rawUnitId === 'TK'
          ? 'TK (Taman Kanak-Kanak)'
          : rawUnitId;
      map.set(rawUnitId, cls.educationUnitName?.trim() || defaultLabel);
    }
  }
  return Array.from(map.entries())
    .map(([unitId, unitLabel]) => ({ unitId, unitLabel }))
    .sort((a, b) => a.unitId.localeCompare(b.unitId));
}

export function filterStudentLoginClasses(
  classes: SchoolClass[],
  level: EducationLevel,
  academicYearId: string,
  unitId?: string
): SchoolClass[] {
  if (!academicYearId || !academicYearId.trim()) return [];
  const normalizedTarget = normalizeEducationLevel(level);
  const cleanUnit = unitId?.trim().toUpperCase();
  return [...classes]
    .filter((cls) => {
      if ((cls.status || 'ACTIVE') !== 'ACTIVE') return false;
      const clsLevel = normalizeEducationLevel(cls.educationLevel || cls.unitCode);
      if (clsLevel !== normalizedTarget) return false;
      if ((cls.academicYearId || '').trim() !== academicYearId.trim()) return false;
      if (cleanUnit) {
        const clsUnit = (cls.educationUnitId || clsLevel).trim().toUpperCase();
        if (clsUnit !== cleanUnit) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const lvlCmp = (a.level || '').localeCompare(b.level || '');
      if (lvlCmp !== 0) return lvlCmp;
      return (a.name || '').localeCompare(b.name || '');
    });
}

export function validateStudentLoginPlacement(params: {
  profile: UserProfile | null;
  studentDoc: Student | null;
  selection?: Partial<StudentLoginSelection> | null;
  selectedClass?: SchoolClass | null;
  selectedYear?: AcademicYearDoc | null;
}): {
  valid: boolean;
  code?: string;
  reason?: string;
} {
  const { profile, studentDoc, selection, selectedClass, selectedYear } = params;

  if (!profile) {
    return {
      valid: false,
      code: 'UNREGISTERED_USER',
      reason:
        'Akun Anda belum terdaftar oleh Admin Yayasan di sistem SIAKHLAK. Login siswa tidak membuat akun otomatis.',
    };
  }
  if (!isAccountActive(profile.account_status)) {
    return {
      valid: false,
      code: 'INACTIVE_USER',
      reason: `Status akun Anda adalah ${profile.account_status}. Hanya akun siswa ACTIVE yang dapat masuk.`,
    };
  }
  if (normalizeRole(profile.role) !== 'STUDENT') {
    return {
      valid: false,
      code: 'ROLE_MISMATCH',
      reason: 'Akun ini tidak terdaftar sebagai peran Siswa (STUDENT).',
    };
  }
  if (!studentDoc) {
    return {
      valid: false,
      code: 'UNREGISTERED_STUDENT',
      reason:
        'Data siswa Anda belum terdaftar atau belum ditautkan pada master data sekolah. Hubungi Admin Yayasan.',
    };
  }
  const studentActive = isAccountActive(
    studentDoc.account_status || studentDoc.status || 'ACTIVE'
  );
  if (!studentActive) {
    return {
      valid: false,
      code: 'INACTIVE_STUDENT',
      reason: 'Status peserta didik pada data sekolah saat ini tidak aktif.',
    };
  }
  const officialStudentUid = studentDoc.student_uid || studentDoc.studentUid;
  if (officialStudentUid && officialStudentUid !== profile.uid) {
    return {
      valid: false,
      code: 'UID_MISMATCH',
      reason: 'Data siswa tidak sesuai dengan identitas autentikasi akun Anda.',
    };
  }

  // When explicit class selection is provided (e.g. URL query or explicit placement verification), enforce it.
  if (selection) {
    if (!selection.educationLevel || !selection.academicYearId || !selection.classId) {
      return {
        valid: false,
        code: 'MISSING_SELECTION',
        reason: 'Pilihan jenjang pendidikan, tahun ajaran, dan kelas tidak lengkap.',
      };
    }
    if (selectedYear && (!selectedYear.isActive || selectedYear.status !== 'ACTIVE')) {
      return {
        valid: false,
        code: 'INACTIVE_YEAR',
        reason: 'Tahun ajaran yang dipilih tidak berstatus aktif.',
      };
    }
    if (selectedClass && (selectedClass.status || 'ACTIVE') !== 'ACTIVE') {
      return {
        valid: false,
        code: 'INACTIVE_CLASS',
        reason: 'Kelas yang dipilih tidak berstatus aktif.',
      };
    }
    const studentLevel = normalizeEducationLevel(
      studentDoc.education_level || studentDoc.unitCode
    );
    const selectedLevel = normalizeEducationLevel(selection.educationLevel);
    if (studentLevel !== selectedLevel) {
      return {
        valid: false,
        code: 'LEVEL_MISMATCH',
        reason: `Jenjang pendidikan pilihan (${selectedLevel}) tidak sesuai dengan jenjang resmi Anda (${studentLevel}).`,
      };
    }
    if (selection.educationUnitId && selection.educationUnitId.trim()) {
      const officialUnitId = (studentDoc.education_unit_id || studentLevel).trim().toUpperCase();
      if (officialUnitId !== selection.educationUnitId.trim().toUpperCase()) {
        return {
          valid: false,
          code: 'UNIT_MISMATCH',
          reason: `Unit pendidikan pilihan (${selection.educationUnitId}) tidak sesuai dengan unit resmi Anda (${officialUnitId}).`,
        };
      }
    }
    const officialClassId = (studentDoc.class_id || studentDoc.classId || '').trim();
    if (!officialClassId || officialClassId !== selection.classId.trim()) {
      return {
        valid: false,
        code: 'CLASS_MISMATCH',
        reason: `Kelas yang dipilih tidak sesuai dengan kelas aktif Anda (${studentDoc.className || officialClassId || '-'}).`,
      };
    }
    const officialYearId = (
      studentDoc.academic_year_id ||
      selectedClass?.academicYearId ||
      ''
    ).trim();
    if (!officialYearId || officialYearId !== selection.academicYearId.trim()) {
      return {
        valid: false,
        code: 'YEAR_MISMATCH',
        reason: 'Tahun ajaran yang dipilih tidak sesuai dengan penempatan akademik aktif Anda.',
      };
    }
  }
  return { valid: true };
}

export function validateTeacherLoginAssignment(params: {
  profile: UserProfile | null;
  selection: Partial<TeacherLoginSelection> | null;
  selectedClass?: SchoolClass | null;
  selectedYear?: AcademicYearDoc | null;
  classAssignments: ClassAssignment[];
}): {
  valid: boolean;
  code?: string;
  reason?: string;
} {
  const { profile, selection, selectedClass, selectedYear, classAssignments } = params;

  if (!profile) {
    return {
      valid: false,
      code: 'UNREGISTERED_USER',
      reason:
        'Akun Guru Anda belum terdaftar oleh Admin Yayasan di sistem SIAKHLAK. Hubungi Admin Yayasan.',
    };
  }
  if (!isAccountActive(profile.account_status)) {
    return {
      valid: false,
      code: 'INACTIVE_USER',
      reason: `Status akun Anda adalah ${profile.account_status}. Hanya akun Guru ACTIVE yang dapat masuk.`,
    };
  }
  const canonicalRole = normalizeRole(profile.role);
  if (canonicalRole !== 'TEACHER' && canonicalRole !== 'HOMEROOM_TEACHER') {
    return {
      valid: false,
      code: 'ROLE_MISMATCH',
      reason: 'Akun ini tidak terdaftar sebagai peran Guru atau Wali Kelas.',
    };
  }
  if (
    !selection ||
    !selection.educationLevel ||
    !selection.academicYearId ||
    !selection.classId
  ) {
    return {
      valid: false,
      code: 'MISSING_SELECTION',
      reason: 'Jenjang pendidikan, tahun ajaran aktif, dan kelas wajib dipilih sebelum login guru.',
    };
  }
  if (selectedYear && (!selectedYear.isActive || selectedYear.status !== 'ACTIVE')) {
    return {
      valid: false,
      code: 'INACTIVE_YEAR',
      reason: 'Tahun ajaran yang dipilih tidak berstatus aktif.',
    };
  }
  if (!selectedClass) {
    return {
      valid: false,
      code: 'CLASS_NOT_FOUND',
      reason:
        'Kelas yang dipilih tidak ditemukan atau belum diaktifkan pada master data sekolah.',
    };
  }
  if ((selectedClass.status || 'ACTIVE') !== 'ACTIVE') {
    return {
      valid: false,
      code: 'INACTIVE_CLASS',
      reason: 'Kelas yang dipilih tidak berstatus aktif.',
    };
  }
  const selectedLevel = normalizeEducationLevel(selection.educationLevel);
  const classLevel = normalizeEducationLevel(
    selectedClass.educationLevel || selectedClass.unitCode
  );
  if (classLevel !== selectedLevel) {
    return {
      valid: false,
      code: 'LEVEL_MISMATCH',
      reason: `Kelas ${selectedClass.name} berada pada jenjang ${classLevel}, bukan jenjang ${selectedLevel}.`,
    };
  }
  if (selection.educationUnitId && selection.educationUnitId.trim()) {
    const classUnitId = (selectedClass.educationUnitId || classLevel).trim().toUpperCase();
    if (classUnitId !== selection.educationUnitId.trim().toUpperCase()) {
      return {
        valid: false,
        code: 'UNIT_MISMATCH',
        reason: `Kelas ${selectedClass.name} tidak termasuk dalam unit pendidikan ${selection.educationUnitId}.`,
      };
    }
  }
  if (
    selectedClass.academicYearId &&
    selectedClass.academicYearId.trim() !== selection.academicYearId.trim()
  ) {
    return {
      valid: false,
      code: 'YEAR_MISMATCH',
      reason: `Kelas ${selectedClass.name} tidak terdaftar pada tahun ajaran yang dipilih.`,
    };
  }

  const activeTeacherAssignments = classAssignments.filter(
    (ca) => ca.teacher_uid === profile.uid && ca.assignment_status === 'active'
  );
  const matchingActiveAssignment = activeTeacherAssignments.find(
    (ca) =>
      ca.class_id === selection.classId &&
      (!ca.academic_year_id || ca.academic_year_id === selection.academicYearId) &&
      normalizeEducationLevel(ca.education_unit_id) === selectedLevel
  );
  const hasExplicitClassOnUserDoc =
    classAssignments.length === 0 &&
    (profile.assignedClassIds || []).includes(selection.classId) &&
    (profile.assignedUnits.length === 0 ||
      profile.assignedUnits.some((u) => matchesEducationLevel(selectedLevel, u)));

  const unitAuthorized =
    Boolean(matchingActiveAssignment) ||
    profile.assignedUnits.some((u) => matchesEducationLevel(selectedLevel, u));

  if (!unitAuthorized || (!matchingActiveAssignment && !hasExplicitClassOnUserDoc)) {
    return {
      valid: false,
      code: 'TEACHER_CLASS_UNAUTHORIZED',
      reason:
        'Anda tidak terdaftar sebagai pengajar pada kelas yang dipilih. Silakan periksa penugasan Anda atau hubungi Admin Yayasan.',
    };
  }

  return { valid: true };
}

export function subscribeStudentLoginCatalog(
  onYears: (years: AcademicYearDoc[]) => void,
  onClasses: (classes: SchoolClass[]) => void,
  onErr?: (err: Error) => void,
  onUnits?: (units: EducationUnit[]) => void
): Unsubscribe {
  const yearsQ = query(
    collection(db, 'academic_years'),
    where('isActive', '==', true),
    where('status', '==', 'ACTIVE')
  );
  const classesQ = query(collection(db, 'classes'), where('status', '==', 'ACTIVE'));
  const unitsQ = query(collection(db, 'units'), where('status', '==', 'ACTIVE'));

  const uYears = onSnapshot(
    yearsQ,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AcademicYearDoc);
      onYears(filterActiveAllowedAcademicYears(items));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'academic_years');
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );

  const uClasses = onSnapshot(
    classesQ,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SchoolClass);
      onClasses(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'classes');
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );

  const uUnits = onUnits
    ? onSnapshot(
        unitsQ,
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EducationUnit);
          onUnits(items);
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, 'units');
          } catch (e) {
            if (onErr) onErr(e as Error);
          }
        }
      )
    : () => {};

  return () => {
    uYears();
    uClasses();
    uUnits();
  };
}

export const subscribeLoginCatalog = subscribeStudentLoginCatalog;

// --- Pending Onboarding Profile Submission (PENDING user only) ---
export interface PendingOnboardingInput {
  portal: LoginPortal;
  requestedRole: 'STUDENT' | 'PARENT' | 'TEACHER' | 'COMMITTEE_ADMIN';
  full_name: string;
  phone: string;
  address?: string;
  // Student fields
  nis?: string;
  nisn?: string;
  birth_place?: string;
  birth_date?: string;
  gender?: 'L' | 'P';
  education_level?: EducationLevel;
  admission_year?: string;
  requested_class_name?: string;
  // Parent fields
  relationship_type?: 'ayah' | 'ibu' | 'wali';
  child_nis?: string;
  child_name?: string;
  // Teacher fields
  employee_number?: string;
  position?: string;
  employment_status?: 'TETAP' | 'KONTRAK' | 'HONORER';
  teaching_subjects?: string;
  is_pai_teacher?: boolean;
  // Committee fields
  committee_position?: string;
  appointment_number?: string;
}

export async function submitPendingOnboardingProfile(
  uid: string,
  email: string,
  input: PendingOnboardingInput
): Promise<void> {
  const cleanName = clampStr(input.full_name, 120);
  const cleanPhone = clampStr(input.phone, 40);
  const cleanAddress = clampStr(input.address || '', 400);
  const level = normalizeEducationLevel(input.education_level || 'SD');

  try {
    // 1. Update personal onboarding metadata on users/{uid} (never changes role or activates account)
    await updateDoc(doc(db, 'users', uid), {
      full_name: cleanName,
      displayName: cleanName,
      phone: cleanPhone,
      requested_portal: input.portal,
      requested_role: input.requestedRole,
      profile_status: 'PENDING',
      updated_at: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. Write role-specific onboarding draft document with profile_status: 'PENDING', status: 'PENDING'
    if (input.requestedRole === 'STUDENT') {
      const stuDocId = `onb_stu_${uid}`.slice(0, 128);
      await setDoc(doc(db, 'students', stuDocId), {
        nis: clampStr(input.nis || `CALON-${uid.slice(0, 6)}`, 50),
        ...(input.nisn?.trim() ? { nisn: clampStr(input.nisn, 30) } : {}),
        name: cleanName,
        full_name: cleanName,
        birth_place: clampStr(input.birth_place || '', 80),
        birth_date: clampStr(input.birth_date || '', 20),
        gender: input.gender || 'L',
        address: cleanAddress,
        phone: cleanPhone,
        unitCode: level,
        education_level: level,
        admission_year: clampStr(input.admission_year || String(new Date().getFullYear()), 10),
        classId: 'PENDING_PLACEMENT',
        className: clampStr(input.requested_class_name || 'Menunggu Penempatan', 80),
        studentUid: uid,
        profile_status: 'PENDING' as ProfileStatus,
        status: 'PENDING' as LifecycleStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (input.requestedRole === 'PARENT') {
      const guardDocId = `onb_guard_${uid}`.slice(0, 128);
      await setDoc(doc(db, 'guardians', guardDocId), {
        user_uid: uid,
        full_name: cleanName,
        email: clampStr(email, 200),
        phone: cleanPhone,
        address: cleanAddress,
        relationship_type: input.relationship_type || 'wali',
        linked_student_ids: [] as string[],
        requested_child_info: clampStr(
          `${input.child_nis || '-'} | ${input.child_name || '-'}`,
          200
        ),
        verification_status: 'pending',
        status: 'PENDING' as LifecycleStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (input.requestedRole === 'TEACHER') {
      const teacherDocId = `onb_tchr_${uid}`.slice(0, 128);
      const subjects = (input.teaching_subjects || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 15);
      await setDoc(doc(db, 'teachers', teacherDocId), {
        user_uid: uid,
        nip: clampStr(input.employee_number || `NIP-${uid.slice(0, 6)}`, 50),
        employee_number: clampStr(input.employee_number || '', 50),
        name: cleanName,
        full_name: cleanName,
        email: clampStr(email, 200),
        phone: cleanPhone,
        address: cleanAddress,
        gender: input.gender || 'L',
        unitCode: level,
        education_level: level,
        roleTitle: clampStr(input.position || 'Guru', 100),
        position: clampStr(input.position || 'Guru', 100),
        employment_status: input.employment_status || 'TETAP',
        teaching_subjects: subjects,
        isPaiTeacher: Boolean(input.is_pai_teacher),
        profile_status: 'PENDING' as ProfileStatus,
        status: 'PENDING' as LifecycleStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (input.requestedRole === 'COMMITTEE_ADMIN') {
      const comDocId = `onb_com_${uid}`.slice(0, 128);
      await setDoc(doc(db, 'committee_members', comDocId), {
        user_uid: uid,
        full_name: cleanName,
        email: clampStr(email, 200),
        phone: cleanPhone,
        committee_position: clampStr(input.committee_position || 'Anggota Komite', 100),
        appointment_number: clampStr(input.appointment_number || 'Menunggu SK', 100),
        appointment_date: '',
        term_start: '',
        term_end: '',
        membership_status: 'INACTIVE',
        profile_status: 'PENDING' as ProfileStatus,
        status: 'PENDING' as LifecycleStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

// --- Active User Self Profile Update ("Profil Saya" — restricted personal fields only) ---
export async function updateMyProfile(
  uid: string,
  role: CanonicalRole,
  updates: {
    full_name: string;
    phone?: string;
    address?: string;
    profile_photo?: string;
    linkedEntityDocId?: string;
  }
): Promise<void> {
  const cleanName = clampStr(updates.full_name, 120);
  if (!cleanName) throw new Error('Nama lengkap wajib diisi.');

  const userPatch: Record<string, unknown> = {
    full_name: cleanName,
    displayName: cleanName,
    updated_at: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (updates.phone !== undefined) userPatch.phone = clampStr(updates.phone, 40);
  if (updates.profile_photo !== undefined) {
    userPatch.profile_photo = clampStr(updates.profile_photo, 500);
  }

  try {
    await updateDoc(doc(db, 'users', uid), userPatch);

    if (updates.linkedEntityDocId) {
      if (role === 'STUDENT') {
        const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
        if (updates.phone !== undefined) patch.phone = clampStr(updates.phone, 40);
        if (updates.address !== undefined) patch.address = clampStr(updates.address, 400);
        if (updates.profile_photo !== undefined)
          patch.profile_photo = clampStr(updates.profile_photo, 500);
        await updateDoc(doc(db, 'students', updates.linkedEntityDocId), patch);
      } else if (role === 'PARENT') {
        const patch: Record<string, unknown> = {
          full_name: cleanName,
          updatedAt: serverTimestamp(),
        };
        if (updates.phone !== undefined) patch.phone = clampStr(updates.phone, 40);
        if (updates.address !== undefined) patch.address = clampStr(updates.address, 400);
        if (updates.profile_photo !== undefined)
          patch.profile_photo = clampStr(updates.profile_photo, 500);
        await updateDoc(doc(db, 'guardians', updates.linkedEntityDocId), patch);
      } else if (role === 'TEACHER' || role === 'HOMEROOM_TEACHER') {
        const patch: Record<string, unknown> = {
          name: cleanName,
          full_name: cleanName,
          updatedAt: serverTimestamp(),
        };
        if (updates.phone !== undefined) patch.phone = clampStr(updates.phone, 40);
        if (updates.address !== undefined) patch.address = clampStr(updates.address, 400);
        if (updates.profile_photo !== undefined)
          patch.profile_photo = clampStr(updates.profile_photo, 500);
        await updateDoc(doc(db, 'teachers', updates.linkedEntityDocId), patch);
      } else if (role === 'COMMITTEE_ADMIN') {
        const patch: Record<string, unknown> = {
          full_name: cleanName,
          updatedAt: serverTimestamp(),
        };
        if (updates.phone !== undefined) patch.phone = clampStr(updates.phone, 40);
        if (updates.profile_photo !== undefined)
          patch.profile_photo = clampStr(updates.profile_photo, 500);
        await updateDoc(doc(db, 'committee_members', updates.linkedEntityDocId), patch);
      } else if (role === 'FOUNDATION_ADMIN' || role === 'SUPER_ADMIN') {
        const patch: Record<string, unknown> = {
          full_name: cleanName,
          updatedAt: serverTimestamp(),
        };
        if (updates.phone !== undefined) patch.phone = clampStr(updates.phone, 40);
        if (updates.profile_photo !== undefined)
          patch.profile_photo = clampStr(updates.profile_photo, 500);
        await updateDoc(doc(db, 'foundation_admins', updates.linkedEntityDocId), patch);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export function subscribeUserProfile(
  uid: string,
  cb: (profile: UserProfile | null) => void,
  onErr?: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
      } else {
        cb(normalizeUserProfileDoc(snap.id, snap.data() as Record<string, unknown>));
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );
}

export function subscribeUserPermissions(
  uid: string,
  cb: (permDoc: UserPermissionsDoc | null) => void,
  onErr?: (err: Error) => void
): Unsubscribe {
  const path = `user_permissions/${uid}`;
  return onSnapshot(
    doc(db, 'user_permissions', uid),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
      } else {
        cb({ id: snap.id, ...(snap.data() as Omit<UserPermissionsDoc, 'id'>) });
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );
}

export function subscribeCollection<T>(
  collectionName: string,
  cb: (items: T[]) => void,
  orderField?: string,
  onErr?: (err: Error) => void
): Unsubscribe {
  const ref = collection(db, collectionName);
  const q = orderField ? query(ref, orderBy(orderField, 'desc')) : ref;
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
      cb(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, collectionName);
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );
}

function extractTimestampMs(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (
    typeof val === 'object' &&
    val !== null &&
    'toMillis' in val &&
    typeof (val as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (
    typeof val === 'object' &&
    val !== null &&
    'seconds' in val &&
    typeof (val as { seconds: number }).seconds === 'number'
  ) {
    return (val as { seconds: number }).seconds * 1000;
  }
  return 0;
}

export function expandAssignedUnitsForQuery(assignedUnits: readonly string[]): string[] {
  const expanded = new Set<string>();
  for (const raw of assignedUnits) {
    const clean = String(raw || '').trim().toUpperCase();
    if (!clean) continue;
    if (clean === 'TK' || clean === 'KB/TK') {
      expanded.add('TK');
      expanded.add('KB/TK');
    } else if (clean === 'SD' || clean === 'SD/SDI') {
      expanded.add('SD');
      expanded.add('SD/SDI');
    } else {
      expanded.add(clean);
    }
  }
  return Array.from(expanded).slice(0, 10);
}

export function subscribeUnitScopedCollection<T>(
  collectionName: 'students' | 'studentAssessments' | 'mutabaahLogs',
  assignedUnits: readonly string[],
  cb: (items: T[]) => void,
  onErr?: (err: Error) => void
): Unsubscribe {
  const expandedUnits = expandAssignedUnitsForQuery(assignedUnits);
  if (expandedUnits.length === 0) {
    cb([]);
    return () => {};
  }
  const q = query(
    collection(db, collectionName),
    where('unitCode', 'in', expandedUnits)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as T)
        .sort(
          (a, b) =>
            extractTimestampMs((b as { createdAt?: unknown }).createdAt) -
            extractTimestampMs((a as { createdAt?: unknown }).createdAt)
        );
      cb(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, collectionName);
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );
}

export function subscribeClassScopedCollection<T>(
  collectionName: 'students' | 'studentAssessments' | 'mutabaahLogs',
  assignedClassIds: readonly string[],
  cb: (items: T[]) => void,
  onErr?: (err: Error) => void
): Unsubscribe {
  const cleanClassIds = Array.from(
    new Set(assignedClassIds.map((id) => id.trim()).filter(Boolean))
  ).slice(0, 10);
  if (cleanClassIds.length === 0) {
    cb([]);
    return () => {};
  }
  const q = query(
    collection(db, collectionName),
    where('classId', 'in', cleanClassIds)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as T)
        .sort(
          (a, b) =>
            extractTimestampMs((b as { createdAt?: unknown }).createdAt) -
            extractTimestampMs((a as { createdAt?: unknown }).createdAt)
        );
      cb(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, collectionName);
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );
}

export function subscribeAllUsers(
  cb: (users: UserProfile[]) => void,
  onErr?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'users'),
    (snap) => {
      const items = snap.docs.map((d) =>
        normalizeUserProfileDoc(d.id, d.data() as Record<string, unknown>)
      );
      cb(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'users');
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );
}

export function subscribeOwnOnboardingDocs(
  uid: string,
  cb: (data: {
    student?: Student | null;
    guardian?: GuardianProfile | null;
    teacher?: Teacher | null;
    committee?: CommitteeMemberProfile | null;
    foundationAdmin?: FoundationAdminProfile | null;
  }) => void
): Unsubscribe {
  const state: {
    student?: Student | null;
    guardian?: GuardianProfile | null;
    teacher?: Teacher | null;
    committee?: CommitteeMemberProfile | null;
    foundationAdmin?: FoundationAdminProfile | null;
  } = {};

  const emit = () => cb({ ...state });
  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      query(collection(db, 'students'), where('studentUid', '==', uid)),
      (s) => {
        state.student = s.docs[0] ? ({ id: s.docs[0].id, ...s.docs[0].data() } as Student) : null;
        emit();
      },
      () => {}
    )
  );
  unsubs.push(
    onSnapshot(
      query(collection(db, 'guardians'), where('user_uid', '==', uid)),
      (s) => {
        state.guardian = s.docs[0]
          ? ({ id: s.docs[0].id, ...s.docs[0].data() } as GuardianProfile)
          : null;
        emit();
      },
      () => {}
    )
  );
  unsubs.push(
    onSnapshot(
      query(collection(db, 'teachers'), where('user_uid', '==', uid)),
      (s) => {
        state.teacher = s.docs[0] ? ({ id: s.docs[0].id, ...s.docs[0].data() } as Teacher) : null;
        emit();
      },
      () => {}
    )
  );
  unsubs.push(
    onSnapshot(
      query(collection(db, 'committee_members'), where('user_uid', '==', uid)),
      (s) => {
        state.committee = s.docs[0]
          ? ({ id: s.docs[0].id, ...s.docs[0].data() } as CommitteeMemberProfile)
          : null;
        emit();
      },
      () => {}
    )
  );
  unsubs.push(
    onSnapshot(
      query(collection(db, 'foundation_admins'), where('user_uid', '==', uid)),
      (s) => {
        state.foundationAdmin = s.docs[0]
          ? ({ id: s.docs[0].id, ...s.docs[0].data() } as FoundationAdminProfile)
          : null;
        emit();
      },
      () => {}
    )
  );

  return () => unsubs.forEach((u) => u());
}

// Scoped subscriptions for Student / Parent & Teacher Import History
export function subscribeTeacherImportLogs<T>(
  teacherUid: string,
  cb: (items: T[]) => void,
  onErr?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'excelImportLogs'),
    where('teacherUid', '==', teacherUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
      cb(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'excelImportLogs');
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );
}

export function subscribeTeacherClassAssignments(
  teacherUid: string,
  cb: (items: ClassAssignment[]) => void,
  onErr?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'class_assignments'),
    where('teacher_uid', '==', teacherUid),
    where('assignment_status', '==', 'active')
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClassAssignment);
      cb(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'class_assignments');
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );
}

export function subscribeLinkedStudentsForPortal(
  uid: string,
  role: CanonicalRole,
  cb: (items: Student[]) => void,
  onErr?: (err: Error) => void
): Unsubscribe {
  if (role === 'PARENT') {
    // Parents must resolve children exclusively through verified student_guardians links
    return subscribeVerifiedStudentsForParent([], cb, onErr);
  }
  const q = query(collection(db, 'students'), where('studentUid', '==', uid));

  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Student);
      cb(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'students');
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );
}

export function subscribeVerifiedStudentsForParent(
  verifiedStudentIds: string[],
  cb: (items: Student[]) => void,
  onErr?: (err: Error) => void
): Unsubscribe {
  const safeIds = Array.from(new Set(verifiedStudentIds.filter(Boolean))).slice(0, 10);
  if (safeIds.length === 0) {
    cb([]);
    return () => {};
  }
  const q = query(collection(db, 'students'), where(documentId(), 'in', safeIds));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Student);
      cb(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'students');
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );
}

export function subscribeVerifiedGuardiansForParent(
  guardianUid: string,
  cb: (items: StudentGuardian[]) => void,
  onErr?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'student_guardians'),
    where('guardian_uid', '==', guardianUid),
    where('verification_status', '==', 'verified')
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StudentGuardian);
      cb(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'student_guardians');
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );
}

export function subscribePublishedCollectionForStudents<T>(
  collectionName: 'studentAssessments' | 'mutabaahLogs',
  studentIds: string[],
  cb: (items: T[]) => void,
  onErr?: (err: Error) => void
): Unsubscribe {
  if (studentIds.length === 0) {
    cb([]);
    return () => {};
  }
  const safeIds = studentIds.slice(0, 10);
  const q = query(
    collection(db, collectionName),
    where('isPublishedToParents', '==', true),
    where('studentId', 'in', safeIds)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
      cb(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, collectionName);
      } catch (e) {
        if (onErr) onErr(e as Error);
      }
    }
  );
}

// --- Audit Trail ---
export async function createAuditLog(data: {
  actorName: string;
  actorRole: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const payload = {
    actorUid: uid,
    actorName: clampStr(data.actorName, 120),
    actorRole: clampStr(data.actorRole, 50),
    action: clampStr(data.action, 120),
    targetCollection: clampStr(data.targetCollection, 80),
    targetId: clampStr(data.targetId || '-', 128),
    summary: clampStr(data.summary, 1500),
    createdAt: serverTimestamp(),
  };
  try {
    await addDoc(collection(db, 'auditLogs'), payload);
    await addDoc(collection(db, 'audit_logs'), payload);
  } catch (error) {
    console.error('AuditLog write warning:', error);
  }
}

// --- User & Permission Governance (Locked in Client SDK; Cloud Functions Gen 2 Backend Required) ---
export const PRIVILEGED_MUTATION_DISABLED_MESSAGE =
  'Mutasi role, status akun, penetapan SUPER_ADMIN, dan matriks permission dinonaktifkan di client SDK dan wajib diproses melalui layanan backend terpercaya (Cloud Functions Gen 2 pada fase implementasi berikutnya).';

export async function updateUserAccess(
  _targetUid: string,
  _updates: {
    role: UserRole;
    account_status?: AccountStatus;
    profile_status?: ProfileStatus;
    assignedUnits: UnitCode[];
    assignedClassIds?: string[];
    linkedStudentIds?: string[];
    permissions?: PermissionKey[];
    allowIndividualStudentAccess: boolean;
  },
  _actor?: UserProfile
): Promise<void> {
  throw new Error(PRIVILEGED_MUTATION_DISABLED_MESSAGE);
}

export async function approveUserAndProfile(
  _targetUser: UserProfile,
  _payload: {
    role: CanonicalRole;
    assignedUnits: EducationLevel[];
    assignedClassIds?: string[];
    linkedStudentIds?: string[];
    allowIndividualStudentAccess?: boolean;
    onboardingDocCollection?: 'students' | 'guardians' | 'teachers' | 'committee_members';
    onboardingDocId?: string;
  },
  _actor: UserProfile
): Promise<void> {
  throw new Error(PRIVILEGED_MUTATION_DISABLED_MESSAGE);
}

export async function createVerifiedGuardianRelation(
  data: {
    student_id: string;
    guardian_uid: string;
    relationship_type: 'ayah' | 'ibu' | 'wali';
    verification_status: 'verified' | 'pending' | 'rejected';
  },
  actor: UserProfile
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  const relId = `${data.student_id}_${data.guardian_uid}`
    .slice(0, 128)
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  try {
    await setDoc(doc(db, 'student_guardians', relId), {
      student_id: clampStr(data.student_id, 128),
      guardian_uid: clampStr(data.guardian_uid, 128),
      relationship_type: data.relationship_type,
      verification_status: data.verification_status,
      organization_id: DEFAULT_ORGANIZATION_ID,
      created_by: uid,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    if (data.verification_status === 'verified') {
      await updateDoc(doc(db, 'students', data.student_id), {
        guardianUids: arrayUnion(data.guardian_uid),
        guardian_uids: arrayUnion(data.guardian_uid),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', data.guardian_uid), {
        linkedStudentIds: arrayUnion(data.student_id),
        updated_at: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await createAuditLog({
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'UPSERT_STUDENT_GUARDIAN',
      targetCollection: 'student_guardians',
      targetId: relId,
      summary: `Relasi wali (${data.relationship_type}) status ${data.verification_status} untuk siswa ${data.student_id} & akun ${data.guardian_uid}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `student_guardians/${relId}`);
  }
}

export async function createTeacherClassAssignment(
  data: {
    teacher_uid: string;
    class_id: string;
    education_unit_id: EducationLevel;
    academic_year_id: string;
    semester_id?: string;
    is_homeroom: boolean;
    subject_name?: string;
  },
  actor: UserProfile
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  const cleanLevel = normalizeEducationLevel(data.education_unit_id);
  const assignId = `${data.teacher_uid}_${data.class_id}_${data.academic_year_id}`
    .slice(0, 128)
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const payload = {
    teacher_uid: clampStr(data.teacher_uid, 128),
    class_id: clampStr(data.class_id, 128),
    education_unit_id: cleanLevel,
    academic_year_id: clampStr(data.academic_year_id, 128),
    ...(data.semester_id?.trim() ? { semester_id: clampStr(data.semester_id, 128) } : {}),
    assignment_status: 'active',
    is_homeroom: Boolean(data.is_homeroom),
    ...(data.subject_name?.trim() ? { subject_name: clampStr(data.subject_name, 100) } : {}),
    organization_id: DEFAULT_ORGANIZATION_ID,
    created_by: uid,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'class_assignments', assignId), payload);
    await setDoc(doc(db, 'teacher_assignments', assignId), payload);

    await updateDoc(doc(db, 'users', data.teacher_uid), {
      assignedUnits: arrayUnion(cleanLevel),
      assignedClassIds: arrayUnion(data.class_id),
      updated_at: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await createAuditLog({
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'CREATE_CLASS_ASSIGNMENT',
      targetCollection: 'class_assignments',
      targetId: assignId,
      summary: `Penugasan ${data.is_homeroom ? 'Wali Kelas' : 'Guru'} (${data.teacher_uid}) ke kelas ${data.class_id} jenjang ${cleanLevel}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `class_assignments/${assignId}`);
  }
}

export async function toggleClassAssignmentStatus(
  assignmentId: string,
  nextStatus: 'active' | 'inactive' | 'archived',
  actor: UserProfile
): Promise<void> {
  try {
    const assignRef = doc(db, 'class_assignments', assignmentId);
    const assignSnap = await getDoc(assignRef);
    const assignData = assignSnap.exists()
      ? (assignSnap.data() as Partial<ClassAssignment>)
      : null;

    await updateDoc(assignRef, {
      assignment_status: nextStatus,
      updated_at: serverTimestamp(),
    });
    try {
      await updateDoc(doc(db, 'teacher_assignments', assignmentId), {
        assignment_status: nextStatus,
        updated_at: serverTimestamp(),
      });
    } catch {
      // Ignore if mirror doc didn't exist for legacy record
    }

    if (assignData?.teacher_uid && assignData?.class_id) {
      if (nextStatus === 'active') {
        await updateDoc(doc(db, 'users', assignData.teacher_uid), {
          assignedClassIds: arrayUnion(assignData.class_id),
          ...(assignData.education_unit_id
            ? { assignedUnits: arrayUnion(normalizeEducationLevel(assignData.education_unit_id)) }
            : {}),
          updated_at: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const remainingSnap = await getDocs(
          query(
            collection(db, 'class_assignments'),
            where('teacher_uid', '==', assignData.teacher_uid),
            where('assignment_status', '==', 'active')
          )
        );
        const stillAssignedToClass = remainingSnap.docs.some(
          (d) => d.id !== assignmentId && d.data()?.class_id === assignData.class_id
        );
        if (!stillAssignedToClass) {
          await updateDoc(doc(db, 'users', assignData.teacher_uid), {
            assignedClassIds: arrayRemove(assignData.class_id),
            updated_at: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    await createAuditLog({
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'UPDATE_CLASS_ASSIGNMENT_STATUS',
      targetCollection: 'class_assignments',
      targetId: assignmentId,
      summary: `Status penugasan kelas diubah menjadi ${nextStatus}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `class_assignments/${assignmentId}`);
  }
}



// --- System Config ---
export async function saveSystemConfig(data: {
  foundationName: string;
  activePeriodId: string;
  activePeriodName: string;
  komiteDefaultScope: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  const path = 'systemConfig/main';
  try {
    await setDoc(doc(db, 'systemConfig', 'main'), {
      foundationName: clampStr(data.foundationName, 150),
      activePeriodId: clampStr(data.activePeriodId, 128),
      activePeriodName: clampStr(data.activePeriodName, 100),
      komiteDefaultScope: clampStr(data.komiteDefaultScope, 200),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- Master Units (5 Official Levels: TK, SD, SMP, SMA, SMK) ---
export function getUnitDocId(code: string): string {
  return normalizeEducationLevel(code);
}

export async function saveEducationUnit(
  data: {
    unitId?: string;
    code: EducationLevel;
    name: string;
    headName: string;
    address?: string;
    phone?: string;
    studentCount: number;
    teacherCount: number;
    classCount: number;
    religiousProgramNote?: string;
    status?: LifecycleStatus;
  },
  actor?: UserProfile
): Promise<void> {
  const cleanCode = normalizeEducationLevel(data.code);
  const docId = data.unitId?.trim()
    ? clampStr(data.unitId.trim().toUpperCase(), 30)
    : getUnitDocId(cleanCode);
  const path = `units/${docId}`;
  try {
    const payload: Record<string, unknown> = {
      code: cleanCode,
      education_level: cleanCode,
      name: clampStr(data.name, 120),
      headName: clampStr(data.headName, 120),
      studentCount: Math.max(0, Number(data.studentCount) || 0),
      teacherCount: Math.max(0, Number(data.teacherCount) || 0),
      classCount: Math.max(0, Number(data.classCount) || 0),
      status: data.status || 'ACTIVE',
      updatedAt: serverTimestamp(),
    };
    if (data.address?.trim()) payload.address = clampStr(data.address, 300);
    if (data.phone?.trim()) payload.phone = clampStr(data.phone, 40);
    if (data.religiousProgramNote?.trim()) {
      payload.religiousProgramNote = clampStr(data.religiousProgramNote, 1000);
    }
    await setDoc(doc(db, 'units', docId), payload);
    await setDoc(doc(db, 'education_units', docId), payload);

    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'UPSERT_EDUCATION_UNIT',
        targetCollection: 'units',
        targetId: docId,
        summary: `Menyimpan Unit Pendidikan ${cleanCode} — ${data.name}`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- Cohorts (Angkatan) ---
export async function createCohort(
  data: {
    cohortName: string;
    educationUnitId: string;
    educationLevel: EducationLevel;
    admissionYear: string;
    graduationYear?: string;
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    notes?: string;
  },
  actor?: UserProfile
): Promise<string> {
  const level = normalizeEducationLevel(data.educationLevel);
  try {
    const payload: Record<string, unknown> = {
      cohortName: clampStr(data.cohortName, 100),
      educationUnitId: clampStr(data.educationUnitId || level, 128),
      educationLevel: level,
      admissionYear: clampStr(data.admissionYear, 15),
      status: data.status || 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.graduationYear?.trim()) payload.graduationYear = clampStr(data.graduationYear, 15);
    if (data.notes?.trim()) payload.notes = clampStr(data.notes, 500);

    const ref = await addDoc(collection(db, 'cohorts'), payload);
    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'CREATE_COHORT',
        targetCollection: 'cohorts',
        targetId: ref.id,
        summary: `Menambahkan Angkatan ${data.cohortName} (${level}, masuk ${data.admissionYear})`,
      });
    }
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'cohorts');
  }
}

export async function updateCohort(
  cohortId: string,
  updates: Partial<{
    cohortName: string;
    educationLevel: EducationLevel;
    educationUnitId: string;
    admissionYear: string;
    graduationYear: string;
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    notes: string;
  }>,
  actor?: UserProfile
): Promise<void> {
  const path = `cohorts/${cohortId}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.cohortName !== undefined) clean.cohortName = clampStr(updates.cohortName, 100);
    if (updates.educationLevel !== undefined)
      clean.educationLevel = normalizeEducationLevel(updates.educationLevel);
    if (updates.educationUnitId !== undefined)
      clean.educationUnitId = clampStr(updates.educationUnitId, 128);
    if (updates.admissionYear !== undefined) clean.admissionYear = clampStr(updates.admissionYear, 15);
    if (updates.graduationYear !== undefined)
      clean.graduationYear = clampStr(updates.graduationYear, 15);
    if (updates.status !== undefined) clean.status = updates.status;
    if (updates.notes !== undefined) clean.notes = clampStr(updates.notes, 500);
    await updateDoc(doc(db, 'cohorts', cohortId), clean);
    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'UPDATE_COHORT',
        targetCollection: 'cohorts',
        targetId: cohortId,
        summary: `Memperbarui Angkatan ${cohortId}`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Academic Years & Semesters (synced cleanly with academicPeriods) ---
export async function createAcademicYear(
  data: {
    yearName: string;
    startDate?: string;
    endDate?: string;
    isActive: boolean;
  },
  actor?: UserProfile
): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  try {
    const ref = await addDoc(collection(db, 'academic_years'), {
      yearName: clampStr(data.yearName, 40),
      ...(data.startDate?.trim() ? { startDate: clampStr(data.startDate, 20) } : {}),
      ...(data.endDate?.trim() ? { endDate: clampStr(data.endDate, 20) } : {}),
      isActive: Boolean(data.isActive),
      status: 'ACTIVE',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'CREATE_ACADEMIC_YEAR',
        targetCollection: 'academic_years',
        targetId: ref.id,
        summary: `Menambahkan Tahun Ajaran ${data.yearName}`,
      });
    }
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'academic_years');
  }
}

export async function toggleAcademicYearActive(
  yearId: string,
  isActive: boolean,
  actor?: UserProfile
): Promise<void> {
  try {
    await updateDoc(doc(db, 'academic_years', yearId), {
      isActive,
      updatedAt: serverTimestamp(),
    });
    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'TOGGLE_ACADEMIC_YEAR',
        targetCollection: 'academic_years',
        targetId: yearId,
        summary: `Tahun ajaran ${yearId} diatur ${isActive ? 'Aktif' : 'Nonaktif'}`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `academic_years/${yearId}`);
  }
}

export async function createSemester(
  data: {
    academicYearId: string;
    yearName: string;
    semester: 'Ganjil' | 'Genap';
    name?: string;
    isActive: boolean;
  },
  actor?: UserProfile
): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  const cleanName = clampStr(data.name || `${data.yearName} - ${data.semester}`, 100);
  try {
    const semRef = await addDoc(collection(db, 'semesters'), {
      academicYearId: clampStr(data.academicYearId, 128),
      yearName: clampStr(data.yearName, 40),
      semester: data.semester,
      name: cleanName,
      isActive: Boolean(data.isActive),
      status: 'ACTIVE',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // Mirror to academicPeriods with identical ID so assessments & Komite modules stay synchronized
    await setDoc(doc(db, 'academicPeriods', semRef.id), {
      name: cleanName,
      year: clampStr(data.yearName, 30),
      semester: data.semester,
      academicYearId: clampStr(data.academicYearId, 128),
      isActive: Boolean(data.isActive),
      status: 'ACTIVE',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'CREATE_SEMESTER',
        targetCollection: 'semesters',
        targetId: semRef.id,
        summary: `Menambahkan Semester ${cleanName}`,
      });
    }
    return semRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'semesters');
  }
}

export async function createAcademicPeriod(data: {
  name: string;
  year: string;
  semester: 'Ganjil' | 'Genap';
  academicYearId?: string;
  isActive: boolean;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  try {
    const ref = await addDoc(collection(db, 'academicPeriods'), {
      name: clampStr(data.name, 100),
      year: clampStr(data.year, 30),
      semester: data.semester,
      ...(data.academicYearId ? { academicYearId: clampStr(data.academicYearId, 128) } : {}),
      isActive: Boolean(data.isActive),
      status: 'ACTIVE',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'academicPeriods');
  }
}

export async function toggleAcademicPeriodActive(
  periodId: string,
  isActive: boolean
): Promise<void> {
  const path = `academicPeriods/${periodId}`;
  try {
    await updateDoc(doc(db, 'academicPeriods', periodId), {
      isActive,
      updatedAt: serverTimestamp(),
    });
    try {
      await updateDoc(doc(db, 'semesters', periodId), {
        isActive,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Legacy periods only exist in academicPeriods
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Classes, Promotion & Class Student History ---
export async function createSchoolClass(
  data: {
    unitCode: EducationLevel;
    educationUnitId?: string;
    educationUnitName?: string;
    name: string;
    level: string;
    cohortId?: string;
    cohortName?: string;
    academicYearId?: string;
    semesterId?: string;
    homeroomTeacherUid?: string;
    homeroomTeacherName: string;
    studentCount: number;
  },
  actor?: UserProfile
): Promise<string> {
  const cleanLevel = normalizeEducationLevel(data.unitCode);
  const unitId = clampStr(data.educationUnitId?.trim() || cleanLevel, 128);
  try {
    const payload: Record<string, unknown> = {
      unitCode: cleanLevel,
      educationLevel: cleanLevel,
      educationUnitId: unitId,
      name: clampStr(data.name, 80),
      className: clampStr(data.name, 80),
      level: clampStr(data.level, 40),
      homeroomTeacherName: clampStr(data.homeroomTeacherName, 120),
      studentCount: Math.max(0, Number(data.studentCount) || 0),
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.educationUnitName?.trim())
      payload.educationUnitName = clampStr(data.educationUnitName, 120);
    if (data.cohortId?.trim()) payload.cohortId = clampStr(data.cohortId, 128);
    if (data.cohortName?.trim()) payload.cohortName = clampStr(data.cohortName, 100);
    if (data.academicYearId?.trim()) payload.academicYearId = clampStr(data.academicYearId, 128);
    if (data.semesterId?.trim()) payload.semesterId = clampStr(data.semesterId, 128);
    if (data.homeroomTeacherUid?.trim())
      payload.homeroomTeacherUid = clampStr(data.homeroomTeacherUid, 128);

    const ref = await addDoc(collection(db, 'classes'), payload);
    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'CREATE_CLASS',
        targetCollection: 'classes',
        targetId: ref.id,
        summary: `Menambahkan Kelas ${cleanLevel} (${unitId}) — ${data.name} (Tingkat ${data.level})`,
      });
    }
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'classes');
  }
}

export async function updateSchoolClass(
  classId: string,
  updates: Partial<{
    unitCode: UnitCode;
    educationLevel: EducationLevel;
    educationUnitId: string;
    educationUnitName: string;
    name: string;
    level: string;
    cohortId: string;
    cohortName: string;
    academicYearId: string;
    semesterId: string;
    homeroomTeacherUid: string;
    homeroomTeacherName: string;
    studentCount: number;
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  }>,
  actor?: UserProfile
): Promise<void> {
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.unitCode !== undefined || updates.educationLevel !== undefined) {
      const normalizedLevel = normalizeEducationLevel(updates.educationLevel || updates.unitCode);
      clean.unitCode = normalizedLevel;
      clean.educationLevel = normalizedLevel;
      clean.educationUnitId = clampStr(updates.educationUnitId || normalizedLevel, 128);
    } else if (updates.educationUnitId !== undefined) {
      clean.educationUnitId = clampStr(updates.educationUnitId, 128);
    }
    if (updates.educationUnitName !== undefined)
      clean.educationUnitName = clampStr(updates.educationUnitName, 120);
    if (updates.name !== undefined) {
      clean.name = clampStr(updates.name, 80);
      clean.className = clampStr(updates.name, 80);
    }
    if (updates.level !== undefined) clean.level = clampStr(updates.level, 40);
    if (updates.cohortId !== undefined) clean.cohortId = clampStr(updates.cohortId, 128);
    if (updates.cohortName !== undefined) clean.cohortName = clampStr(updates.cohortName, 100);
    if (updates.academicYearId !== undefined)
      clean.academicYearId = clampStr(updates.academicYearId, 128);
    if (updates.semesterId !== undefined) clean.semesterId = clampStr(updates.semesterId, 128);
    if (updates.homeroomTeacherUid !== undefined)
      clean.homeroomTeacherUid = clampStr(updates.homeroomTeacherUid, 128);
    if (updates.homeroomTeacherName !== undefined)
      clean.homeroomTeacherName = clampStr(updates.homeroomTeacherName, 120);
    if (updates.studentCount !== undefined)
      clean.studentCount = Math.max(0, Number(updates.studentCount) || 0);
    if (updates.status !== undefined) clean.status = updates.status;

    await updateDoc(doc(db, 'classes', classId), clean);
    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'UPDATE_CLASS',
        targetCollection: 'classes',
        targetId: classId,
        summary: `Memperbarui Kelas ${classId}`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `classes/${classId}`);
  }
}

/**
 * Pure helper for student class promotion / placement.
 * Guarantees `cohort_id` and `admission_year` are NEVER overwritten when a student moves class/year/semester.
 */
export function computeStudentPromotionState(
  student: Student,
  targetClass: SchoolClass,
  targetAcademicYearId: string,
  targetSemesterId: string
): {
  studentPatch: Partial<Student>;
  historyEntry: Omit<ClassStudentHistory, 'id' | 'createdAt' | 'movedByUid' | 'movedByName'>;
} {
  const nextLevel = normalizeEducationLevel(targetClass.unitCode);
  return {
    studentPatch: {
      unitCode: nextLevel,
      education_level: nextLevel,
      education_unit_id: targetClass.educationUnitId || nextLevel,
      classId: targetClass.id,
      class_id: targetClass.id,
      className: targetClass.name,
      academic_year_id: targetAcademicYearId || targetClass.academicYearId || '',
      semester_id: targetSemesterId || targetClass.semesterId || '',
      // IMMUTABLE cohort lineage: explicitly retained
      cohort_id: student.cohort_id,
      admission_year: student.admission_year,
    },
    historyEntry: {
      studentId: student.id,
      nis: student.nis,
      studentName: student.full_name || student.name,
      educationLevel: nextLevel,
      educationUnitId: targetClass.educationUnitId || nextLevel,
      cohortId: student.cohort_id || targetClass.cohortId || '-',
      academicYearId: targetAcademicYearId || targetClass.academicYearId || '-',
      semesterId: targetSemesterId || targetClass.semesterId || '-',
      fromClassId: student.classId || '',
      fromClassName: student.className || '',
      toClassId: targetClass.id,
      toClassName: targetClass.name,
      movementType: student.classId && student.classId !== 'PENDING_PLACEMENT' ? 'PROMOTION' : 'ENROLLMENT',
    },
  };
}

export async function promoteOrMoveStudent(params: {
  student: Student;
  targetClass: SchoolClass;
  academicYearId: string;
  semesterId: string;
  movementType?: 'ENROLLMENT' | 'PROMOTION' | 'TRANSFER';
  notes?: string;
  actor: UserProfile;
}): Promise<void> {
  const { student, targetClass, academicYearId, semesterId, movementType, notes, actor } = params;
  const computed = computeStudentPromotionState(student, targetClass, academicYearId, semesterId);

  try {
    const cleanPatch: Record<string, unknown> = {
      unitCode: computed.studentPatch.unitCode,
      education_level: computed.studentPatch.education_level,
      education_unit_id: computed.studentPatch.education_unit_id,
      classId: computed.studentPatch.classId,
      class_id: computed.studentPatch.class_id,
      className: computed.studentPatch.className,
      academic_year_id: computed.studentPatch.academic_year_id,
      semester_id: computed.studentPatch.semester_id,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, 'students', student.id), cleanPatch);

    await addDoc(collection(db, 'class_student_history'), {
      ...computed.historyEntry,
      ...(student.studentUid || student.student_uid
        ? { studentUid: student.studentUid || student.student_uid }
        : {}),
      movementType: movementType || computed.historyEntry.movementType,
      ...(notes?.trim() ? { notes: clampStr(notes, 400) } : {}),
      movedByUid: actor.uid,
      movedByName: clampStr(actor.displayName, 120),
      createdAt: serverTimestamp(),
    });

    await createAuditLog({
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'STUDENT_CLASS_MOVEMENT',
      targetCollection: 'students',
      targetId: student.id,
      summary: `Penempatan/Kenaikan kelas ${student.name} (${student.nis}): ${student.className || '-'} → ${targetClass.unitCode} ${targetClass.name} (Angkatan tetap: ${student.cohort_id || student.admission_year || '-'})`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `students/${student.id}`);
  }
}

// --- Teachers ---
export async function createTeacher(
  data: {
    nip: string;
    employee_number?: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    birth_place?: string;
    birth_date?: string;
    gender?: 'L' | 'P';
    unitCode: EducationLevel;
    roleTitle: string;
    employment_status?: 'TETAP' | 'KONTRAK' | 'HONORER';
    employment_start_date?: string;
    teaching_subjects?: string[];
    isPaiTeacher: boolean;
    user_uid?: string;
  },
  actor?: UserProfile
): Promise<string> {
  const level = normalizeEducationLevel(data.unitCode);
  try {
    const payload: Record<string, unknown> = {
      nip: clampStr(data.nip, 50),
      name: clampStr(data.name, 120),
      full_name: clampStr(data.name, 120),
      unitCode: level,
      education_level: level,
      education_unit_id: level,
      roleTitle: clampStr(data.roleTitle, 100),
      position: clampStr(data.roleTitle, 100),
      isPaiTeacher: Boolean(data.isPaiTeacher),
      profile_status: 'VERIFIED',
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.employee_number?.trim()) payload.employee_number = clampStr(data.employee_number, 50);
    if (data.email?.trim()) payload.email = clampStr(data.email, 200);
    if (data.phone?.trim()) payload.phone = clampStr(data.phone, 40);
    if (data.address?.trim()) payload.address = clampStr(data.address, 400);
    if (data.birth_place?.trim()) payload.birth_place = clampStr(data.birth_place, 80);
    if (data.birth_date?.trim()) payload.birth_date = clampStr(data.birth_date, 20);
    if (data.gender) payload.gender = data.gender;
    if (data.employment_status) payload.employment_status = data.employment_status;
    if (data.employment_start_date?.trim())
      payload.employment_start_date = clampStr(data.employment_start_date, 20);
    if (data.teaching_subjects && data.teaching_subjects.length > 0)
      payload.teaching_subjects = data.teaching_subjects.slice(0, 20);
    if (data.user_uid?.trim()) payload.user_uid = clampStr(data.user_uid, 128);

    const ref = await addDoc(collection(db, 'teachers'), payload);
    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'CREATE_TEACHER',
        targetCollection: 'teachers',
        targetId: ref.id,
        summary: `Menambahkan data guru ${data.name} (${level}, NIP: ${data.nip})`,
      });
    }
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'teachers');
  }
}

export async function updateTeacher(
  teacherId: string,
  updates: Partial<Teacher>,
  actor?: UserProfile
): Promise<void> {
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.nip !== undefined) clean.nip = clampStr(updates.nip, 50);
    if (updates.name !== undefined) {
      clean.name = clampStr(updates.name, 120);
      clean.full_name = clampStr(updates.name, 120);
    }
    if (updates.email !== undefined) clean.email = clampStr(updates.email, 200);
    if (updates.phone !== undefined) clean.phone = clampStr(updates.phone, 40);
    if (updates.address !== undefined) clean.address = clampStr(updates.address, 400);
    if (updates.unitCode !== undefined) {
      const level = normalizeEducationLevel(updates.unitCode);
      clean.unitCode = level;
      clean.education_level = level;
      clean.education_unit_id = level;
    }
    if (updates.roleTitle !== undefined) {
      clean.roleTitle = clampStr(updates.roleTitle, 100);
      clean.position = clampStr(updates.roleTitle, 100);
    }
    if (updates.employment_status !== undefined)
      clean.employment_status = updates.employment_status;
    if (updates.teaching_subjects !== undefined)
      clean.teaching_subjects = updates.teaching_subjects.slice(0, 20);
    if (updates.isPaiTeacher !== undefined) clean.isPaiTeacher = Boolean(updates.isPaiTeacher);
    if (updates.status !== undefined) clean.status = updates.status;
    if (updates.profile_status !== undefined) clean.profile_status = updates.profile_status;

    await updateDoc(doc(db, 'teachers', teacherId), clean);
    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'UPDATE_TEACHER',
        targetCollection: 'teachers',
        targetId: teacherId,
        summary: `Memperbarui data guru ${updates.name || teacherId}`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `teachers/${teacherId}`);
  }
}

// --- Students (Extended Section 4A + NIS/NISN uniqueness validation) ---
export function validateStudentUniqueness(
  candidate: { nis: string; nisn?: string },
  existingStudents: Student[],
  ignoreId?: string
): string | null {
  const cleanNis = candidate.nis.trim().toLowerCase();
  const cleanNisn = (candidate.nisn || '').trim().toLowerCase();
  for (const s of existingStudents) {
    if (ignoreId && s.id === ignoreId) continue;
    if ((s.nis || '').trim().toLowerCase() === cleanNis) {
      return `NIS "${candidate.nis}" sudah terdaftar pada siswa ${s.name}.`;
    }
    if (cleanNisn && (s.nisn || '').trim().toLowerCase() === cleanNisn) {
      return `NISN "${candidate.nisn}" sudah terdaftar pada siswa ${s.name}.`;
    }
  }
  return null;
}

export async function createStudent(
  data: {
    nis: string;
    nisn?: string;
    name: string;
    birth_place?: string;
    birth_date?: string;
    gender: 'L' | 'P';
    address?: string;
    phone?: string;
    unitCode: EducationLevel;
    education_unit_id?: string;
    admission_year?: string;
    cohort_id?: string;
    academic_year_id?: string;
    semester_id?: string;
    classId: string;
    className: string;
    studentUid?: string;
    account_status?: LifecycleStatus;
  },
  existingStudents?: Student[],
  actor?: UserProfile
): Promise<string> {
  if (existingStudents) {
    const err = validateStudentUniqueness(
      { nis: data.nis, nisn: data.nisn },
      existingStudents
    );
    if (err) throw new Error(err);
  }
  const level = normalizeEducationLevel(data.unitCode);
  const unitId = clampStr(data.education_unit_id?.trim() || level, 128);
  const accStatus: LifecycleStatus = data.account_status || 'ACTIVE';
  try {
    const payload: Record<string, unknown> = {
      nis: clampStr(data.nis, 50),
      name: clampStr(data.name, 120),
      full_name: clampStr(data.name, 120),
      unitCode: level,
      education_level: level,
      education_unit_id: unitId,
      classId: clampStr(data.classId, 128),
      class_id: clampStr(data.classId, 128),
      className: clampStr(data.className, 80),
      gender: data.gender,
      profile_status: 'VERIFIED',
      status: accStatus,
      account_status: accStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.nisn?.trim()) payload.nisn = clampStr(data.nisn, 30);
    if (data.birth_place?.trim()) payload.birth_place = clampStr(data.birth_place, 80);
    if (data.birth_date?.trim()) payload.birth_date = clampStr(data.birth_date, 20);
    if (data.address?.trim()) payload.address = clampStr(data.address, 400);
    if (data.phone?.trim()) payload.phone = clampStr(data.phone, 40);
    if (data.admission_year?.trim()) payload.admission_year = clampStr(data.admission_year, 15);
    if (data.cohort_id?.trim()) payload.cohort_id = clampStr(data.cohort_id, 128);
    if (data.academic_year_id?.trim())
      payload.academic_year_id = clampStr(data.academic_year_id, 128);
    if (data.semester_id?.trim()) payload.semester_id = clampStr(data.semester_id, 128);
    if (data.studentUid?.trim()) {
      payload.studentUid = clampStr(data.studentUid, 128);
      payload.student_uid = clampStr(data.studentUid, 128);
    }

    const ref = await addDoc(collection(db, 'students'), payload);
    try {
      await updateDoc(doc(db, 'students', ref.id), { student_id: ref.id });
    } catch {
      // Optional student_id mirror
    }
    if (data.studentUid?.trim()) {
      try {
        await updateDoc(doc(db, 'users', clampStr(data.studentUid, 128)), {
          linkedStudentIds: arrayUnion(ref.id),
          updated_at: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore if linked user doc is managed separately
      }
    }
    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'CREATE_STUDENT',
        targetCollection: 'students',
        targetId: ref.id,
        summary: `Menambahkan siswa ${data.name} (NIS: ${data.nis}, ${level} — ${data.className})`,
      });
    }
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'students');
  }
}

export async function updateStudent(
  studentId: string,
  updates: Partial<Student>,
  existingStudents?: Student[],
  actor?: UserProfile
): Promise<void> {
  if (existingStudents && updates.nis) {
    const err = validateStudentUniqueness(
      { nis: updates.nis, nisn: updates.nisn },
      existingStudents,
      studentId
    );
    if (err) throw new Error(err);
  }
  try {
    const clean: Record<string, unknown> = {
      student_id: studentId,
      updatedAt: serverTimestamp(),
    };
    if (updates.nis !== undefined) clean.nis = clampStr(updates.nis, 50);
    if (updates.nisn !== undefined) clean.nisn = clampStr(updates.nisn, 30);
    if (updates.name !== undefined) {
      clean.name = clampStr(updates.name, 120);
      clean.full_name = clampStr(updates.name, 120);
    }
    if (updates.birth_place !== undefined) clean.birth_place = clampStr(updates.birth_place, 80);
    if (updates.birth_date !== undefined) clean.birth_date = clampStr(updates.birth_date, 20);
    if (updates.gender !== undefined) clean.gender = updates.gender;
    if (updates.address !== undefined) clean.address = clampStr(updates.address, 400);
    if (updates.phone !== undefined) clean.phone = clampStr(updates.phone, 40);
    if (updates.unitCode !== undefined) {
      const level = normalizeEducationLevel(updates.unitCode);
      clean.unitCode = level;
      clean.education_level = level;
      clean.education_unit_id = clampStr(updates.education_unit_id || level, 128);
    } else if (updates.education_unit_id !== undefined) {
      clean.education_unit_id = clampStr(updates.education_unit_id, 128);
    }
    if (updates.admission_year !== undefined)
      clean.admission_year = clampStr(updates.admission_year, 15);
    if (updates.cohort_id !== undefined) clean.cohort_id = clampStr(updates.cohort_id, 128);
    if (updates.academic_year_id !== undefined)
      clean.academic_year_id = clampStr(updates.academic_year_id, 128);
    if (updates.semester_id !== undefined) clean.semester_id = clampStr(updates.semester_id, 128);
    if (updates.classId !== undefined) {
      clean.classId = clampStr(updates.classId, 128);
      clean.class_id = clampStr(updates.classId, 128);
    }
    if (updates.className !== undefined) clean.className = clampStr(updates.className, 80);
    const targetUid = updates.studentUid || updates.student_uid;
    if (targetUid !== undefined && targetUid.trim()) {
      clean.studentUid = clampStr(targetUid, 128);
      clean.student_uid = clampStr(targetUid, 128);
    }
    if (updates.status !== undefined) clean.status = updates.status;
    if (updates.account_status !== undefined) {
      clean.account_status = updates.account_status;
      if (updates.status === undefined) clean.status = updates.account_status;
    }
    if (updates.profile_status !== undefined) clean.profile_status = updates.profile_status;

    await updateDoc(doc(db, 'students', studentId), clean);
    if (targetUid?.trim()) {
      try {
        await updateDoc(doc(db, 'users', clampStr(targetUid, 128)), {
          linkedStudentIds: arrayUnion(studentId),
          updated_at: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore if linked user doc is managed separately
      }
    }
    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'UPDATE_STUDENT',
        targetCollection: 'students',
        targetId: studentId,
        summary: `Memperbarui profil siswa ${updates.name || studentId}`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `students/${studentId}`);
  }
}

// --- Guardians, Committee Members, Foundation Admins ---
export async function upsertGuardianProfile(
  data: {
    id?: string;
    user_uid: string;
    full_name: string;
    email: string;
    phone: string;
    address: string;
    relationship_type: 'ayah' | 'ibu' | 'wali';
    linked_student_ids: string[];
    verification_status: 'verified' | 'pending' | 'rejected';
    status?: LifecycleStatus;
  },
  actor: UserProfile
): Promise<string> {
  const docId = data.id || `guard_${data.user_uid || Date.now()}`.slice(0, 128);
  try {
    const payload: Record<string, unknown> = {
      user_uid: clampStr(data.user_uid, 128),
      full_name: clampStr(data.full_name, 120),
      email: clampStr(data.email, 200),
      phone: clampStr(data.phone, 40),
      address: clampStr(data.address, 400),
      relationship_type: data.relationship_type,
      linked_student_ids: data.linked_student_ids.slice(0, 10),
      verification_status: data.verification_status,
      status: data.status || 'ACTIVE',
      updatedAt: serverTimestamp(),
    };
    if (!data.id) payload.createdAt = serverTimestamp();

    await setDoc(doc(db, 'guardians', docId), payload, { merge: true });
    await createAuditLog({
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'UPSERT_GUARDIAN',
      targetCollection: 'guardians',
      targetId: docId,
      summary: `Menyimpan data Orang Tua/Wali ${data.full_name} (${data.relationship_type})`,
    });
    return docId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `guardians/${docId}`);
  }
}

export async function upsertCommitteeMember(
  data: {
    id?: string;
    user_uid: string;
    full_name: string;
    email: string;
    phone: string;
    committee_position: string;
    appointment_number: string;
    appointment_date: string;
    term_start: string;
    term_end: string;
    membership_status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  },
  actor: UserProfile
): Promise<string> {
  const docId = data.id || `com_${data.user_uid || Date.now()}`.slice(0, 128);
  try {
    const payload: Record<string, unknown> = {
      user_uid: clampStr(data.user_uid, 128),
      full_name: clampStr(data.full_name, 120),
      email: clampStr(data.email, 200),
      phone: clampStr(data.phone, 40),
      committee_position: clampStr(data.committee_position, 100),
      appointment_number: clampStr(data.appointment_number, 100),
      appointment_date: clampStr(data.appointment_date, 20),
      term_start: clampStr(data.term_start, 20),
      term_end: clampStr(data.term_end, 20),
      membership_status: data.membership_status,
      profile_status: 'VERIFIED',
      status: data.membership_status,
      updatedAt: serverTimestamp(),
    };
    if (!data.id) payload.createdAt = serverTimestamp();
    await setDoc(doc(db, 'committee_members', docId), payload, { merge: true });
    await createAuditLog({
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'UPSERT_COMMITTEE_MEMBER',
      targetCollection: 'committee_members',
      targetId: docId,
      summary: `Menyimpan Anggota Komite ${data.full_name} — ${data.committee_position} (SK: ${data.appointment_number})`,
    });
    return docId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `committee_members/${docId}`);
  }
}

export async function upsertFoundationAdmin(
  data: {
    id?: string;
    user_uid: string;
    full_name: string;
    email: string;
    phone: string;
    position: string;
    division: string;
    appointment_number: string;
    appointment_date: string;
    employment_status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  },
  actor: UserProfile
): Promise<string> {
  const docId = data.id || `fadm_${data.user_uid || Date.now()}`.slice(0, 128);
  try {
    const payload: Record<string, unknown> = {
      user_uid: clampStr(data.user_uid, 128),
      full_name: clampStr(data.full_name, 120),
      email: clampStr(data.email, 200),
      phone: clampStr(data.phone, 40),
      position: clampStr(data.position, 100),
      division: clampStr(data.division, 100),
      appointment_number: clampStr(data.appointment_number, 100),
      appointment_date: clampStr(data.appointment_date, 20),
      employment_status: data.employment_status,
      status: data.employment_status,
      updatedAt: serverTimestamp(),
    };
    if (!data.id) payload.createdAt = serverTimestamp();
    await setDoc(doc(db, 'foundation_admins', docId), payload, { merge: true });
    await createAuditLog({
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'UPSERT_FOUNDATION_ADMIN',
      targetCollection: 'foundation_admins',
      targetId: docId,
      summary: `Menyimpan Admin Yayasan ${data.full_name} (${data.position} · ${data.division})`,
    });
    return docId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `foundation_admins/${docId}`);
  }
}

// --- Archive, Restore & Anti-Cascade Guarded Permanent Delete ---
export async function archiveMasterDoc(
  collectionName: string,
  id: string,
  actor?: UserProfile
): Promise<void> {
  const path = `${collectionName}/${id}`;
  try {
    await updateDoc(doc(db, collectionName, id), {
      status: 'ARCHIVED',
      ...(collectionName === 'users' ? { account_status: 'ARCHIVED' } : {}),
      ...(collectionName === 'committee_members' ? { membership_status: 'ARCHIVED' } : {}),
      ...(collectionName === 'foundation_admins' ? { employment_status: 'ARCHIVED' } : {}),
      updatedAt: serverTimestamp(),
    });
    if (collectionName === 'semesters') {
      try {
        await updateDoc(doc(db, 'academicPeriods', id), {
          status: 'ARCHIVED',
          isActive: false,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore
      }
    }
    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'ARCHIVE_MASTER_DATA',
        targetCollection: collectionName,
        targetId: id,
        summary: `Mengarsipkan dokumen ${collectionName}/${id} (soft archive, data historis tetap terjaga).`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function restoreMasterDoc(
  collectionName: string,
  id: string,
  actor?: UserProfile
): Promise<void> {
  const path = `${collectionName}/${id}`;
  try {
    await updateDoc(doc(db, collectionName, id), {
      status: 'ACTIVE',
      ...(collectionName === 'users' ? { account_status: 'ACTIVE' } : {}),
      ...(collectionName === 'committee_members' ? { membership_status: 'ACTIVE' } : {}),
      ...(collectionName === 'foundation_admins' ? { employment_status: 'ACTIVE' } : {}),
      updatedAt: serverTimestamp(),
    });
    if (collectionName === 'semesters') {
      try {
        await updateDoc(doc(db, 'academicPeriods', id), {
          status: 'ACTIVE',
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore
      }
    }
    if (actor) {
      await createAuditLog({
        actorName: actor.displayName,
        actorRole: actor.role,
        action: 'RESTORE_MASTER_DATA',
        targetCollection: collectionName,
        targetId: id,
        summary: `Memulihkan dokumen ${collectionName}/${id} menjadi ACTIVE.`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export interface PermanentDeleteCheckContext {
  students?: Student[];
  classes?: SchoolClass[];
  assessments?: StudentAssessment[];
  mutabaahLogs?: MutabaahLog[];
  classHistory?: ClassStudentHistory[];
  classAssignments?: ClassAssignment[];
  studentGuardians?: StudentGuardian[];
}

export function checkPermanentDeleteEligibility(
  collectionName: string,
  id: string,
  ctx: PermanentDeleteCheckContext
): { allowed: boolean; reason?: string } {
  if (collectionName === 'students') {
    const hasAss = (ctx.assessments || []).some((a) => a.studentId === id);
    const hasMut = (ctx.mutabaahLogs || []).some((m) => m.studentId === id);
    const hasHist = (ctx.classHistory || []).some((h) => h.studentId === id);
    const hasGuard = (ctx.studentGuardians || []).some((g) => g.student_id === id);
    if (hasAss || hasMut || hasHist || hasGuard) {
      return {
        allowed: false,
        reason:
          'Siswa memiliki catatan historis (penilaian Akhlakul Karimah, Mutaba’ah, riwayat kelas, atau relasi wali). Gunakan Arsipkan untuk menonaktifkan tanpa menghapus sejarah belajar.',
      };
    }
  }
  if (collectionName === 'classes') {
    const hasStu = (ctx.students || []).some((s) => s.classId === id);
    const hasAss = (ctx.assessments || []).some((a) => a.classId === id);
    const hasHist = (ctx.classHistory || []).some(
      (h) => h.toClassId === id || h.fromClassId === id
    );
    if (hasStu || hasAss || hasHist) {
      return {
        allowed: false,
        reason:
          'Kelas masih terkait dengan data siswa, riwayat kelas, atau penilaian. Gunakan Arsipkan agar tidak terjadi cascade delete.',
      };
    }
  }
  if (collectionName === 'cohorts') {
    const hasStu = (ctx.students || []).some((s) => s.cohort_id === id);
    const hasCls = (ctx.classes || []).some((c) => c.cohortId === id);
    if (hasStu || hasCls) {
      return {
        allowed: false,
        reason: 'Angkatan masih dirujuk oleh data kelas atau siswa aktif/arsip. Gunakan Arsipkan.',
      };
    }
  }
  if (collectionName === 'academicPeriods' || collectionName === 'semesters') {
    const hasAss = (ctx.assessments || []).some((a) => a.periodId === id || a.semesterId === id);
    const hasMut = (ctx.mutabaahLogs || []).some((m) => m.periodId === id || m.semesterId === id);
    if (hasAss || hasMut) {
      return {
        allowed: false,
        reason:
          'Semester/Periode ini memiliki data penilaian atau Mutaba’ah historis. Kunci atau Arsipkan agar riwayat lintas periode tidak rusak.',
      };
    }
  }
  return { allowed: true };
}

export async function permanentDeleteMasterDoc(
  collectionName: string,
  id: string,
  reason: string,
  actor: UserProfile,
  ctx: PermanentDeleteCheckContext
): Promise<void> {
  if (reason.trim().length < 5) {
    throw new Error('Wajib mengisi alasan resmi penghapusan permanen minimal 5 karakter.');
  }
  const check = checkPermanentDeleteEligibility(collectionName, id, ctx);
  if (!check.allowed) {
    throw new Error(check.reason || 'Penghapusan permanen ditolak karena masih ada relasi aktif/historis.');
  }
  const path = `${collectionName}/${id}`;
  try {
    await createAuditLog({
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'PERMANENT_DELETE_MASTER_DATA',
      targetCollection: collectionName,
      targetId: id,
      summary: `Hapus permanen ${collectionName}/${id}. Alasan: ${reason.trim()}`,
    });
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteMasterDoc(collectionName: string, id: string): Promise<void> {
  const path = `${collectionName}/${id}`;
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// --- Student 31-Indicator Assessment (Guru / Yayasan only) ---
export async function saveStudentAssessment(
  data: {
    studentId: string;
    nis?: string;
    studentName: string;
    unitCode: EducationLevel;
    cohortId?: string;
    academicYearId?: string;
    semesterId?: string;
    classId?: string;
    periodId: string;
    className: string;
    assessmentMonth?: string;
    assessmentYear?: string;
    scores: Record<string, number | null>;
    averageScore: number | null;
    verificationStatus: VerificationStatus;
    isPublishedToParents?: boolean;
    verifiedBy?: string;
    teacherNotes?: string;
    teacherIdentifier?: string;
    importSource?: 'manual' | 'excel';
    revisionReason?: string;
  },
  existingId?: string
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  const cleanLevel = normalizeEducationLevel(data.unitCode);
  try {
    const payload: Record<string, unknown> = {
      studentId: clampStr(data.studentId, 128),
      studentName: clampStr(data.studentName, 120),
      unitCode: cleanLevel,
      educationLevel: cleanLevel,
      periodId: clampStr(data.periodId, 128),
      className: clampStr(data.className, 80),
      scores: data.scores,
      averageScore:
        data.averageScore === null
          ? null
          : Math.min(100, Math.max(0, Number(data.averageScore) || 0)),
      verificationStatus: data.verificationStatus,
      isPublishedToParents: Boolean(data.isPublishedToParents),
      importSource: data.importSource || 'manual',
      updatedAt: serverTimestamp(),
    };
    if (data.nis?.trim()) payload.nis = clampStr(data.nis, 50);
    if (data.classId?.trim()) payload.classId = clampStr(data.classId, 128);
    if (data.cohortId?.trim()) payload.cohortId = clampStr(data.cohortId, 128);
    if (data.academicYearId?.trim()) payload.academicYearId = clampStr(data.academicYearId, 128);
    if (data.semesterId?.trim()) payload.semesterId = clampStr(data.semesterId, 128);
    if (data.assessmentMonth?.trim()) payload.assessmentMonth = clampStr(data.assessmentMonth, 20);
    if (data.assessmentYear?.trim()) payload.assessmentYear = clampStr(data.assessmentYear, 10);
    if (data.verifiedBy?.trim()) payload.verifiedBy = clampStr(data.verifiedBy, 120);
    if (data.teacherNotes?.trim()) payload.teacherNotes = clampStr(data.teacherNotes, 1000);
    if (data.teacherIdentifier?.trim())
      payload.teacherIdentifier = clampStr(data.teacherIdentifier, 150);
    if (data.revisionReason?.trim()) payload.revisionReason = clampStr(data.revisionReason, 1000);

    if (existingId) {
      await updateDoc(doc(db, 'studentAssessments', existingId), payload);
    } else {
      await addDoc(collection(db, 'studentAssessments'), {
        ...payload,
        createdBy: uid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      existingId ? OperationType.UPDATE : OperationType.CREATE,
      'studentAssessments'
    );
  }
}

export async function toggleAssessmentPublishToParents(
  assessmentId: string,
  isPublishedToParents: boolean
): Promise<void> {
  const path = `studentAssessments/${assessmentId}`;
  try {
    await updateDoc(doc(db, 'studentAssessments', assessmentId), {
      isPublishedToParents,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Batch Excel Import Commit (Safe chunking & partial failure reporting) ---
export interface ExcelImportCommitResult {
  succeededFiles: string[];
  failedFiles: { fileName: string; reason: string }[];
}

export async function commitExcelAssessmentImport(params: {
  profile: UserProfile;
  selectedClass: SchoolClass;
  selectedPeriod: AcademicPeriod;
  items: ParsedAssessmentPreview[];
  verificationStatus: VerificationStatus;
  publishToParents: boolean;
  onProgress?: (done: number, total: number) => void;
}): Promise<ExcelImportCommitResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');

  const {
    profile,
    selectedClass,
    selectedPeriod,
    items,
    verificationStatus,
    publishToParents,
    onProgress,
  } = params;

  const cleanClassLevel = normalizeEducationLevel(selectedClass.unitCode);

  const eligible = items.filter(
    (item) =>
      item.student &&
      (item.status === 'VALID' ||
        item.status === 'NEEDS REVIEW' ||
        (item.status === 'DUPLICATE' &&
          item.revisionEnabled &&
          item.revisionReason.trim().length >= 5))
  );

  const failedFiles: { fileName: string; reason: string }[] = items
    .filter((item) => !eligible.includes(item))
    .map((item) => ({
      fileName: item.fileName,
      reason: item.errors[0] || item.warnings[0] || `Status ${item.status} tidak diimport`,
    }));

  const succeededFiles: string[] = [];

  const CHUNK_SIZE = 100;
  for (let i = 0; i < eligible.length; i += CHUNK_SIZE) {
    const chunk = eligible.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((item) => {
      const stu = item.student!;
      const docRef = item.existingAssessmentId
        ? doc(db, 'studentAssessments', item.existingAssessmentId)
        : doc(collection(db, 'studentAssessments'));

      const basePayload: Record<string, unknown> = {
        studentId: stu.id,
        nis: clampStr(stu.nis, 50),
        studentName: clampStr(stu.name, 120),
        unitCode: cleanClassLevel,
        educationLevel: cleanClassLevel,
        ...(stu.cohort_id ? { cohortId: clampStr(stu.cohort_id, 128) } : {}),
        ...(selectedClass.academicYearId ? { academicYearId: selectedClass.academicYearId } : {}),
        ...(selectedClass.semesterId ? { semesterId: selectedClass.semesterId } : {}),
        classId: selectedClass.id,
        className: clampStr(selectedClass.name, 80),
        periodId: selectedPeriod.id,
        assessmentMonth: clampStr(item.identitas?.assessmentMonth || '', 20),
        assessmentYear: clampStr(item.identitas?.assessmentYear || '', 10),
        scores: item.scores,
        averageScore: item.averagePct,
        verificationStatus,
        isPublishedToParents: Boolean(publishToParents),
        teacherIdentifier: clampStr(
          item.identitas?.teacherIdentifier || profile.email,
          150
        ),
        importSource: 'excel',
        updatedAt: serverTimestamp(),
      };
      if (item.teacherNotes.trim()) {
        basePayload.teacherNotes = clampStr(item.teacherNotes, 1000);
      }
      if (verificationStatus === 'Terverifikasi') {
        basePayload.verifiedBy = clampStr(profile.displayName, 120);
      }
      if (item.existingAssessmentId && item.revisionReason.trim()) {
        basePayload.revisionReason = clampStr(item.revisionReason, 1000);
      }

      if (item.existingAssessmentId) {
        batch.update(docRef, basePayload);
      } else {
        batch.set(docRef, {
          ...basePayload,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
      }
    });

    try {
      await batch.commit();
      chunk.forEach((item) => succeededFiles.push(item.fileName));
    } catch {
      for (const item of chunk) {
        try {
          await saveStudentAssessment(
            {
              studentId: item.student!.id,
              nis: item.student!.nis,
              studentName: item.student!.name,
              unitCode: cleanClassLevel,
              cohortId: item.student!.cohort_id,
              academicYearId: selectedClass.academicYearId,
              semesterId: selectedClass.semesterId,
              classId: selectedClass.id,
              periodId: selectedPeriod.id,
              className: selectedClass.name,
              assessmentMonth: item.identitas?.assessmentMonth || '',
              assessmentYear: item.identitas?.assessmentYear || '',
              scores: item.scores,
              averageScore: item.averagePct,
              verificationStatus,
              isPublishedToParents: publishToParents,
              verifiedBy:
                verificationStatus === 'Terverifikasi' ? profile.displayName : undefined,
              teacherNotes: item.teacherNotes,
              teacherIdentifier: item.identitas?.teacherIdentifier || profile.email,
              importSource: 'excel',
              revisionReason: item.revisionReason || undefined,
            },
            item.existingAssessmentId || undefined
          );
          succeededFiles.push(item.fileName);
        } catch (err) {
          failedFiles.push({
            fileName: item.fileName,
            reason: err instanceof Error ? err.message : 'Gagal menulis ke Firestore',
          });
        }
      }
    }
    if (onProgress) {
      onProgress(Math.min(i + chunk.length, eligible.length), eligible.length);
    }
  }

  const status: 'Sukses' | 'Sebagian Gagal' | 'Gagal' =
    failedFiles.length === 0
      ? 'Sukses'
      : succeededFiles.length > 0
      ? 'Sebagian Gagal'
      : 'Gagal';

  const fileListText = items.map((x) => x.fileName).join(', ');
  const errMsgText = failedFiles.map((f) => `${f.fileName}: ${f.reason}`).join(' | ');

  try {
    const logRef = await addDoc(collection(db, 'excelImportLogs'), {
      fileName: clampStr(fileListText || 'import.xlsx', 300),
      teacherUid: uid,
      teacherName: clampStr(profile.displayName, 120),
      unitCode: cleanClassLevel,
      classId: selectedClass.id,
      className: clampStr(selectedClass.name, 80),
      periodId: selectedPeriod.id,
      periodName: clampStr(selectedPeriod.name, 100),
      validCount: succeededFiles.length,
      failedCount: failedFiles.length,
      status,
      ...(errMsgText ? { errorMessage: clampStr(errMsgText, 2000) } : {}),
      createdAt: serverTimestamp(),
    });

    await createAuditLog({
      actorName: profile.displayName,
      actorRole: profile.role,
      action: 'EXCEL_IMPORT_ASSESSMENT',
      targetCollection: 'excelImportLogs',
      targetId: logRef.id,
      summary: `Import Excel kelas ${cleanClassLevel} - ${selectedClass.name} (${selectedPeriod.name}): ${succeededFiles.length} berhasil, ${failedFiles.length} gagal.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'excelImportLogs');
  }

  return { succeededFiles, failedFiles };
}

// --- Mutabaah Logs ---
export async function createMutabaahLog(data: {
  studentId: string;
  studentName: string;
  unitCode: EducationLevel;
  cohortId?: string;
  academicYearId?: string;
  semesterId?: string;
  classId: string;
  periodId: string;
  logDate: string;
  sholatWajibCount: number;
  tilawahPages: number;
  dzikirCompleted: boolean;
  infaqDone: boolean;
  adabNotes?: string;
  isPublishedToParents: boolean;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  const cleanLevel = normalizeEducationLevel(data.unitCode);
  try {
    const payload: Record<string, unknown> = {
      studentId: clampStr(data.studentId, 128),
      studentName: clampStr(data.studentName, 120),
      unitCode: cleanLevel,
      educationLevel: cleanLevel,
      classId: clampStr(data.classId, 128),
      periodId: clampStr(data.periodId, 128),
      logDate: clampStr(data.logDate, 30),
      sholatWajibCount: Math.min(5, Math.max(0, Number(data.sholatWajibCount) || 0)),
      tilawahPages: Math.min(604, Math.max(0, Number(data.tilawahPages) || 0)),
      dzikirCompleted: Boolean(data.dzikirCompleted),
      infaqDone: Boolean(data.infaqDone),
      isPublishedToParents: Boolean(data.isPublishedToParents),
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (data.cohortId?.trim()) payload.cohortId = clampStr(data.cohortId, 128);
    if (data.academicYearId?.trim()) payload.academicYearId = clampStr(data.academicYearId, 128);
    if (data.semesterId?.trim()) payload.semesterId = clampStr(data.semesterId, 128);
    if (data.adabNotes?.trim()) {
      payload.adabNotes = clampStr(data.adabNotes, 1000);
    }
    await addDoc(collection(db, 'mutabaahLogs'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'mutabaahLogs');
  }
}

// --- Unit Aggregate (Guru / Yayasan write; Komite read-only) ---
export async function saveUnitAggregate(data: {
  unitCode: EducationLevel;
  periodId: string;
  periodName: string;
  assessedStudentCount: number;
  overallAkhlakScore: number;
  indicatorScores: Record<string, number>;
  monevProgressPct: number;
  mutabaahCompliancePct: number;
  pembiasaanExecutionPct: number;
  religiousConditionSummary: string;
  keyConstraints?: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  const cleanLevel = normalizeEducationLevel(data.unitCode);
  const docId = `${getUnitDocId(cleanLevel)}_${clampStr(data.periodId, 60).replace(
    /[^a-zA-Z0-9_-]/g,
    ''
  )}`;
  const path = `unitAggregates/${docId}`;
  try {
    const payload: Record<string, unknown> = {
      unitCode: cleanLevel,
      periodId: clampStr(data.periodId, 128),
      periodName: clampStr(data.periodName, 100),
      assessedStudentCount: Math.max(0, Number(data.assessedStudentCount) || 0),
      overallAkhlakScore: Math.min(100, Math.max(0, Number(data.overallAkhlakScore) || 0)),
      indicatorScores: data.indicatorScores,
      monevProgressPct: Math.min(100, Math.max(0, Number(data.monevProgressPct) || 0)),
      mutabaahCompliancePct: Math.min(
        100,
        Math.max(0, Number(data.mutabaahCompliancePct) || 0)
      ),
      pembiasaanExecutionPct: Math.min(
        100,
        Math.max(0, Number(data.pembiasaanExecutionPct) || 0)
      ),
      religiousConditionSummary: clampStr(data.religiousConditionSummary, 2000),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    };
    if (data.keyConstraints?.trim()) {
      payload.keyConstraints = clampStr(data.keyConstraints, 2000);
    }
    await setDoc(doc(db, 'unitAggregates', docId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// --- Religious Programs (Monev, Mutabaah, Pembiasaan) ---
export async function createReligiousProgram(data: {
  category: ProgramCategory;
  unitCode: EducationLevel;
  periodId: string;
  title: string;
  description: string;
  targetParticipants: number;
  actualParticipants: number;
  completionPct: number;
  schedule: string;
  picName: string;
  status: ProgramStatus;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  const cleanLevel = normalizeEducationLevel(data.unitCode);
  try {
    await addDoc(collection(db, 'religiousPrograms'), {
      category: data.category,
      unitCode: cleanLevel,
      periodId: clampStr(data.periodId, 128),
      title: clampStr(data.title, 180),
      description: clampStr(data.description, 2000),
      targetParticipants: Math.max(0, Number(data.targetParticipants) || 0),
      actualParticipants: Math.max(0, Number(data.actualParticipants) || 0),
      completionPct: Math.min(100, Math.max(0, Number(data.completionPct) || 0)),
      schedule: clampStr(data.schedule, 120),
      picName: clampStr(data.picName, 120),
      status: data.status,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'religiousPrograms');
  }
}

export async function updateKomiteProgramEvaluationNote(
  programId: string,
  note: string
): Promise<void> {
  const path = `religiousPrograms/${programId}`;
  try {
    await updateDoc(doc(db, 'religiousPrograms', programId), {
      komiteEvaluationNote: clampStr(note, 2000),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Komite Findings & Recommendations ---
export async function createKomiteFinding(data: {
  title: string;
  unitCode: UnitScope;
  periodId: string;
  aspect: FindingAspect;
  findingDetail: string;
  problemAnalysis: string;
  recommendation: string;
  priority: FindingPriority;
  picName: string;
  picUnit: string;
  dueDate: string;
  createdByName: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  const cleanUnit =
    data.unitCode === 'Seluruh Unit'
      ? 'Seluruh Unit'
      : normalizeEducationLevel(data.unitCode);
  try {
    await addDoc(collection(db, 'komiteFindings'), {
      title: clampStr(data.title, 200),
      unitCode: cleanUnit,
      periodId: clampStr(data.periodId, 128),
      aspect: data.aspect,
      findingDetail: clampStr(data.findingDetail, 3000),
      problemAnalysis: clampStr(data.problemAnalysis, 3000),
      recommendation: clampStr(data.recommendation, 3000),
      priority: data.priority,
      picName: clampStr(data.picName, 150),
      picUnit: clampStr(data.picUnit, 80),
      dueDate: clampStr(data.dueDate, 30),
      followUpStatus: 'Baru' as FollowUpStatus,
      createdBy: uid,
      createdByName: clampStr(data.createdByName, 120),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'komiteFindings');
  }
}

export async function updateKomiteFindingByKomite(
  findingId: string,
  updates: Partial<{
    title: string;
    unitCode: UnitScope;
    aspect: FindingAspect;
    findingDetail: string;
    problemAnalysis: string;
    recommendation: string;
    priority: FindingPriority;
    picName: string;
    picUnit: string;
    dueDate: string;
    followUpStatus: FollowUpStatus;
    komiteEvaluationNote: string;
  }>
): Promise<void> {
  const path = `komiteFindings/${findingId}`;
  try {
    const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.title !== undefined) clean.title = clampStr(updates.title, 200);
    if (updates.unitCode !== undefined) {
      clean.unitCode =
        updates.unitCode === 'Seluruh Unit'
          ? 'Seluruh Unit'
          : normalizeEducationLevel(updates.unitCode);
    }
    if (updates.aspect !== undefined) clean.aspect = updates.aspect;
    if (updates.findingDetail !== undefined)
      clean.findingDetail = clampStr(updates.findingDetail, 3000);
    if (updates.problemAnalysis !== undefined)
      clean.problemAnalysis = clampStr(updates.problemAnalysis, 3000);
    if (updates.recommendation !== undefined)
      clean.recommendation = clampStr(updates.recommendation, 3000);
    if (updates.priority !== undefined) clean.priority = updates.priority;
    if (updates.picName !== undefined) clean.picName = clampStr(updates.picName, 150);
    if (updates.picUnit !== undefined) clean.picUnit = clampStr(updates.picUnit, 80);
    if (updates.dueDate !== undefined) clean.dueDate = clampStr(updates.dueDate, 30);
    if (updates.followUpStatus !== undefined)
      clean.followUpStatus = updates.followUpStatus;
    if (updates.komiteEvaluationNote !== undefined) {
      clean.komiteEvaluationNote = clampStr(updates.komiteEvaluationNote, 3000);
    }
    await updateDoc(doc(db, 'komiteFindings', findingId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateFindingFollowUpByUnit(
  findingId: string,
  followUpStatus: FollowUpStatus,
  followUpResponse: string
): Promise<void> {
  const path = `komiteFindings/${findingId}`;
  try {
    await updateDoc(doc(db, 'komiteFindings', findingId), {
      followUpStatus,
      followUpResponse: clampStr(followUpResponse, 3000),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Komite Meetings & Decisions ---
export async function createKomiteMeeting(data: {
  title: string;
  meetingDate: string;
  agenda: string;
  participants: string[];
  minutes: string;
  chairperson: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  try {
    const cleanParticipants = data.participants
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 40);
    const ref = await addDoc(collection(db, 'komiteMeetings'), {
      title: clampStr(data.title, 200),
      meetingDate: clampStr(data.meetingDate, 30),
      agenda: clampStr(data.agenda, 2000),
      participants: cleanParticipants,
      minutes: clampStr(data.minutes, 8000),
      chairperson: clampStr(data.chairperson, 120),
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'komiteMeetings');
  }
}

export async function createKomiteDecision(data: {
  meetingId: string;
  meetingTitle: string;
  decisionText: string;
  unitCode: UnitScope;
  picName: string;
  deadline: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  const cleanUnit =
    data.unitCode === 'Seluruh Unit'
      ? 'Seluruh Unit'
      : normalizeEducationLevel(data.unitCode);
  try {
    await addDoc(collection(db, 'komiteDecisions'), {
      meetingId: clampStr(data.meetingId, 128),
      meetingTitle: clampStr(data.meetingTitle, 200),
      decisionText: clampStr(data.decisionText, 2000),
      unitCode: cleanUnit,
      picName: clampStr(data.picName, 150),
      deadline: clampStr(data.deadline, 30),
      executionStatus: 'Belum Dimulai' as DecisionExecutionStatus,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'komiteDecisions');
  }
}

export async function updateKomiteDecisionStatus(
  decisionId: string,
  executionStatus: DecisionExecutionStatus,
  progressNote: string
): Promise<void> {
  const path = `komiteDecisions/${decisionId}`;
  try {
    await updateDoc(doc(db, 'komiteDecisions', decisionId), {
      executionStatus,
      progressNote: clampStr(progressNote, 2000),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// --- Komite Reports ---
export async function createKomiteReport(data: {
  title: string;
  periodId: string;
  periodName: string;
  unitScope: string;
  executiveSummary: string;
  findingsCount: number;
  completedFollowUpsCount: number;
  decisionsCount: number;
  createdByName: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Pengguna belum terautentikasi.');
  try {
    await addDoc(collection(db, 'komiteReports'), {
      title: clampStr(data.title, 200),
      periodId: clampStr(data.periodId, 128),
      periodName: clampStr(data.periodName, 100),
      unitScope: clampStr(data.unitScope, 120),
      executiveSummary: clampStr(data.executiveSummary, 5000),
      findingsCount: Math.max(0, Number(data.findingsCount) || 0),
      completedFollowUpsCount: Math.max(
        0,
        Number(data.completedFollowUpsCount) || 0
      ),
      decisionsCount: Math.max(0, Number(data.decisionsCount) || 0),
      createdBy: uid,
      createdByName: clampStr(data.createdByName, 120),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'komiteReports');
  }
}

export function roleLabel(role: UserRole): string {
  return roleLabelCanonical(role);
}
