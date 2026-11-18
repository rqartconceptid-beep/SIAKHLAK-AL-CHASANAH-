export type CanonicalRole =
  | 'STUDENT'
  | 'PARENT'
  | 'TEACHER'
  | 'HOMEROOM_TEACHER'
  | 'COMMITTEE_ADMIN'
  | 'FOUNDATION_ADMIN'
  | 'SUPER_ADMIN';

export const CANONICAL_ROLES: readonly CanonicalRole[] = [
  'STUDENT',
  'PARENT',
  'TEACHER',
  'HOMEROOM_TEACHER',
  'COMMITTEE_ADMIN',
  'FOUNDATION_ADMIN',
  'SUPER_ADMIN',
] as const;

// Includes legacy role aliases for backward-compatible normalization of existing Firestore docs
export type UserRole =
  | CanonicalRole
  | 'super_admin'
  | 'yayasan'
  | 'komite_pendidikan_agama'
  | 'guru'
  | 'siswa'
  | 'orang_tua';

export type LifecycleStatus =
  | 'PENDING'
  | 'PENDING_VERIFICATION'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'INACTIVE'
  | 'ARCHIVED';
export type AccountStatus =
  | LifecycleStatus
  | 'active'
  | 'inactive'
  | 'suspended'
  | 'revoked'
  | 'pending'
  | 'pending_verification'
  | 'archived';
export type ProfileStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export type LoginPortal =
  | 'parent_student'
  | 'teacher'
  | 'committee'
  | 'foundation';

export type EducationLevel = 'TK' | 'SD' | 'SMP' | 'SMA' | 'SMK';
export type LegacyUnitCode = EducationLevel | 'KB/TK' | 'SD/SDI';
export type UnitCode = EducationLevel;
export type UnitScope = UnitCode | 'Seluruh Unit';

export const EDUCATION_LEVELS: readonly EducationLevel[] = [
  'TK',
  'SD',
  'SMP',
  'SMA',
  'SMK',
] as const;

export const EDUCATION_UNITS: readonly EducationLevel[] = EDUCATION_LEVELS;

export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  TK: 'Taman Kanak-Kanak (TK)',
  SD: 'Sekolah Dasar (SD)',
  SMP: 'Sekolah Menengah Pertama (SMP)',
  SMA: 'Sekolah Menengah Atas (SMA)',
  SMK: 'Sekolah Menengah Kejuruan (SMK)',
};

export const LOGIN_EDUCATION_LEVEL_OPTIONS: readonly {
  value: EducationLevel;
  label: string;
  description: string;
}[] = [
  { value: 'TK', label: 'KB/TK', description: 'Kelompok Bermain & Taman Kanak-Kanak' },
  { value: 'SD', label: 'SD', description: 'Sekolah Dasar' },
  { value: 'SMP', label: 'SMP', description: 'Sekolah Menengah Pertama' },
  { value: 'SMA', label: 'SMA', description: 'Sekolah Menengah Atas' },
  { value: 'SMK', label: 'SMK', description: 'Sekolah Menengah Kejuruan' },
] as const;

export interface StudentLoginSelection {
  educationLevel: EducationLevel;
  educationUnitId?: string;
  academicYearId: string;
  classId: string;
}

export interface TeacherLoginSelection {
  educationLevel: EducationLevel;
  educationUnitId?: string;
  academicYearId: string;
  classId: string;
}

export const UNIT_LABELS: Record<EducationLevel, string> = EDUCATION_LEVEL_LABELS;

export function normalizeEducationLevel(code?: string | null): EducationLevel {
  const clean = (code || '').trim().toUpperCase();
  switch (clean) {
    case 'TK':
    case 'KB/TK':
    case 'KBTK':
      return 'TK';
    case 'SD':
    case 'SD/SDI':
    case 'SDI':
      return 'SD';
    case 'SMP':
      return 'SMP';
    case 'SMA':
      return 'SMA';
    case 'SMK':
      return 'SMK';
    default:
      return 'SD';
  }
}

export function isEducationLevelValue(code?: string | null): boolean {
  const clean = (code || '').trim().toUpperCase();
  return ['TK', 'SD', 'SMP', 'SMA', 'SMK', 'KB/TK', 'SD/SDI'].includes(clean);
}

export function matchesEducationLevel(
  recordUnit?: string | null,
  filterUnit?: string | null
): boolean {
  if (!filterUnit || filterUnit === 'ALL' || filterUnit === 'Seluruh Unit') return true;
  if (!recordUnit) return false;
  if (recordUnit === 'Seluruh Unit') return true;
  return normalizeEducationLevel(recordUnit) === normalizeEducationLevel(filterUnit);
}

export function normalizeAccountStatus(status?: string | null): LifecycleStatus {
  const s = (status || '').trim().toUpperCase();
  if (s === 'PENDING') return 'PENDING';
  if (s === 'PENDING_VERIFICATION') return 'PENDING_VERIFICATION';
  if (s === 'SUSPENDED') return 'SUSPENDED';
  if (s === 'REVOKED') return 'REVOKED';
  if (s === 'ARCHIVED') return 'ARCHIVED';
  if (s === 'INACTIVE' || s === 'DISABLED' || s === 'REJECTED') return 'INACTIVE';
  return 'ACTIVE';
}

export function isAccountActive(status?: string | null): boolean {
  return normalizeAccountStatus(status) === 'ACTIVE';
}

export type PermissionKey =
  | 'assessment:read_own'
  | 'assessment:read_assigned'
  | 'assessment:write'
  | 'assessment:verify'
  | 'assessment:publish'
  | 'assessment:excel_import'
  | 'mutabaah:read'
  | 'mutabaah:write'
  | 'program:read'
  | 'program:write'
  | 'master:read'
  | 'master:write'
  | 'committee:read'
  | 'committee:manage_findings'
  | 'committee:manage_meetings'
  | 'committee:manage_reports'
  | 'committee:view_individual_students'
  | 'foundation:manage_users'
  | 'foundation:manage_permissions'
  | 'foundation:manage_settings'
  | 'foundation:manage_assignments'
  | 'foundation:view_audit'
  | 'super_admin:manage_governance'
  | 'users:manage_roles'
  | 'users:manage_status'
  | 'permissions:manage_matrix'
  | 'followup:respond';

export const ALL_PERMISSIONS: readonly { key: PermissionKey; label: string }[] = [
  { key: 'assessment:read_own', label: 'Baca Penilaian Anak (Orang Tua/Wali)' },
  { key: 'assessment:read_assigned', label: 'Baca Penilaian Kelas Penugasan' },
  { key: 'assessment:write', label: 'Input/Edit Penilaian 31 Indikator' },
  { key: 'assessment:excel_import', label: 'Download Template & Import Excel' },
  { key: 'assessment:verify', label: 'Verifikator Penilaian Guru' },
  { key: 'assessment:publish', label: 'Publikasi Nilai ke Orang Tua' },
  { key: 'mutabaah:read', label: 'Baca Catatan Mutaba’ah' },
  { key: 'mutabaah:write', label: 'Catat Mutaba’ah Siswa' },
  { key: 'program:read', label: 'Baca Program Keagamaan' },
  { key: 'program:write', label: 'Kelola Program Keagamaan' },
  { key: 'followup:respond', label: 'Tindak Lanjut Rekomendasi Unit' },
  { key: 'master:read', label: 'Baca Data Master' },
  { key: 'master:write', label: 'Kelola Data Master Unit/Kelas/Siswa' },
  { key: 'committee:read', label: 'Monitoring Komite Pendidikan Agama' },
  { key: 'committee:manage_findings', label: 'Kelola Temuan & Rekomendasi Komite' },
  { key: 'committee:manage_meetings', label: 'Kelola Rapat & Keputusan Komite' },
  { key: 'committee:manage_reports', label: 'Buat Laporan Komite' },
  { key: 'committee:view_individual_students', label: 'Akses Khusus Data Siswa Individual (Komite)' },
  { key: 'foundation:manage_assignments', label: 'Penugasan Guru & Relasi Wali' },
  { key: 'foundation:manage_settings', label: 'Pengaturan Sistem Yayasan' },
  { key: 'foundation:view_audit', label: 'Audit Trail Sistem' },
  { key: 'foundation:manage_users', label: 'Manajemen Akun Operasional (Backend)' },
  { key: 'foundation:manage_permissions', label: 'Permission Matrix Legacy (Backend)' },
  { key: 'super_admin:manage_governance', label: 'Tata Kelola Tertinggi Sistem (SUPER_ADMIN)' },
  { key: 'users:manage_roles', label: 'Penetapan Role Pengguna (Backend SUPER_ADMIN)' },
  { key: 'users:manage_status', label: 'Aktivasi / Suspensi / Pencabutan Akun (Backend)' },
  { key: 'permissions:manage_matrix', label: 'Kelola Matriks Izin Terpusat (Backend SUPER_ADMIN)' },
] as const;

export const DEFAULT_ORGANIZATION_ID = 'yayasan_siakhlak';

export function normalizeRole(role?: string | null): CanonicalRole {
  switch ((role || '').trim()) {
    case 'SUPER_ADMIN':
    case 'super_admin':
      return 'SUPER_ADMIN';
    case 'FOUNDATION_ADMIN':
    case 'yayasan':
      return 'FOUNDATION_ADMIN';
    case 'COMMITTEE_ADMIN':
    case 'komite_pendidikan_agama':
      return 'COMMITTEE_ADMIN';
    case 'HOMEROOM_TEACHER':
      return 'HOMEROOM_TEACHER';
    case 'TEACHER':
    case 'guru':
      return 'TEACHER';
    case 'PARENT':
    case 'orang_tua':
      return 'PARENT';
    case 'STUDENT':
    case 'siswa':
    default:
      return 'STUDENT';
  }
}

export function isSuperAdminRole(role?: string | null): boolean {
  return normalizeRole(role) === 'SUPER_ADMIN';
}

export function isFoundationAdminRole(role?: string | null): boolean {
  return normalizeRole(role) === 'FOUNDATION_ADMIN';
}

export function isFoundationOrSuperAdmin(role?: string | null): boolean {
  const canonical = normalizeRole(role);
  return canonical === 'FOUNDATION_ADMIN' || canonical === 'SUPER_ADMIN';
}

export function isTeacherRole(role?: string | null): boolean {
  const canonical = normalizeRole(role);
  return canonical === 'TEACHER' || canonical === 'HOMEROOM_TEACHER';
}

export function normalizeRolesList(
  roles?: readonly string[] | null,
  singleRole?: string | null
): CanonicalRole[] {
  const source = roles && roles.length > 0 ? roles : singleRole ? [singleRole] : ['STUDENT'];
  return Array.from(new Set(source.map((r) => normalizeRole(r))));
}

export function defaultPermissionsForRole(role: CanonicalRole): PermissionKey[] {
  switch (role) {
    case 'STUDENT':
      return ['mutabaah:read'];
    case 'PARENT':
      return ['assessment:read_own', 'mutabaah:read'];
    case 'TEACHER':
      return [
        'assessment:read_assigned',
        'assessment:write',
        'assessment:excel_import',
        'mutabaah:read',
        'mutabaah:write',
        'program:read',
        'program:write',
        'master:read',
        'followup:respond',
      ];
    case 'HOMEROOM_TEACHER':
      return [
        'assessment:read_assigned',
        'assessment:write',
        'assessment:excel_import',
        'assessment:publish',
        'mutabaah:read',
        'mutabaah:write',
        'program:read',
        'program:write',
        'master:read',
        'followup:respond',
      ];
    case 'COMMITTEE_ADMIN':
      return [
        'committee:read',
        'committee:manage_findings',
        'committee:manage_meetings',
        'committee:manage_reports',
        'mutabaah:read',
        'program:read',
      ];
    case 'FOUNDATION_ADMIN':
      return [
        'assessment:read_assigned',
        'assessment:write',
        'assessment:verify',
        'assessment:publish',
        'assessment:excel_import',
        'mutabaah:read',
        'mutabaah:write',
        'program:read',
        'program:write',
        'master:read',
        'master:write',
        'committee:read',
        'committee:manage_findings',
        'committee:manage_meetings',
        'committee:manage_reports',
        'committee:view_individual_students',
        'foundation:manage_assignments',
        'foundation:manage_settings',
        'foundation:view_audit',
        'followup:respond',
      ];
    case 'SUPER_ADMIN':
      return ALL_PERMISSIONS.map((p) => p.key);
  }
}

export type FollowUpStatus =
  | 'Baru'
  | 'Diterima'
  | 'Dalam Proses'
  | 'Menunggu Verifikasi'
  | 'Selesai'
  | 'Perlu Perbaikan';

export const FOLLOW_UP_STATUSES: readonly FollowUpStatus[] = [
  'Baru',
  'Diterima',
  'Dalam Proses',
  'Menunggu Verifikasi',
  'Selesai',
  'Perlu Perbaikan',
] as const;

export type FindingPriority = 'Rendah' | 'Sedang' | 'Tinggi' | 'Kritis';
export type FindingAspect =
  | 'Pendidikan Agama'
  | 'Akhlakul Karimah'
  | 'Monev'
  | 'Mutabaah'
  | 'Pembiasaan Keagamaan';

export type ProgramCategory = 'monev' | 'mutabaah' | 'pembiasaan';
export type ProgramStatus = 'Direncanakan' | 'Berjalan' | 'Selesai' | 'Terkendala';
export type DecisionExecutionStatus = 'Belum Dimulai' | 'Berjalan' | 'Selesai' | 'Terlambat';
export type VerificationStatus = 'Draft' | 'Menunggu Verifikasi' | 'Terverifikasi';

export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  full_name: string;
  displayName: string;
  phone?: string;
  profile_photo?: string;
  roles: CanonicalRole[];
  role: CanonicalRole;
  account_status: LifecycleStatus;
  profile_status?: ProfileStatus;
  /** Informational mirror only; Firebase Auth token email_verified is the sole authoritative check. */
  emailVerified?: boolean;
  requested_portal?: LoginPortal;
  requested_role?: CanonicalRole;
  organization_id: string;
  assignedUnits: EducationLevel[];
  assignedClassIds?: string[];
  linkedStudentIds?: string[];
  permissions?: PermissionKey[];
  allowIndividualStudentAccess: boolean;
  created_at?: unknown;
  updated_at?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPermissionsDoc {
  id: string;
  uid: string;
  organization_id: string;
  permissions: PermissionKey[];
  assigned_units: EducationLevel[];
  assigned_classes: string[];
  updated_by: string;
  updated_at?: unknown;
}

export interface StudentGuardian {
  id: string;
  student_id: string;
  guardian_uid: string;
  guardian_id?: string;
  relationship_type: 'ayah' | 'ibu' | 'wali' | 'siswa';
  verification_status: 'verified' | 'pending' | 'rejected';
  organization_id: string;
  created_by: string;
  created_at?: unknown;
  updated_at?: unknown;
}

export interface ClassAssignment {
  id: string;
  teacher_uid: string;
  teacher_id?: string;
  class_id: string;
  education_unit_id: EducationLevel;
  academic_year_id: string;
  semester_id?: string;
  assignment_status: 'active' | 'inactive' | 'archived';
  is_homeroom?: boolean;
  subject_name?: string;
  organization_id: string;
  created_by: string;
  created_at?: unknown;
  updated_at?: unknown;
}

export interface SystemConfig {
  id: string;
  foundationName: string;
  activePeriodId: string;
  activePeriodName: string;
  komiteDefaultScope: string;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface EducationUnit {
  id: string;
  code: EducationLevel;
  education_level?: EducationLevel;
  name: string;
  headName: string;
  address?: string;
  phone?: string;
  studentCount: number;
  teacherCount: number;
  classCount: number;
  religiousProgramNote?: string;
  status?: LifecycleStatus;
  updatedAt?: unknown;
}

export interface Cohort {
  id: string;
  cohortName: string;
  educationUnitId: string;
  educationLevel: EducationLevel;
  admissionYear: string;
  graduationYear?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AcademicYearDoc {
  id: string;
  yearName: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SemesterDoc {
  id: string;
  academicYearId: string;
  yearName: string;
  semester: 'Ganjil' | 'Genap';
  name: string;
  isActive: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AcademicPeriod {
  id: string;
  name: string;
  year: string;
  semester: 'Ganjil' | 'Genap';
  academicYearId?: string;
  isActive: boolean;
  status?: LifecycleStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SchoolClass {
  id: string;
  unitCode: EducationLevel;
  educationLevel?: EducationLevel;
  educationUnitId?: string;
  educationUnitName?: string;
  name: string;
  className?: string;
  level: string;
  cohortId?: string;
  cohortName?: string;
  academicYearId?: string;
  semesterId?: string;
  homeroomTeacherUid?: string;
  homeroomTeacherName: string;
  studentCount: number;
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type EducationClass = SchoolClass;

export interface ClassStudentHistory {
  id: string;
  studentId: string;
  nis: string;
  studentName: string;
  educationLevel: EducationLevel;
  educationUnitId: string;
  cohortId: string;
  academicYearId: string;
  semesterId: string;
  fromClassId?: string;
  fromClassName?: string;
  toClassId: string;
  toClassName: string;
  movementType: 'ENROLLMENT' | 'PROMOTION' | 'TRANSFER';
  notes?: string;
  movedByUid: string;
  movedByName: string;
  createdAt?: unknown;
}

export interface Teacher {
  id: string;
  teacher_id?: string;
  user_uid?: string;
  nip: string;
  employee_number?: string;
  name: string;
  full_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  birth_place?: string;
  birth_date?: string;
  gender?: 'L' | 'P';
  unitCode: EducationLevel;
  education_level?: EducationLevel;
  education_unit_id?: string;
  roleTitle: string;
  position?: string;
  employment_status?: 'TETAP' | 'KONTRAK' | 'HONORER';
  employment_start_date?: string;
  teaching_subjects?: string[];
  assigned_class_ids?: string[];
  academic_year_assignments?: string[];
  isPaiTeacher: boolean;
  profile_photo?: string;
  profile_status?: ProfileStatus;
  status?: LifecycleStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Student {
  id: string;
  student_id?: string;
  nis: string;
  nisn?: string;
  name: string;
  full_name?: string;
  birth_place?: string;
  birth_date?: string;
  gender: 'L' | 'P';
  address?: string;
  phone?: string;
  unitCode: EducationLevel;
  education_level?: EducationLevel;
  education_unit_id?: string;
  admission_year?: string;
  cohort_id?: string;
  academic_year_id?: string;
  semester_id?: string;
  classId: string;
  class_id?: string;
  className: string;
  studentUid?: string;
  student_uid?: string;
  guardianUids?: string[];
  guardian_uids?: string[];
  profile_photo?: string;
  profile_status?: ProfileStatus;
  status?: LifecycleStatus;
  account_status?: LifecycleStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GuardianProfile {
  id: string;
  guardian_id?: string;
  user_uid: string;
  full_name: string;
  email: string;
  phone: string;
  address: string;
  relationship_type: 'ayah' | 'ibu' | 'wali';
  linked_student_ids: string[];
  verification_status: 'verified' | 'pending' | 'rejected';
  profile_photo?: string;
  status: LifecycleStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CommitteeMemberProfile {
  id: string;
  committee_member_id?: string;
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
  profile_photo?: string;
  profile_status?: ProfileStatus;
  status: LifecycleStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FoundationAdminProfile {
  id: string;
  admin_id?: string;
  user_uid: string;
  full_name: string;
  email: string;
  phone: string;
  position: string;
  division: string;
  appointment_number: string;
  appointment_date: string;
  employment_status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  profile_photo?: string;
  status: LifecycleStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type InstrumentVersion = 'v1.0-legacy' | 'v2.0-canonical';

export type InstrumentLifecycleStatus =
  | 'ACTIVE_PRODUCTION'
  | 'EMULATOR_TESTING_ONLY'
  | 'DEPRECATED'
  | 'ARCHIVED';

export type FoundationApprovalStatus =
  | 'OPERATIONAL_LEGACY'
  | 'PENDING_FOUNDATION_DECREE'
  | 'FORMALLY_APPROVED';

export interface InstrumentMetadata {
  readonly version: InstrumentVersion;
  readonly name: string;
  readonly sourceDocument: string;
  readonly instrumentStatus: InstrumentLifecycleStatus;
  readonly approvalStatus: FoundationApprovalStatus;
  readonly effectiveDate: string | null;
}

export interface StudentAssessment {
  id: string;
  studentId: string;
  nis?: string;
  studentName: string;
  unitCode: EducationLevel;
  educationLevel?: EducationLevel;
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
  instrumentVersion?: InstrumentVersion;
  verificationStatus: VerificationStatus;
  isPublishedToParents?: boolean;
  verifiedBy?: string;
  teacherNotes?: string;
  teacherIdentifier?: string;
  importSource?: 'manual' | 'excel';
  revisionReason?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MutabaahLog {
  id: string;
  studentId: string;
  studentName: string;
  unitCode: EducationLevel;
  educationLevel?: EducationLevel;
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
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ExcelImportLog {
  id: string;
  fileName: string;
  teacherUid: string;
  teacherName: string;
  unitCode: EducationLevel;
  classId: string;
  className: string;
  periodId: string;
  periodName: string;
  validCount: number;
  failedCount: number;
  status: 'Sukses' | 'Sebagian Gagal' | 'Gagal';
  errorMessage?: string;
  createdAt?: unknown;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetCollection: string;
  targetId: string;
  summary: string;
  createdAt?: unknown;
}

export interface UnitAggregate {
  id: string;
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
  updatedBy: string;
  updatedAt?: unknown;
}

export interface ReligiousProgram {
  id: string;
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
  komiteEvaluationNote?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface KomiteFinding {
  id: string;
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
  followUpStatus: FollowUpStatus;
  followUpResponse?: string;
  komiteEvaluationNote?: string;
  createdBy: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface KomiteMeeting {
  id: string;
  title: string;
  meetingDate: string;
  agenda: string;
  participants: string[];
  minutes: string;
  chairperson: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface KomiteDecision {
  id: string;
  meetingId: string;
  meetingTitle: string;
  decisionText: string;
  unitCode: UnitScope;
  picName: string;
  deadline: string;
  executionStatus: DecisionExecutionStatus;
  progressNote?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface KomiteReport {
  id: string;
  title: string;
  periodId: string;
  periodName: string;
  unitScope: string;
  executiveSummary: string;
  findingsCount: number;
  completedFollowUpsCount: number;
  decisionsCount: number;
  createdBy: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AkhlakIndicatorDef {
  code: string;
  excelCode: string;
  number: number;
  domain: string;
  title: string;
  description: string;
}

export const LEGACY_31_INDICATORS: readonly AkhlakIndicatorDef[] = [
  // A. Akidah & Ibadah (1-7)
  {
    code: 'IND_01',
    excelCode: 'P01',
    number: 1,
    domain: 'Akidah & Ibadah',
    title: 'Ketauhidan dan keyakinan kepada rukun iman',
    description: 'Menunjukkan keyakinan yang lurus terhadap rukun iman serta menjauhi perilaku syirik dalam keseharian.',
  },
  {
    code: 'IND_02',
    excelCode: 'P02',
    number: 2,
    domain: 'Akidah & Ibadah',
    title: 'Kedisiplinan sholat fardhu lima waktu',
    description: 'Melaksanakan sholat fardhu lima waktu tepat waktu dengan kesadaran penuh.',
  },
  {
    code: 'IND_03',
    excelCode: 'P03',
    number: 3,
    domain: 'Akidah & Ibadah',
    title: 'Pelaksanaan sholat berjamaah di sekolah/masjid',
    description: 'Mengikuti sholat berjamaah di lingkungan sekolah atau masjid dengan tertib.',
  },
  {
    code: 'IND_04',
    excelCode: 'P04',
    number: 4,
    domain: 'Akidah & Ibadah',
    title: 'Kesempurnaan tata cara wudhu dan thaharah',
    description: 'Menerapkan rukun, sunnah wudhu, dan kebersihan diri sebelum beribadah secara benar.',
  },
  {
    code: 'IND_05',
    excelCode: 'P05',
    number: 5,
    domain: 'Akidah & Ibadah',
    title: 'Kebiasaan sholat sunnah Dhuha dan Rawatib',
    description: 'Membiasakan sholat sunnah Dhuha dan Rawatib secara konsisten.',
  },
  {
    code: 'IND_06',
    excelCode: 'P06',
    number: 6,
    domain: 'Akidah & Ibadah',
    title: 'Kemampuan dan kelancaran membaca Al-Qur’an',
    description: 'Membaca Al-Qur’an dengan makhraj dan kaidah tajwid yang benar.',
  },
  {
    code: 'IND_07',
    excelCode: 'P07',
    number: 7,
    domain: 'Akidah & Ibadah',
    title: 'Capaian hafalan Al-Qur’an (Tahfidz) sesuai target unit',
    description: 'Menyetorkan dan menjaga hafalan Al-Qur’an sesuai target jenjang unit pendidikan.',
  },

  // B. Dzikir, Doa & Adab Beribadah (8-12)
  {
    code: 'IND_08',
    excelCode: 'P08',
    number: 8,
    domain: 'Dzikir & Adab Ibadah',
    title: 'Pembiasaan dzikir pagi dan petang',
    description: 'Mengamalkan dzikir pagi dan petang serta dzikir setelah sholat dengan khusyuk.',
  },
  {
    code: 'IND_09',
    excelCode: 'P09',
    number: 9,
    domain: 'Dzikir & Adab Ibadah',
    title: 'Menghafal dan mengamalkan doa-doa harian',
    description: 'Membaca doa sebelum dan sesudah beraktivitas harian dengan adab yang baik.',
  },
  {
    code: 'IND_10',
    excelCode: 'P10',
    number: 10,
    domain: 'Dzikir & Adab Ibadah',
    title: 'Adab di dalam masjid dan majelis ilmu',
    description: 'Menjaga ketenangan, kesopanan, dan penghormatan saat berada di masjid atau majelis ilmu.',
  },
  {
    code: 'IND_11',
    excelCode: 'P11',
    number: 11,
    domain: 'Dzikir & Adab Ibadah',
    title: 'Pelaksanaan puasa sunnah dan pemahaman shaum',
    description: 'Memahami keutamaan shaum serta berpartisipasi dalam pembiasaan puasa sunnah.',
  },
  {
    code: 'IND_12',
    excelCode: 'P12',
    number: 12,
    domain: 'Dzikir & Adab Ibadah',
    title: 'Kegemaran berinfaq, bersedekah, dan berbagi',
    description: 'Menunjukkan kerelaan berbagi dan berinfaq melalui program sosial sekolah.',
  },

  // C. Adab kepada Orang Tua, Guru & Sesama (13-18)
  {
    code: 'IND_13',
    excelCode: 'P13',
    number: 13,
    domain: 'Adab Relasional',
    title: 'Birrul walidain (bakti dan santun kepada orang tua)',
    description: 'Menghormati, menaati, dan bertutur santun kepada kedua orang tua.',
  },
  {
    code: 'IND_14',
    excelCode: 'P14',
    number: 14,
    domain: 'Adab Relasional',
    title: 'Takzim dan kepatuhan kepada guru serta pendidik',
    description: 'Menunjukkan sikap hormat, mendengarkan nasihat, dan menaati arahan guru.',
  },
  {
    code: 'IND_15',
    excelCode: 'P15',
    number: 15,
    domain: 'Adab Relasional',
    title: 'Membiasakan salam, senyum, dan sapa Islami',
    description: 'Mengucapkan salam dan menyapa dengan ramah saat bertemu warga sekolah.',
  },
  {
    code: 'IND_16',
    excelCode: 'P16',
    number: 16,
    domain: 'Adab Relasional',
    title: 'Bertutur kata lembut, sopan, dan menghindari ucapan kasar',
    description: 'Menggunakan bahasa yang santun dan menghindari kata-kata tercela atau menyakiti.',
  },
  {
    code: 'IND_17',
    excelCode: 'P17',
    number: 17,
    domain: 'Adab Relasional',
    title: 'Menghormati yang lebih tua dan menyayangi yang lebih muda',
    description: 'Menjaga adab pergaulan lintas usia dengan penuh kasih sayang dan hormat.',
  },
  {
    code: 'IND_18',
    excelCode: 'P18',
    number: 18,
    domain: 'Adab Relasional',
    title: 'Menjaga ukhuwah Islamiyah dan menghindari perundungan',
    description: 'Membangun persaudaraan antar teman serta menolak segala bentuk perundungan.',
  },

  // D. Integritas & Akhlak Pribadi (19-25)
  {
    code: 'IND_19',
    excelCode: 'P19',
    number: 19,
    domain: 'Integritas Pribadi',
    title: 'Kejujuran dalam ucapan, tugas, dan ujian (Shidiq)',
    description: 'Berkata benar, tidak mencontek, dan mengakui kesalahan secara jujur.',
  },
  {
    code: 'IND_20',
    excelCode: 'P20',
    number: 20,
    domain: 'Integritas Pribadi',
    title: 'Menjaga amanah dan tanggung jawab tugas (Amanah)',
    description: 'Menyelesaikan tugas sekolah dan tanggung jawab pribadi dengan dapat dipercaya.',
  },
  {
    code: 'IND_21',
    excelCode: 'P21',
    number: 21,
    domain: 'Integritas Pribadi',
    title: 'Kerendahan hati dan tidak sombong (Tawadhu)',
    description: 'Bersikap rendah hati dalam prestasi maupun pergaulan sehari-hari.',
  },
  {
    code: 'IND_22',
    excelCode: 'P22',
    number: 22,
    domain: 'Integritas Pribadi',
    title: 'Kesabaran dan pengendalian emosi diri (Shabr)',
    description: 'Mampu menahan amarah dan bersikap tenang ketika menghadapi persoalan.',
  },
  {
    code: 'IND_23',
    excelCode: 'P23',
    number: 23,
    domain: 'Integritas Pribadi',
    title: 'Rasa syukur atas nikmat Allah SWT (Syukur)',
    description: 'Menunjukkan sikap berterima kasih dan mensyukuri karunia dalam ucapan dan tindakan.',
  },
  {
    code: 'IND_24',
    excelCode: 'P24',
    number: 24,
    domain: 'Integritas Pribadi',
    title: 'Menjaga kehormatan diri dan menutup aurat sesuai syariat',
    description: 'Berpakaian rapi, sopan, dan menutup aurat sesuai ketentuan syariat dan tata tertib.',
  },
  {
    code: 'IND_25',
    excelCode: 'P25',
    number: 25,
    domain: 'Integritas Pribadi',
    title: 'Kemandirian dan ketekunan dalam belajar (Ijtihad)',
    description: 'Belajar secara mandiri dan bersungguh-sungguh tanpa bergantung pada orang lain.',
  },

  // E. Kedisiplinan, Kebersihan & Kepedulian Sosial (26-31)
  {
    code: 'IND_26',
    excelCode: 'P26',
    number: 26,
    domain: 'Disiplin & Kepedulian',
    title: 'Kedisiplinan waktu dan kehadiran belajar',
    description: 'Hadir tepat waktu dan mematuhi jadwal kegiatan sekolah secara konsisten.',
  },
  {
    code: 'IND_27',
    excelCode: 'P27',
    number: 27,
    domain: 'Disiplin & Kepedulian',
    title: 'Kebersihan diri, pakaian, dan kerapian penampilan',
    description: 'Menjaga kebersihan badan, seragam, serta kerapian perlengkapan belajar.',
  },
  {
    code: 'IND_28',
    excelCode: 'P28',
    number: 28,
    domain: 'Disiplin & Kepedulian',
    title: 'Menjaga kebersihan dan kelestarian lingkungan sekolah',
    description: 'Membuang sampah pada tempatnya dan turut merawat kebersihan kelas serta fasilitas.',
  },
  {
    code: 'IND_29',
    excelCode: 'P29',
    number: 29,
    domain: 'Disiplin & Kepedulian',
    title: 'Adab makan, minum, dan menjaga kesehatan jasmani',
    description: 'Menerapkan adab makan dan minum Islami serta memilih asupan halal dan thayyib.',
  },
  {
    code: 'IND_30',
    excelCode: 'P30',
    number: 30,
    domain: 'Disiplin & Kepedulian',
    title: 'Kepedulian sosial, empati, dan tolong-menolong (Ta’awun)',
    description: 'Peka membantu teman atau warga sekolah yang membutuhkan pertolongan.',
  },
  {
    code: 'IND_31',
    excelCode: 'P31',
    number: 31,
    domain: 'Disiplin & Kepedulian',
    title: 'Etika bermedia digital dan menjaga lisan di ruang daring',
    description: 'Menggunakan perangkat digital secara bijak, sopan, dan terhindar dari konten negatif.',
  },
] as const;

/**
 * Backward compatibility alias: references the active operational legacy master.
 */
export const AKHLAK_31_INDICATORS = LEGACY_31_INDICATORS;

/**
 * 31 Canonical Akhlak Indicators from Primary Source Document [S2]:
 * "Format Penilaian Akhlakul Karimah(1).docx"
 *
 * Status: Defined for development & Emulator testing only.
 * Approval Status: PENDING_FOUNDATION_DECREE
 */
export const CANONICAL_31_INDICATORS: readonly AkhlakIndicatorDef[] = [
  // A. Akhlak kepada Allah SWT (1-6)
  {
    code: 'IND_01',
    excelCode: 'P01',
    number: 1,
    domain: 'Akhlak kepada Allah SWT',
    title: 'Melaksanakan ibadah shalat (shalat dhuha dan shalat zuhur berjamaah)',
    description: 'Melaksanakan ibadah shalat (shalat dhuha dan shalat zuhur berjamaah)',
  },
  {
    code: 'IND_02',
    excelCode: 'P02',
    number: 2,
    domain: 'Akhlak kepada Allah SWT',
    title: 'Membaca doa, juz amma, dan bersholawat sebelum pelajaran dimulai',
    description: 'Membaca doa, juz amma, dan bersholawat sebelum pelajaran dimulai',
  },
  {
    code: 'IND_03',
    excelCode: 'P03',
    number: 3,
    domain: 'Akhlak kepada Allah SWT',
    title: "Mengikuti kegiatan tahfiz, membaca surah Yasin, dan sholawat Imrithi (khusus hari Jum'at)",
    description: "Mengikuti kegiatan tahfiz, membaca surah Yasin, dan sholawat Imrithi (khusus hari Jum'at)",
  },
  {
    code: 'IND_04',
    excelCode: 'P04',
    number: 4,
    domain: 'Akhlak kepada Allah SWT',
    title: 'Selalu bersyukur atas nikmat yang diberikan Allah SWT',
    description: 'Selalu bersyukur atas nikmat yang diberikan Allah SWT',
  },
  {
    code: 'IND_05',
    excelCode: 'P05',
    number: 5,
    domain: 'Akhlak kepada Allah SWT',
    title: 'Berdoa kepada Allah SWT dalam setiap kegiatan',
    description: 'Berdoa kepada Allah SWT dalam setiap kegiatan',
  },
  {
    code: 'IND_06',
    excelCode: 'P06',
    number: 6,
    domain: 'Akhlak kepada Allah SWT',
    title: 'Bertawakal hanya kepada Allah SWT setelah berikhtiar',
    description: 'Bertawakal hanya kepada Allah SWT setelah berikhtiar',
  },

  // B. Akhlak terhadap Rasul (7-8)
  {
    code: 'IND_07',
    excelCode: 'P07',
    number: 7,
    domain: 'Akhlak terhadap Rasul',
    title: 'Meneladani sifat-sifat Rasulullah SAW (shidiq/jujur, amanah) dalam keseharian',
    description: 'Meneladani sifat-sifat Rasulullah SAW (shidiq/jujur, amanah) dalam keseharian',
  },
  {
    code: 'IND_08',
    excelCode: 'P08',
    number: 8,
    domain: 'Akhlak terhadap Rasul',
    title: 'Mencintai Nabi dan Rasul dengan membiasakan bersholawat',
    description: 'Mencintai Nabi dan Rasul dengan membiasakan bersholawat',
  },

  // C. Akhlak terhadap Orang Tua (9-15)
  {
    code: 'IND_09',
    excelCode: 'P09',
    number: 9,
    domain: 'Akhlak terhadap Orang Tua',
    title: 'Selalu berbakti kepada orang tua',
    description: 'Selalu berbakti kepada orang tua',
  },
  {
    code: 'IND_10',
    excelCode: 'P10',
    number: 10,
    domain: 'Akhlak terhadap Orang Tua',
    title: 'Selalu mendoakan orang tua',
    description: 'Selalu mendoakan orang tua',
  },
  {
    code: 'IND_11',
    excelCode: 'P11',
    number: 11,
    domain: 'Akhlak terhadap Orang Tua',
    title: 'Membantu pekerjaan orang tua',
    description: 'Membantu pekerjaan orang tua',
  },
  {
    code: 'IND_12',
    excelCode: 'P12',
    number: 12,
    domain: 'Akhlak terhadap Orang Tua',
    title: 'Menaati perintah orang tua',
    description: 'Menaati perintah orang tua',
  },
  {
    code: 'IND_13',
    excelCode: 'P13',
    number: 13,
    domain: 'Akhlak terhadap Orang Tua',
    title: 'Berkata dengan sopan dan lembut saat berbicara dengan orang tua',
    description: 'Berkata dengan sopan dan lembut saat berbicara dengan orang tua',
  },
  {
    code: 'IND_14',
    excelCode: 'P14',
    number: 14,
    domain: 'Akhlak terhadap Orang Tua',
    title: 'Melakukan hal-hal yang membuat orang tua senang dan bangga',
    description: 'Melakukan hal-hal yang membuat orang tua senang dan bangga',
  },
  {
    code: 'IND_15',
    excelCode: 'P15',
    number: 15,
    domain: 'Akhlak terhadap Orang Tua',
    title: 'Menjauhi perbuatan buruk terhadap orang tua',
    description: 'Menjauhi perbuatan buruk terhadap orang tua',
  },

  // D. Akhlak terhadap Guru (16-21)
  {
    code: 'IND_16',
    excelCode: 'P16',
    number: 16,
    domain: 'Akhlak terhadap Guru',
    title: 'Mengucap salam dan menyapa ketika berjumpa dengan guru',
    description: 'Mengucap salam dan menyapa ketika berjumpa dengan guru',
  },
  {
    code: 'IND_17',
    excelCode: 'P17',
    number: 17,
    domain: 'Akhlak terhadap Guru',
    title: 'Bersikap sopan dan santun ketika berbicara kepada guru',
    description: 'Bersikap sopan dan santun ketika berbicara kepada guru',
  },
  {
    code: 'IND_18',
    excelCode: 'P18',
    number: 18,
    domain: 'Akhlak terhadap Guru',
    title: 'Bersikap hormat terhadap guru',
    description: 'Bersikap hormat terhadap guru',
  },
  {
    code: 'IND_19',
    excelCode: 'P19',
    number: 19,
    domain: 'Akhlak terhadap Guru',
    title: 'Mencium tangan guru ketika bertemu',
    description: 'Mencium tangan guru ketika bertemu',
  },
  {
    code: 'IND_20',
    excelCode: 'P20',
    number: 20,
    domain: 'Akhlak terhadap Guru',
    title: 'Melaksanakan apa yang diperintahkan oleh guru',
    description: 'Melaksanakan apa yang diperintahkan oleh guru',
  },
  {
    code: 'IND_21',
    excelCode: 'P21',
    number: 21,
    domain: 'Akhlak terhadap Guru',
    title: 'Mendengarkan dengan baik saat guru menjelaskan pelajaran',
    description: 'Mendengarkan dengan baik saat guru menjelaskan pelajaran',
  },

  // E. Akhlak terhadap Sesama Teman (22-31)
  {
    code: 'IND_22',
    excelCode: 'P22',
    number: 22,
    domain: 'Akhlak terhadap Sesama Teman',
    title: 'Tidak menyakiti hati teman, baik melalui ucapan maupun perbuatan',
    description: 'Tidak menyakiti hati teman, baik melalui ucapan maupun perbuatan',
  },
  {
    code: 'IND_23',
    excelCode: 'P23',
    number: 23,
    domain: 'Akhlak terhadap Sesama Teman',
    title: 'Menolong teman yang membutuhkan pertolongan',
    description: 'Menolong teman yang membutuhkan pertolongan',
  },
  {
    code: 'IND_24',
    excelCode: 'P24',
    number: 24,
    domain: 'Akhlak terhadap Sesama Teman',
    title: 'Memanggil teman dengan sebutan yang baik dan tidak mengejek',
    description: 'Memanggil teman dengan sebutan yang baik dan tidak mengejek',
  },
  {
    code: 'IND_25',
    excelCode: 'P25',
    number: 25,
    domain: 'Akhlak terhadap Sesama Teman',
    title: 'Saling memaafkan jika ada teman yang berbuat salah',
    description: 'Saling memaafkan jika ada teman yang berbuat salah',
  },
  {
    code: 'IND_26',
    excelCode: 'P26',
    number: 26,
    domain: 'Akhlak terhadap Sesama Teman',
    title: 'Membiasakan senyum, salam, dan sapa (3S) kepada teman',
    description: 'Membiasakan senyum, salam, dan sapa (3S) kepada teman',
  },
  {
    code: 'IND_27',
    excelCode: 'P27',
    number: 27,
    domain: 'Akhlak terhadap Sesama Teman',
    title: 'Bersikap pemaaf terhadap sesama',
    description: 'Bersikap pemaaf terhadap sesama',
  },
  {
    code: 'IND_28',
    excelCode: 'P28',
    number: 28,
    domain: 'Akhlak terhadap Sesama Teman',
    title: 'Memiliki kasih sayang dan saling menghormati sesama',
    description: 'Memiliki kasih sayang dan saling menghormati sesama',
  },
  {
    code: 'IND_29',
    excelCode: 'P29',
    number: 29,
    domain: 'Akhlak terhadap Sesama Teman',
    title: 'Bersikap adil dalam berperilaku dengan sesama, tidak membeda-bedakan teman',
    description: 'Bersikap adil dalam berperilaku dengan sesama, tidak membeda-bedakan teman',
  },
  {
    code: 'IND_30',
    excelCode: 'P30',
    number: 30,
    domain: 'Akhlak terhadap Sesama Teman',
    title: 'Bersikap jujur dalam menyampaikan sesuatu sesuai kenyataan',
    description: 'Bersikap jujur dalam menyampaikan sesuatu sesuai kenyataan',
  },
  {
    code: 'IND_31',
    excelCode: 'P31',
    number: 31,
    domain: 'Akhlak terhadap Sesama Teman',
    title: 'Bertutur kata sopan dan santun, serta menjaga perbuatan',
    description: 'Bertutur kata sopan dan santun, serta menjaga perbuatan',
  },
] as const;

export interface InstrumentDefinition extends InstrumentMetadata {
  readonly indicators: readonly AkhlakIndicatorDef[];
}

export const INSTRUMENT_DEFINITIONS: Readonly<Record<InstrumentVersion, InstrumentDefinition>> = {
  'v1.0-legacy': {
    version: 'v1.0-legacy',
    name: 'Instrumen Penilaian Akhlakul Karimah v1.0 (Legacy Operational)',
    sourceDocument: 'Master Aplikasi Bawaan Sistem (src/types/siakhlak.ts)',
    instrumentStatus: 'ACTIVE_PRODUCTION',
    approvalStatus: 'OPERATIONAL_LEGACY',
    effectiveDate: null,
    indicators: LEGACY_31_INDICATORS,
  },
  'v2.0-canonical': {
    version: 'v2.0-canonical',
    name: 'Instrumen Penilaian Akhlakul Karimah v2.0 (Resmi Yayasan Al-Chasanah)',
    sourceDocument: 'Format Penilaian Akhlakul Karimah(1).docx [S2]',
    instrumentStatus: 'EMULATOR_TESTING_ONLY',
    approvalStatus: 'PENDING_FOUNDATION_DECREE',
    effectiveDate: null,
    indicators: CANONICAL_31_INDICATORS,
  },
} as const;

export type MasterSubmenuKey =
  | 'unit_pendidikan'
  | 'data_angkatan'
  | 'tahun_ajaran'
  | 'semester'
  | 'data_kelas'
  | 'data_siswa'
  | 'data_orang_tua'
  | 'data_guru'
  | 'penugasan_guru'
  | 'anggota_komite'
  | 'admin_yayasan'
  | 'relasi_wali'
  | 'manajemen_user'
  | 'role_permission'
  | 'audit_trail';

export type KomiteMenuKey =
  | 'komite_dashboard'
  | 'komite_monitoring_agama'
  | 'komite_evaluasi_program'
  | 'komite_monitoring_akhlak'
  | 'komite_monitoring_mutabaah'
  | 'komite_temuan_rekomendasi'
  | 'komite_rapat_keputusan'
  | 'komite_tindak_lanjut'
  | 'komite_laporan';

export type CoreMenuKey =
  | 'core_dashboard'
  | 'core_penilaian_akhlak'
  | 'core_program_keagamaan'
  | 'core_tindak_lanjut_unit'
  | 'core_master_data'
  | 'core_pengaturan_sistem'
  | 'core_audit_trail'
  | 'profil_saya';

export type StudentParentMenuKey =
  | 'siswa_dashboard'
  | 'siswa_profil'
  | 'siswa_akhlak'
  | 'siswa_mutabaah'
  | 'siswa_riwayat';

export type ActiveMenuKey = KomiteMenuKey | CoreMenuKey | StudentParentMenuKey;

export type DbConnectionStatus = 'CONNECTING' | 'CHECKING' | 'CONNECTED' | 'NOT CONNECTED';

export function getScoreValue(
  scores: Record<string, number | null> | undefined,
  ind: AkhlakIndicatorDef
): number | null {
  if (!scores) return null;
  if (ind.excelCode in scores) {
    const val = scores[ind.excelCode];
    return typeof val === 'number' && !Number.isNaN(val) ? val : null;
  }
  const alt1 = ind.excelCode.replace(/^P0(\d)$/, 'P$1');
  if (alt1 in scores) {
    const val = scores[alt1];
    return typeof val === 'number' && !Number.isNaN(val) ? val : null;
  }
  const alt2 = ind.excelCode.replace(/^P(\d)$/, 'P0$1');
  if (alt2 in scores) {
    const val = scores[alt2];
    return typeof val === 'number' && !Number.isNaN(val) ? val : null;
  }
  if (ind.code in scores) {
    const val = scores[ind.code];
    return typeof val === 'number' && !Number.isNaN(val) ? val : null;
  }
  return null;
}

export function portalForRole(role: UserRole): LoginPortal {
  const canonical = normalizeRole(role);
  if (canonical === 'STUDENT' || canonical === 'PARENT') return 'parent_student';
  if (canonical === 'TEACHER' || canonical === 'HOMEROOM_TEACHER') return 'teacher';
  if (canonical === 'COMMITTEE_ADMIN') return 'committee';
  return 'foundation';
}

export function portalLabel(portal: LoginPortal): string {
  switch (portal) {
    case 'parent_student':
      return 'Portal Siswa / Orang Tua Murid';
    case 'teacher':
      return 'Portal Guru / Wali Kelas';
    case 'committee':
      return 'Portal Admin Komite Pendidikan Agama';
    case 'foundation':
      return 'Portal Admin Yayasan';
  }
}

export function loginRouteForPortal(portal: LoginPortal): string {
  switch (portal) {
    case 'parent_student':
      return '/login/student-parent';
    case 'teacher':
      return '/login/teacher';
    case 'committee':
      return '/login/committee';
    case 'foundation':
      return '/login/foundation';
  }
}

export function portalFromLoginRoute(pathname: string): LoginPortal | null {
  const clean = pathname.trim().toLowerCase().replace(/\/+$/, '');
  if (clean === '/login/student-parent' || clean === '/login/parent-student') {
    return 'parent_student';
  }
  if (clean === '/login/teacher') return 'teacher';
  if (clean === '/login/committee') return 'committee';
  if (clean === '/login/foundation') return 'foundation';
  return null;
}

export function roleLabel(role: UserRole): string {
  switch (normalizeRole(role)) {
    case 'STUDENT':
      return 'Siswa (STUDENT)';
    case 'PARENT':
      return 'Orang Tua / Wali (PARENT)';
    case 'TEACHER':
      return 'Guru PAI / Bidang (TEACHER)';
    case 'HOMEROOM_TEACHER':
      return 'Wali Kelas (HOMEROOM_TEACHER)';
    case 'COMMITTEE_ADMIN':
      return 'Admin Komite Pendidikan Agama (COMMITTEE_ADMIN)';
    case 'FOUNDATION_ADMIN':
      return 'Admin Yayasan (FOUNDATION_ADMIN)';
    case 'SUPER_ADMIN':
      return 'Super Administrator (SUPER_ADMIN)';
  }
}
