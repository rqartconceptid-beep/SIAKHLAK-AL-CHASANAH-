import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  Archive,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  downloadStudentParentTemplate,
  downloadTeacherAssignmentAssessmentTemplate,
  triggerFileDownload,
} from '../../utils/excelTemplate';
import {
  validateStudentParentWorkbookBuffer,
  validateTeacherAssignmentWorkbookBuffer,
  StudentParentImportResult,
  TeacherAssignmentImportResult,
} from '../../utils/excelImportEngine';
import {
  AcademicPeriod,
  AcademicYearDoc,
  ALL_PERMISSIONS,
  AuditLog,
  ClassAssignment,
  ClassStudentHistory,
  Cohort,
  CommitteeMemberProfile,
  defaultPermissionsForRole,
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVELS,
  EducationLevel,
  EducationUnit,
  FoundationAdminProfile,
  GuardianProfile,
  isFoundationOrSuperAdmin,
  LifecycleStatus,
  MasterSubmenuKey,
  matchesEducationLevel,
  normalizeAccountStatus,
  normalizeEducationLevel,
  normalizeRole,
  PermissionKey,
  SchoolClass,
  SemesterDoc,
  Student,
  StudentAssessment,
  StudentGuardian,
  MutabaahLog,
  Teacher,
  UnitCode,
  UserPermissionsDoc,
  UserProfile,
} from '../../types/siakhlak';
import {
  archiveMasterDoc,
  checkPermanentDeleteEligibility,
  createAcademicYear,
  createCohort,
  createSchoolClass,
  createSemester,
  createStudent,
  createTeacher,
  createTeacherClassAssignment,
  createVerifiedGuardianRelation,
  formatTimestamp,
  permanentDeleteMasterDoc,
  PRIVILEGED_MUTATION_DISABLED_MESSAGE,
  promoteOrMoveStudent,
  restoreMasterDoc,
  saveEducationUnit,
  toggleAcademicPeriodActive,
  toggleAcademicYearActive,
  toggleClassAssignmentStatus,
  updateCohort,
  updateSchoolClass,
  updateStudent,
  updateTeacher,
  upsertCommitteeMember,
  upsertFoundationAdmin,
  upsertGuardianProfile,
} from '../../services/siakhlakService';
import { EmptyState, Panel, RestrictedNotice, SectionHeader } from '../ui/Primitives';
import { FoundationReportHeader } from '../branding/FoundationBrand';

const SUBMENU_TABS: { key: MasterSubmenuKey; label: string; routeSlug: string }[] = [
  { key: 'unit_pendidikan', label: '1. Unit Pendidikan', routeSlug: 'units' },
  { key: 'data_angkatan', label: '2. Data Angkatan', routeSlug: 'cohorts' },
  { key: 'tahun_ajaran', label: '3. Tahun Ajaran', routeSlug: 'academic-years' },
  { key: 'semester', label: '4. Semester', routeSlug: 'semesters' },
  { key: 'data_kelas', label: '5. Kelas & Kenaikan', routeSlug: 'classes' },
  { key: 'data_siswa', label: '6. Data Siswa', routeSlug: 'students' },
  { key: 'data_orang_tua', label: '7. Orang Tua / Wali', routeSlug: 'guardians' },
  { key: 'data_guru', label: '8. Data Guru', routeSlug: 'teachers' },
  { key: 'penugasan_guru', label: '9. Penugasan Guru', routeSlug: 'assignments' },
  { key: 'anggota_komite', label: '10. Anggota Komite', routeSlug: 'committee' },
  { key: 'admin_yayasan', label: '11. Admin Yayasan', routeSlug: 'admins' },
  { key: 'relasi_wali', label: '12. Relasi Siswa–Wali', routeSlug: 'relations' },
  { key: 'manajemen_user', label: '13. User & Approval', routeSlug: 'users' },
  { key: 'role_permission', label: '14. Role & Permission', routeSlug: 'permissions' },
  { key: 'audit_trail', label: '15. Audit Trail', routeSlug: 'audit' },
];

export function CoreMasterData({
  profile,
  units,
  periods,
  classes,
  teachers,
  students,
  cohorts = [],
  academicYears = [],
  semesters = [],
  classHistory = [],
  guardians = [],
  committeeMembers = [],
  foundationAdmins = [],
  classAssignments = [],
  studentGuardians = [],
  users = [],
  userPermissionsList = [],
  auditLogs = [],
  assessments = [],
  mutabaahLogs = [],
  initialSubmenu,
  onSubmenuRouteSync,
}: {
  profile: UserProfile;
  units: EducationUnit[];
  periods: AcademicPeriod[];
  classes: SchoolClass[];
  teachers: Teacher[];
  students: Student[];
  cohorts?: Cohort[];
  academicYears?: AcademicYearDoc[];
  semesters?: SemesterDoc[];
  classHistory?: ClassStudentHistory[];
  guardians?: GuardianProfile[];
  committeeMembers?: CommitteeMemberProfile[];
  foundationAdmins?: FoundationAdminProfile[];
  classAssignments?: ClassAssignment[];
  studentGuardians?: StudentGuardian[];
  users?: UserProfile[];
  userPermissionsList?: UserPermissionsDoc[];
  auditLogs?: AuditLog[];
  assessments?: StudentAssessment[];
  mutabaahLogs?: MutabaahLog[];
  initialSubmenu?: MasterSubmenuKey | null;
  onSubmenuRouteSync?: (routePath: string) => void;
}) {
  const canonicalRole = normalizeRole(profile.role);
  const isTeacher = canonicalRole === 'TEACHER' || canonicalRole === 'HOMEROOM_TEACHER';
  const isYayasan = isFoundationOrSuperAdmin(canonicalRole);

  const [tab, setTab] = useState<MasterSubmenuKey>(
    initialSubmenu || (isTeacher ? 'data_siswa' : 'unit_pendidikan')
  );

  useEffect(() => {
    if (initialSubmenu) {
      setTab(initialSubmenu);
    }
  }, [initialSubmenu]);

  const handleSelectTab = (next: MasterSubmenuKey) => {
    setTab(next);
    setErrorMsg(null);
    setSuccessMsg(null);
    if (isYayasan && onSubmenuRouteSync) {
      const def = SUBMENU_TABS.find((t) => t.key === next);
      if (def) onSubmenuRouteSync(`/foundation/master-data/${def.routeSlug}`);
    }
  };

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Permanent delete guarded dialog state
  const [permDeleteTarget, setPermDeleteTarget] = useState<{
    collection: string;
    id: string;
    label: string;
  } | null>(null);
  const [permDeleteReason, setPermDeleteReason] = useState('');

  // Excel Template & Import State
  const [importModalType, setImportModalType] = useState<'none' | 'student_parent' | 'teacher_assignment'>('none');
  const [studentParentImportResult, setStudentParentImportResult] = useState<StudentParentImportResult | null>(null);
  const [teacherImportResult, setTeacherImportResult] = useState<TeacherAssignmentImportResult | null>(null);

  const handleDownloadStudentParentTemplate = () => {
    setErrorMsg(null);
    try {
      downloadStudentParentTemplate();
      setSuccessMsg('Template Excel Siswa & Orang Tua (4 Sheet Lengkap) berhasil diunduh.');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setErrorMsg('Gagal mengunduh template: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDownloadTeacherAssignmentTemplate = () => {
    setErrorMsg(null);
    try {
      downloadTeacherAssignmentAssessmentTemplate();
      setSuccessMsg('Template Excel Guru, Wali Kelas & 31 Indikator (6 Sheet Lengkap) berhasil diunduh.');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setErrorMsg('Gagal mengunduh template: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleStudentParentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const buffer = await file.arrayBuffer();
      const res = validateStudentParentWorkbookBuffer(buffer, file.name);
      setStudentParentImportResult(res);
      setImportModalType('student_parent');
    } catch (err) {
      setErrorMsg('Gagal memproses file Excel: ' + (err instanceof Error ? err.message : String(err)));
    }
    e.target.value = '';
  };

  const handleTeacherFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const buffer = await file.arrayBuffer();
      const res = validateTeacherAssignmentWorkbookBuffer(buffer, file.name);
      setTeacherImportResult(res);
      setImportModalType('teacher_assignment');
    } catch (err) {
      setErrorMsg('Gagal memproses file Excel: ' + (err instanceof Error ? err.message : String(err)));
    }
    e.target.value = '';
  };

  // 1. Unit Pendidikan form
  const [uCode, setUCode] = useState<EducationLevel>('TK');
  const [uUnitId, setUUnitId] = useState<string>('');
  const [uName, setUName] = useState('');
  const [uHead, setUHead] = useState('');
  const [uAddress, setUAddress] = useState('');
  const [uPhone, setUPhone] = useState('');
  const [uStudents, setUStudents] = useState(0);
  const [uTeachers, setUTeachers] = useState(0);
  const [uClasses, setUClasses] = useState(0);
  const [uNote, setUNote] = useState('');

  // 2. Cohort form
  const [cohEditId, setCohEditId] = useState<string | null>(null);
  const [cohName, setCohName] = useState('');
  const [cohLevel, setCohLevel] = useState<EducationLevel>('SD');
  const [cohAdmitYear, setCohAdmitYear] = useState(String(new Date().getFullYear()));
  const [cohGradYear, setCohGradYear] = useState('');
  const [cohStatus, setCohStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [cohNotes, setCohNotes] = useState('');
  const [cohFilterLevel, setCohFilterLevel] = useState<string>('ALL');

  // 3. Academic Year form
  const [ayName, setAyName] = useState('');
  const [ayStart, setAyStart] = useState('');
  const [ayEnd, setAyEnd] = useState('');
  const [ayActive, setAyActive] = useState(true);

  // 4. Semester form
  const [semYearId, setSemYearId] = useState('');
  const [semTerm, setSemTerm] = useState<'Ganjil' | 'Genap'>('Ganjil');
  const [semName, setSemName] = useState('');
  const [semActive, setSemActive] = useState(true);

  // 5. Class + Promotion form
  const [cEditId, setCEditId] = useState<string | null>(null);
  const [cUnit, setCUnit] = useState<EducationLevel>('SD');
  const [cEducationUnitId, setCEducationUnitId] = useState<string>('');
  const [cName, setCName] = useState('');
  const [cLevel, setCLevel] = useState('');
  const [cCohortId, setCCohortId] = useState('');
  const [cYearId, setCYearId] = useState('');
  const [cSemId, setCSemId] = useState('');
  const [cHomeroomUid, setCHomeroomUid] = useState('');
  const [cHomeroom, setCHomeroom] = useState('');
  const [cCount, setCCount] = useState(0);

  // Kenaikan Kelas / Promotion state
  const [promoStudentId, setPromoStudentId] = useState('');
  const [promoTargetClassId, setPromoTargetClassId] = useState('');
  const [promoYearId, setPromoYearId] = useState('');
  const [promoSemId, setPromoSemId] = useState('');
  const [promoType, setPromoType] = useState<'ENROLLMENT' | 'PROMOTION' | 'TRANSFER'>('PROMOTION');
  const [promoNotes, setPromoNotes] = useState('');

  // 6. Student form + filters + edit
  const [sEditId, setSEditId] = useState<string | null>(null);
  const [sNis, setSNis] = useState('');
  const [sNisn, setSNisn] = useState('');
  const [sName, setSName] = useState('');
  const [sBirthPlace, setSBirthPlace] = useState('');
  const [sBirthDate, setSBirthDate] = useState('');
  const [sGender, setSGender] = useState<'L' | 'P'>('L');
  const [sAddress, setSAddress] = useState('');
  const [sPhone, setSPhone] = useState('');
  const [sUnit, setSUnit] = useState<EducationLevel>(
    profile.assignedUnits[0] ? normalizeEducationLevel(profile.assignedUnits[0]) : 'SD'
  );
  const [sCohortId, setSCohortId] = useState('');
  const [sAdmitYear, setSAdmitYear] = useState(String(new Date().getFullYear()));
  const [sAcademicYearId, setSAcademicYearId] = useState('');
  const [sClassId, setSClassId] = useState('');
  const [sStudentUid, setSStudentUid] = useState('');
  const [sAccountStatus, setSAccountStatus] = useState<LifecycleStatus>('ACTIVE');
  const [stuSearch, setStuSearch] = useState('');
  const [stuFilterLevel, setStuFilterLevel] = useState('ALL');
  const [stuFilterCohort, setStuFilterCohort] = useState('ALL');
  const [stuFilterStatus, setStuFilterStatus] = useState('ALL');

  // 7. Guardian form
  const [gEditId, setGEditId] = useState<string | null>(null);
  const [gUid, setGUid] = useState('');
  const [gName, setGName] = useState('');
  const [gEmail, setGEmail] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [gAddress, setGAddress] = useState('');
  const [gRel, setGRel] = useState<'ayah' | 'ibu' | 'wali'>('ayah');
  const [gVer, setGVer] = useState<'verified' | 'pending' | 'rejected'>('verified');

  // 8. Teacher form
  const [tEditId, setTEditId] = useState<string | null>(null);
  const [tNip, setTNip] = useState('');
  const [tName, setTName] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [tPhone, setTPhone] = useState('');
  const [tAddress, setTAddress] = useState('');
  const [tGender, setTGender] = useState<'L' | 'P'>('L');
  const [tUnit, setTUnit] = useState<EducationLevel>('SD');
  const [tRole, setTRole] = useState('Guru PAI');
  const [tEmpStatus, setTEmpStatus] = useState<'TETAP' | 'KONTRAK' | 'HONORER'>('TETAP');
  const [tSubjects, setTSubjects] = useState('PAI, Akhlakul Karimah');
  const [tPai, setTPai] = useState(true);
  const [tFilterLevel, setTFilterLevel] = useState('ALL');

  // 9. Class assignment form
  const [assignTeacherUid, setAssignTeacherUid] = useState('');
  const [assignClassId, setAssignClassId] = useState('');
  const [assignYearId, setAssignYearId] = useState('');
  const [assignSemId, setAssignSemId] = useState('');
  const [assignHomeroom, setAssignHomeroom] = useState(true);
  const [assignSubject, setAssignSubject] = useState('');

  // 10. Committee member form
  const [cmEditId, setCmEditId] = useState<string | null>(null);
  const [cmUid, setCmUid] = useState('');
  const [cmName, setCmName] = useState('');
  const [cmEmail, setCmEmail] = useState('');
  const [cmPhone, setCmPhone] = useState('');
  const [cmPos, setCmPos] = useState('Anggota Komite Pendidikan Agama');
  const [cmSk, setCmSk] = useState('');
  const [cmSkDate, setCmSkDate] = useState('');
  const [cmStart, setCmStart] = useState('');
  const [cmEnd, setCmEnd] = useState('');
  const [cmStatus, setCmStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ARCHIVED'>('ACTIVE');

  // 11. Foundation admin form
  const [faEditId, setFaEditId] = useState<string | null>(null);
  const [faUid, setFaUid] = useState('');
  const [faName, setFaName] = useState('');
  const [faEmail, setFaEmail] = useState('');
  const [faPhone, setFaPhone] = useState('');
  const [faPos, setFaPos] = useState('Admin Yayasan');
  const [faDiv, setFaDiv] = useState('Pendidikan & Pengawasan');
  const [faSk, setFaSk] = useState('');
  const [faSkDate, setFaSkDate] = useState('');
  const [faStatus, setFaStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ARCHIVED'>('ACTIVE');

  // 12. Student Guardian Relation form
  const [relStudentId, setRelStudentId] = useState('');
  const [relGuardianUid, setRelGuardianUid] = useState('');
  const [relType, setRelType] = useState<'ayah' | 'ibu' | 'wali'>('ayah');
  const [relStatus, setRelStatus] = useState<'verified' | 'pending' | 'rejected'>('verified');

  // 13 & 14. User & Permission inspection state (read-only in client SDK)
  const [expandedPermUid, setExpandedPermUid] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [auditFilter, setAuditFilter] = useState('');

  const permDeleteContext = useMemo(
    () => ({
      students,
      classes,
      assessments,
      mutabaahLogs,
      classHistory,
      classAssignments,
      studentGuardians,
    }),
    [students, classes, assessments, mutabaahLogs, classHistory, classAssignments, studentGuardians]
  );

  const pendingUsers = useMemo(
    () => users.filter((u) => normalizeAccountStatus(u.account_status) === 'PENDING'),
    [users]
  );

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (isTeacher && profile.assignedUnits.length > 0) {
        const unitMatch = profile.assignedUnits.some((u) => matchesEducationLevel(s.unitCode, u));
        if (!unitMatch) return false;
      }
      if (!matchesEducationLevel(s.unitCode, stuFilterLevel)) return false;
      if (stuFilterCohort !== 'ALL' && s.cohort_id !== stuFilterCohort && s.admission_year !== stuFilterCohort)
        return false;
      if (stuFilterStatus !== 'ALL' && (s.status || 'ACTIVE') !== stuFilterStatus) return false;
      if (stuSearch.trim()) {
        const q = stuSearch.toLowerCase();
        const text = `${s.nis} ${s.nisn || ''} ${s.name} ${s.className}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [students, isTeacher, profile.assignedUnits, stuFilterLevel, stuFilterCohort, stuFilterStatus, stuSearch]);

  if (
    canonicalRole === 'COMMITTEE_ADMIN' ||
    canonicalRole === 'STUDENT' ||
    canonicalRole === 'PARENT'
  ) {
    return (
      <RestrictedNotice
        title="Akses Data Master Dibatasi"
        message="Peran Anda tidak memiliki hak akses untuk mengubah data master unit, angkatan, kelas, guru, atau siswa."
      />
    );
  }

  const runAction = async (fn: () => Promise<void>, okMessage: string) => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await fn();
      setSuccessMsg(okMessage);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Operasi gagal diproses.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmPermanentDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permDeleteTarget) return;
    await runAction(async () => {
      await permanentDeleteMasterDoc(
        permDeleteTarget.collection,
        permDeleteTarget.id,
        permDeleteReason,
        profile,
        permDeleteContext
      );
      setPermDeleteTarget(null);
      setPermDeleteReason('');
    }, `Dokumen ${permDeleteTarget.label} dihapus permanen dan dicatat di Audit Trail.`);
  };

  const openPermanentDeletePrompt = (collection: string, id: string, label: string) => {
    setErrorMsg(null);
    const check = checkPermanentDeleteEligibility(collection, id, permDeleteContext);
    if (!check.allowed) {
      setErrorMsg(check.reason || 'Dokumen masih memiliki relasi historis. Gunakan Arsipkan.');
      return;
    }
    setPermDeleteTarget({ collection, id, label });
    setPermDeleteReason('');
  };

  const handleExportStudentsXlsx = () => {
    const rows = filteredStudents.map((s) => ({
      NIS: s.nis,
      NISN: s.nisn || '',
      Nama: s.full_name || s.name,
      Jenis_Kelamin: s.gender,
      Jenjang: normalizeEducationLevel(s.unitCode),
      Angkatan: cohorts.find((c) => c.id === s.cohort_id)?.cohortName || s.admission_year || '',
      Kelas: s.className,
      Telepon: s.phone || '',
      Alamat: s.address || '',
      Status: s.status || 'ACTIVE',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DATA_SISWA');
    triggerFileDownload(wb, `SIAKHLAK_DATA_SISWA_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setSuccessMsg('Data peserta didik berhasil diekspor ke file Excel.');
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const renderLifecycleActions = (
    collection: string,
    id: string,
    label: string,
    status: LifecycleStatus | undefined
  ) => {
    const isArchived = status === 'ARCHIVED';
    return (
      <div className="inline-flex items-center gap-2 shrink-0">
        {isArchived ? (
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              runAction(
                () => restoreMasterDoc(collection, id, profile),
                `${label} berhasil dipulihkan menjadi ACTIVE.`
              )
            }
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-900 font-medium cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restore</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              runAction(
                () => archiveMasterDoc(collection, id, profile),
                `${label} berhasil diarsipkan (data historis tetap aman).`
              )
            }
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-900 font-medium cursor-pointer"
          >
            <Archive className="w-3 h-3" />
            <span>Arsipkan</span>
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => openPermanentDeletePrompt(collection, id, label)}
          title="Hapus Permanen (Ditolak jika memiliki relasi historis)"
          className="text-slate-400 hover:text-red-700 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  const visibleTabs = isTeacher
    ? SUBMENU_TABS.filter((t) => t.key === 'data_kelas' || t.key === 'data_siswa')
    : SUBMENU_TABS;

  const currentActivePeriod = periods.find((p) => p.isActive);
  const currentTabLabel = visibleTabs.find((t) => t.key === tab)?.label || tab;

  return (
    <div className="space-y-6">
      <FoundationReportHeader
        reportTitle="Data Master & Manajemen Peserta Didik"
        subtitle={`Submenu: ${currentTabLabel}`}
        periodLabel={
          currentActivePeriod
            ? `${currentActivePeriod.year} (${currentActivePeriod.semester})`
            : undefined
        }
        unitLabel="TK · SD · SMP · SMA · SMK"
      />

      <SectionHeader
        title="Data Master & Manajemen Peserta Didik"
        subtitle="Pengelolaan terpusat 5 jenjang pendidikan (TK, SD, SMP, SMA, SMK), angkatan, tahun ajaran, semester, kelas, kenaikan kelas, siswa, guru, wali, komite, admin, dan audit trail."
        action={
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Cetak / Export PDF
          </button>
        }
      />

      {/* Submenu Navigation */}
      <div className="no-print flex flex-wrap gap-1.5 p-2 bg-slate-100 rounded-lg border border-slate-200">
        {visibleTabs.map((item) => {
          const isUsersTab = item.key === 'manajemen_user';
          const badge = isUsersTab && pendingUsers.length > 0 ? ` (${pendingUsers.length} PENDING)` : '';
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleSelectTab(item.key)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                tab === item.key
                  ? 'bg-emerald-900 text-white shadow-xs'
                  : isUsersTab && pendingUsers.length > 0
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'text-slate-700 hover:bg-white hover:text-slate-900'
              }`}
            >
              {item.label}
              {badge}
            </button>
          );
        })}
      </div>

      {/* Template & Import Excel Master Toolbar */}
      <div className="no-print p-3.5 bg-gradient-to-r from-emerald-900 to-emerald-950 rounded-lg text-white shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-200">
                Pusat Template &amp; Import Excel SIAKHLAK
              </h3>
            </div>
            <p className="text-[11px] text-emerald-100/80 mt-0.5">
              Unduh template resmi 31 Indikator &amp; Master Data serta unggah data massal tervalidasi.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadStudentParentTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 border border-emerald-600 rounded-md text-xs font-medium text-white cursor-pointer shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-emerald-300" />
              <span>Template Siswa &amp; Orang Tua (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadTeacherAssignmentTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 border border-emerald-600 rounded-md text-xs font-medium text-white cursor-pointer shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-emerald-300" />
              <span>Template Guru &amp; Wali Kelas (.xlsx)</span>
            </button>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 rounded-md text-xs font-medium text-white cursor-pointer shadow-xs transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>Import Data Siswa</span>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleStudentParentFileChange}
              />
            </label>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 rounded-md text-xs font-medium text-white cursor-pointer shadow-xs transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>Import Data Guru</span>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleTeacherFileChange}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Preview Modal / Panel: Student & Parent Import */}
      {importModalType === 'student_parent' && studentParentImportResult && (
        <Panel
          title={`Preview Import Excel: Data Siswa & Orang Tua (${studentParentImportResult.fileName})`}
          meta={`${studentParentImportResult.totalRows} baris terdeteksi · ${studentParentImportResult.validRows} valid · ${studentParentImportResult.invalidRows} perlu koreksi`}
          action={
            <button
              type="button"
              onClick={() => {
                setImportModalType('none');
                setStudentParentImportResult(null);
              }}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          }
        >
          <div className="space-y-3 text-xs">
            {studentParentImportResult.globalErrors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-md text-red-800 space-y-1">
                {studentParentImportResult.globalErrors.map((err, i) => (
                  <p key={i}>• {err}</p>
                ))}
              </div>
            )}

            {studentParentImportResult.globalWarnings.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-md text-amber-800 space-y-1">
                {studentParentImportResult.globalWarnings.map((w, i) => (
                  <p key={i}>• {w}</p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <span className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded-md text-slate-700 font-medium">
                Total Baris: {studentParentImportResult.totalRows}
              </span>
              <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-300 rounded-md text-emerald-800 font-medium">
                Baris Valid: {studentParentImportResult.validRows}
              </span>
              {studentParentImportResult.invalidRows > 0 && (
                <span className="px-2.5 py-1 bg-red-50 border border-red-300 rounded-md text-red-800 font-medium">
                  Perlu Koreksi: {studentParentImportResult.invalidRows}
                </span>
              )}
              <span className="px-2.5 py-1 bg-blue-50 border border-blue-300 rounded-md text-blue-800 font-medium">
                Siswa Unik: {studentParentImportResult.uniqueStudentsCount}
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-md">
              <table className="w-full text-left divide-y divide-slate-200">
                <thead className="bg-slate-50 sticky top-0 text-[11px] font-semibold text-slate-700">
                  <tr>
                    <th className="px-2.5 py-2">Baris</th>
                    <th className="px-2.5 py-2">NIS</th>
                    <th className="px-2.5 py-2">Nama Siswa</th>
                    <th className="px-2.5 py-2">JK</th>
                    <th className="px-2.5 py-2">Jenjang</th>
                    <th className="px-2.5 py-2">Kelas</th>
                    <th className="px-2.5 py-2">Orang Tua / Wali</th>
                    <th className="px-2.5 py-2">Hubungan</th>
                    <th className="px-2.5 py-2">Status Validasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {studentParentImportResult.rows.map((row) => (
                    <tr
                      key={row.rowNumber}
                      className={row.isValid ? 'hover:bg-slate-50' : 'bg-red-50/50'}
                    >
                      <td className="px-2.5 py-2 font-mono text-slate-500">{row.rowNumber}</td>
                      <td className="px-2.5 py-2 font-mono font-medium">{row.nis}</td>
                      <td className="px-2.5 py-2">{row.namaSiswa}</td>
                      <td className="px-2.5 py-2">{row.jenisKelamin}</td>
                      <td className="px-2.5 py-2 font-semibold">{row.jenjang}</td>
                      <td className="px-2.5 py-2">{row.kodeKelas || '-'}</td>
                      <td className="px-2.5 py-2">{row.namaOrangTua}</td>
                      <td className="px-2.5 py-2 capitalize">{row.hubungan}</td>
                      <td className="px-2.5 py-2">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Valid</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{row.errors.join('; ')}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-slate-500 text-[11px]">
                Import Master Data Siswa &amp; Orang Tua menjaga integritas data tanpa menimpa data historis.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setImportModalType('none');
                    setStudentParentImportResult(null);
                  }}
                  className="px-3 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                >
                  Tutup Preview
                </button>
                <button
                  type="button"
                  disabled={studentParentImportResult.validRows === 0}
                  onClick={() => {
                    setSuccessMsg(
                      `Pratinjau validasi ${studentParentImportResult.validRows} data siswa & orang tua berhasil diverifikasi. Mode pengujian lokal aktif tanpa penulisan ke database produksi.`
                    );
                    setImportModalType('none');
                    setTimeout(() => setSuccessMsg(null), 6000);
                  }}
                  className="px-4 py-1.5 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium disabled:opacity-50 cursor-pointer"
                >
                  Verifikasi &amp; Simpan ({studentParentImportResult.validRows} Data)
                </button>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Preview Modal / Panel: Teacher & Assignment Import */}
      {importModalType === 'teacher_assignment' && teacherImportResult && (
        <Panel
          title={`Preview Import Excel: Data Guru & Penugasan (${teacherImportResult.fileName})`}
          meta={`${teacherImportResult.totalRows} baris terdeteksi · ${teacherImportResult.validRows} valid · ${teacherImportResult.invalidRows} perlu koreksi`}
          action={
            <button
              type="button"
              onClick={() => {
                setImportModalType('none');
                setTeacherImportResult(null);
              }}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          }
        >
          <div className="space-y-3 text-xs">
            {teacherImportResult.globalErrors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-md text-red-800 space-y-1">
                {teacherImportResult.globalErrors.map((err, i) => (
                  <p key={i}>• {err}</p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <span className="px-2.5 py-1 bg-slate-100 border border-slate-300 rounded-md text-slate-700 font-medium">
                Total Baris: {teacherImportResult.totalRows}
              </span>
              <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-300 rounded-md text-emerald-800 font-medium">
                Baris Valid: {teacherImportResult.validRows}
              </span>
              {teacherImportResult.invalidRows > 0 && (
                <span className="px-2.5 py-1 bg-red-50 border border-red-300 rounded-md text-red-800 font-medium">
                  Perlu Koreksi: {teacherImportResult.invalidRows}
                </span>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-md">
              <table className="w-full text-left divide-y divide-slate-200">
                <thead className="bg-slate-50 sticky top-0 text-[11px] font-semibold text-slate-700">
                  <tr>
                    <th className="px-2.5 py-2">Baris</th>
                    <th className="px-2.5 py-2">Kode</th>
                    <th className="px-2.5 py-2">Nama Guru</th>
                    <th className="px-2.5 py-2">Email</th>
                    <th className="px-2.5 py-2">Jenjang</th>
                    <th className="px-2.5 py-2">Kelas</th>
                    <th className="px-2.5 py-2">Penugasan</th>
                    <th className="px-2.5 py-2">Mata Pelajaran</th>
                    <th className="px-2.5 py-2">Status Validasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {teacherImportResult.rows.map((row) => (
                    <tr
                      key={row.rowNumber}
                      className={row.isValid ? 'hover:bg-slate-50' : 'bg-red-50/50'}
                    >
                      <td className="px-2.5 py-2 font-mono text-slate-500">{row.rowNumber}</td>
                      <td className="px-2.5 py-2 font-mono font-medium">{row.kodeGuru || '-'}</td>
                      <td className="px-2.5 py-2">{row.namaGuru}</td>
                      <td className="px-2.5 py-2 font-mono">{row.emailGuru}</td>
                      <td className="px-2.5 py-2 font-semibold">{row.jenjang}</td>
                      <td className="px-2.5 py-2">{row.kodeKelas || '-'}</td>
                      <td className="px-2.5 py-2 font-medium">{row.jenisPenugasan}</td>
                      <td className="px-2.5 py-2">{row.mataPelajaran || '-'}</td>
                      <td className="px-2.5 py-2">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Valid</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{row.errors.join('; ')}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-slate-500 text-[11px]">
                Validasi penugasan guru menjamin kesesuaian jenjang pendidikan dan peran wali kelas.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setImportModalType('none');
                    setTeacherImportResult(null);
                  }}
                  className="px-3 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                >
                  Tutup Preview
                </button>
                <button
                  type="button"
                  disabled={teacherImportResult.validRows === 0}
                  onClick={() => {
                    setSuccessMsg(
                      `Pratinjau validasi ${teacherImportResult.validRows} data guru & penugasan berhasil diverifikasi. Mode pengujian lokal aktif tanpa penulisan ke database produksi.`
                    );
                    setImportModalType('none');
                    setTimeout(() => setSuccessMsg(null), 6000);
                  }}
                  className="px-4 py-1.5 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium disabled:opacity-50 cursor-pointer"
                >
                  Verifikasi &amp; Simpan ({teacherImportResult.validRows} Data)
                </button>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {errorMsg && (
        <div className="p-3 border border-red-300 bg-red-50 rounded-md text-xs text-red-800">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-3 border border-emerald-300 bg-emerald-50 rounded-md text-xs text-emerald-900">
          {successMsg}
        </div>
      )}

      {/* Guarded Permanent Delete Modal */}
      {permDeleteTarget && (
        <Panel
          title={`Konfirmasi Hapus Permanen: ${permDeleteTarget.label}`}
          meta="Anti-Cascade Guard aktif — wajib mencantumkan alasan resmi untuk Audit Trail"
        >
          <form onSubmit={handleConfirmPermanentDelete} className="space-y-3 text-xs">
            <p className="text-red-800">
              Dokumen <span className="font-mono">{permDeleteTarget.collection}/{permDeleteTarget.id}</span> tidak memiliki relasi historis aktif. Tindakan hapus permanen tidak dapat dibatalkan.
            </p>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Alasan Resmi Penghapusan (min. 5 karakter) *
              </label>
              <input
                type="text"
                required
                minLength={5}
                value={permDeleteReason}
                onChange={(e) => setPermDeleteReason(e.target.value)}
                placeholder="Contoh: Duplikasi entri salah ketik sebelum ada transaksi penilaian"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-red-700 hover:bg-red-800 text-white font-medium cursor-pointer"
              >
                {saving ? 'Menghapus...' : 'Konfirmasi Hapus Permanen'}
              </button>
              <button
                type="button"
                onClick={() => setPermDeleteTarget(null)}
                className="px-4 py-2 rounded-md border border-slate-300 bg-white text-slate-700 font-medium cursor-pointer"
              >
                Batal
              </button>
            </div>
          </form>
        </Panel>
      )}

      {/* 1. UNIT PENDIDIKAN */}
      {tab === 'unit_pendidikan' && isYayasan && (
        <div className="space-y-6">
          <Panel title="Simpan / Perbarui Unit Pendidikan (5 Jenjang Resmi)">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(async () => {
                  await saveEducationUnit(
                    {
                      unitId: uUnitId.trim() || undefined,
                      code: uCode,
                      name: uName,
                      headName: uHead,
                      address: uAddress,
                      phone: uPhone,
                      studentCount: uStudents,
                      teacherCount: uTeachers,
                      classCount: uClasses,
                      religiousProgramNote: uNote,
                      status: 'ACTIVE',
                    },
                    profile
                  );
                  setUUnitId('');
                  setUName('');
                  setUHead('');
                  setUAddress('');
                  setUPhone('');
                  setUNote('');
                }, `Unit Pendidikan ${uUnitId || uCode} berhasil disimpan.`);
              }}
              className="space-y-3 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jenjang Resmi *</label>
                  <select
                    value={uCode}
                    onChange={(e) => {
                      const next = e.target.value as EducationLevel;
                      setUCode(next);
                      setUUnitId(next === 'TK' ? 'TK' : '');
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    {EDUCATION_LEVELS.map((u) => (
                      <option key={u} value={u}>
                        {u} — {EDUCATION_LEVEL_LABELS[u]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    ID Unit {uCode === 'TK' ? '(KB / TK)' : '(Opsional)'}
                  </label>
                  <input
                    type="text"
                    value={uUnitId}
                    onChange={(e) => setUUnitId(e.target.value.toUpperCase())}
                    placeholder={uCode === 'TK' ? 'KB atau TK' : uCode}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nama Satuan Pendidikan *</label>
                  <input
                    type="text"
                    required
                    value={uName}
                    onChange={(e) => setUName(e.target.value)}
                    placeholder="Contoh: KB / TK Islam Al-Chasanah"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Kepala Sekolah / Unit *</label>
                  <input
                    type="text"
                    required
                    value={uHead}
                    onChange={(e) => setUHead(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Alamat Unit</label>
                  <input
                    type="text"
                    value={uAddress}
                    onChange={(e) => setUAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Telepon</label>
                  <input
                    type="text"
                    value={uPhone}
                    onChange={(e) => setUPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Target Siswa / Guru</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="number"
                      min={0}
                      value={uStudents}
                      onChange={(e) => setUStudents(Number(e.target.value))}
                      title="Jumlah Siswa"
                      className="w-full px-2 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    />
                    <input
                      type="number"
                      min={0}
                      value={uTeachers}
                      onChange={(e) => setUTeachers(Number(e.target.value))}
                      title="Jumlah Guru"
                      className="w-full px-2 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jumlah Kelas</label>
                  <input
                    type="number"
                    min={0}
                    value={uClasses}
                    onChange={(e) => setUClasses(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Catatan Pembinaan Keagamaan</label>
                <input
                  type="text"
                  value={uNote}
                  onChange={(e) => setUNote(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan Data Unit'}
              </button>
            </form>
          </Panel>

          <Panel title="Daftar Unit Pendidikan Terdaftar" meta={`${units.length} unit`}>
            {units.length === 0 ? (
              <EmptyState
                title="Belum Ada Data Unit Pendidikan"
                description="Tambahkan data profil resmi untuk jenjang TK, SD, SMP, SMA, dan SMK pada formulir di atas."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3 font-medium">Jenjang</th>
                      <th className="py-2 px-3 font-medium">Nama Lembaga</th>
                      <th className="py-2 px-3 font-medium">Kepala Unit</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                      <th className="py-2 px-3 font-medium text-right">Siswa / Guru / Kelas</th>
                      <th className="py-2 pl-3 font-medium text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {units.map((u) => {
                      const lvl = normalizeEducationLevel(u.code);
                      return (
                        <tr key={u.id}>
                          <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">
                            {lvl} {u.id !== lvl ? `(${u.id})` : ''}
                          </td>
                          <td className="py-2.5 px-3 text-slate-800">{u.name}</td>
                          <td className="py-2.5 px-3 text-slate-600">{u.headName}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">
                            {u.status || 'ACTIVE'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {u.studentCount} / {u.teacherCount} / {u.classCount}
                          </td>
                          <td className="py-2.5 pl-3 text-right">
                            {renderLifecycleActions('units', u.id, `${lvl} ${u.name}`, u.status)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* 2. DATA ANGKATAN (COHORTS) */}
      {tab === 'data_angkatan' && isYayasan && (
        <div className="space-y-6">
          <Panel title={cohEditId ? 'Edit Data Angkatan' : 'Tambah Data Angkatan Baru'}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(async () => {
                  if (cohEditId) {
                    await updateCohort(
                      cohEditId,
                      {
                        cohortName: cohName,
                        educationLevel: cohLevel,
                        educationUnitId: cohLevel,
                        admissionYear: cohAdmitYear,
                        graduationYear: cohGradYear,
                        status: cohStatus,
                        notes: cohNotes,
                      },
                      profile
                    );
                  } else {
                    await createCohort(
                      {
                        cohortName: cohName,
                        educationUnitId: cohLevel,
                        educationLevel: cohLevel,
                        admissionYear: cohAdmitYear,
                        graduationYear: cohGradYear,
                        status: cohStatus,
                        notes: cohNotes,
                      },
                      profile
                    );
                  }
                  setCohEditId(null);
                  setCohName('');
                  setCohGradYear('');
                  setCohNotes('');
                }, cohEditId ? 'Data Angkatan diperbarui.' : 'Data Angkatan baru ditambahkan.');
              }}
              className="grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs items-end"
            >
              <div>
                <label className="block font-medium text-slate-700 mb-1">Jenjang *</label>
                <select
                  value={cohLevel}
                  onChange={(e) => setCohLevel(e.target.value as EducationLevel)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                >
                  {EDUCATION_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l} — {EDUCATION_LEVEL_LABELS[l]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nama Angkatan *</label>
                <input
                  type="text"
                  required
                  value={cohName}
                  onChange={(e) => setCohName(e.target.value)}
                  placeholder="Angkatan 2026"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tahun Masuk *</label>
                <input
                  type="text"
                  required
                  value={cohAdmitYear}
                  onChange={(e) => setCohAdmitYear(e.target.value)}
                  placeholder="2026"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Target Lulus</label>
                <input
                  type="text"
                  value={cohGradYear}
                  onChange={(e) => setCohGradYear(e.target.value)}
                  placeholder="2029"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={cohStatus}
                  onChange={(e) =>
                    setCohStatus(e.target.value as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED')
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-3 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
                >
                  {cohEditId ? 'Simpan' : 'Tambah'}
                </button>
                {cohEditId && (
                  <button
                    type="button"
                    onClick={() => {
                      setCohEditId(null);
                      setCohName('');
                    }}
                    className="px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-700 cursor-pointer"
                  >
                    Batal
                  </button>
                )}
              </div>
            </form>
          </Panel>

          <Panel
            title="Daftar Angkatan (Cohorts)"
            action={
              <select
                value={cohFilterLevel}
                onChange={(e) => setCohFilterLevel(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
              >
                <option value="ALL">Semua Jenjang</option>
                {EDUCATION_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            }
          >
            {cohorts.filter((c) => matchesEducationLevel(c.educationLevel, cohFilterLevel)).length ===
            0 ? (
              <EmptyState
                title="Belum Ada Data Angkatan"
                description="Tambahkan angkatan siswa per jenjang agar riwayat angkatan tetap permanen saat kenaikan kelas."
              />
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {cohorts
                  .filter((c) => matchesEducationLevel(c.educationLevel, cohFilterLevel))
                  .map((c) => (
                    <div key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {c.educationLevel} · {c.cohortName}
                        </p>
                        <p className="font-mono text-slate-500">
                          Masuk: {c.admissionYear}
                          {c.graduationYear ? ` · Target Lulus: ${c.graduationYear}` : ''} · Status:{' '}
                          {c.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCohEditId(c.id);
                            setCohName(c.cohortName);
                            setCohLevel(normalizeEducationLevel(c.educationLevel));
                            setCohAdmitYear(c.admissionYear);
                            setCohGradYear(c.graduationYear || '');
                            setCohStatus(c.status);
                            setCohNotes(c.notes || '');
                          }}
                          className="text-slate-600 hover:text-emerald-800 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {renderLifecycleActions('cohorts', c.id, c.cohortName, c.status)}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* 3. TAHUN AJARAN */}
      {tab === 'tahun_ajaran' && isYayasan && (
        <div className="space-y-6">
          <Panel title="Tambah Tahun Ajaran">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(async () => {
                  await createAcademicYear(
                    { yearName: ayName, startDate: ayStart, endDate: ayEnd, isActive: ayActive },
                    profile
                  );
                  setAyName('');
                  setAyStart('');
                  setAyEnd('');
                }, 'Tahun Ajaran berhasil ditambahkan.');
              }}
              className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs items-end"
            >
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tahun Ajaran *</label>
                <input
                  type="text"
                  required
                  value={ayName}
                  onChange={(e) => setAyName(e.target.value)}
                  placeholder="2026/2027"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tanggal Mulai</label>
                <input
                  type="date"
                  value={ayStart}
                  onChange={(e) => setAyStart(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tanggal Selesai</label>
                <input
                  type="date"
                  value={ayEnd}
                  onChange={(e) => setAyEnd(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>
              <label className="flex items-center gap-2 text-slate-700 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ayActive}
                  onChange={(e) => setAyActive(e.target.checked)}
                />
                <span>Aktifkan Tahun Ajaran</span>
              </label>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
              >
                Tambah
              </button>
            </form>
          </Panel>

          <Panel title="Daftar Tahun Ajaran">
            {academicYears.length === 0 ? (
              <EmptyState
                title="Belum Ada Tahun Ajaran"
                description="Tambahkan tahun ajaran resmi Yayasan (misal 2026/2027) sebelum membuat semester."
              />
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {academicYears.map((ay) => (
                  <div key={ay.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 font-mono">{ay.yearName}</p>
                      <p className="text-slate-500">
                        {ay.startDate || '-'} s.d. {ay.endDate || '-'} ·{' '}
                        {ay.isActive ? 'Tahun Ajaran Aktif' : 'Nonaktif'} · {ay.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            () => toggleAcademicYearActive(ay.id, !ay.isActive, profile),
                            'Status Tahun Ajaran diperbarui.'
                          )
                        }
                        className="text-emerald-800 font-medium hover:underline cursor-pointer"
                      >
                        {ay.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      {renderLifecycleActions('academic_years', ay.id, ay.yearName, ay.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* 4. SEMESTER (SYNCED WITH academicPeriods) */}
      {tab === 'semester' && isYayasan && (
        <div className="space-y-6">
          <Panel
            title="Tambah Semester / Periode Akademik"
            meta="Tersinkronisasi otomatis ke koleksi semesters & academicPeriods"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const ay = academicYears.find((y) => y.id === semYearId) || academicYears[0];
                const yName = ay?.yearName || '2026/2027';
                const computedName = semName.trim() || `${yName} - ${semTerm}`;
                runAction(async () => {
                  await createSemester(
                    {
                      academicYearId: ay?.id || 'MANUAL',
                      yearName: yName,
                      semester: semTerm,
                      name: computedName,
                      isActive: semActive,
                    },
                    profile
                  );
                  setSemName('');
                }, `Semester ${computedName} berhasil ditambahkan.`);
              }}
              className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs items-end"
            >
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tahun Ajaran</label>
                <select
                  value={semYearId || academicYears[0]?.id || ''}
                  onChange={(e) => setSemYearId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                >
                  <option value="">-- Tahun Ajaran --</option>
                  {academicYears.map((ay) => (
                    <option key={ay.id} value={ay.id}>
                      {ay.yearName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Semester *</label>
                <select
                  value={semTerm}
                  onChange={(e) => setSemTerm(e.target.value as 'Ganjil' | 'Genap')}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                >
                  <option value="Ganjil">Ganjil</option>
                  <option value="Genap">Genap</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Label Periode (Opsional)</label>
                <input
                  type="text"
                  value={semName}
                  onChange={(e) => setSemName(e.target.value)}
                  placeholder="2026/2027 - Ganjil"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <label className="flex items-center gap-2 text-slate-700 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={semActive}
                  onChange={(e) => setSemActive(e.target.checked)}
                />
                <span>Periode Aktif</span>
              </label>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
              >
                Tambah
              </button>
            </form>
          </Panel>

          <Panel title="Daftar Semester & Periode Akademik" meta={`${periods.length} periode`}>
            {periods.length === 0 && semesters.length === 0 ? (
              <EmptyState
                title="Belum Ada Semester / Periode"
                description="Tambahkan semester agar guru dapat menginput penilaian dan monitoring lintas periode aktif."
              />
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {periods.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <p className="text-slate-500 font-mono">
                        Tahun {p.year} · Semester {p.semester} ·{' '}
                        {p.isActive ? 'Periode Aktif' : 'Terkunci'} · {p.status || 'ACTIVE'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            () => toggleAcademicPeriodActive(p.id, !p.isActive),
                            'Status periode diperbarui.'
                          )
                        }
                        className="text-emerald-800 font-medium hover:underline cursor-pointer"
                      >
                        {p.isActive ? 'Kunci Periode' : 'Aktifkan'}
                      </button>
                      {renderLifecycleActions('academicPeriods', p.id, p.name, p.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* 5. DATA KELAS & KENAIKAN KELAS */}
      {tab === 'data_kelas' && (
        <div className="space-y-6">
          {isYayasan && (
            <Panel title={cEditId ? 'Edit Data Kelas' : 'Tambah Kelas / Rombongan Belajar'}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const chosenTeacher = users.find((u) => u.uid === cHomeroomUid);
                  const teacherName = chosenTeacher?.full_name || cHomeroom || '-';
                  const chosenUnitId = (cEducationUnitId || cUnit).trim().toUpperCase();
                  const chosenUnitObj = units.find(
                    (u) => u.id.toUpperCase() === chosenUnitId
                  );
                  const chosenUnitName =
                    chosenUnitObj?.name ||
                    (chosenUnitId === 'KB'
                      ? 'Kelompok Bermain (KB)'
                      : chosenUnitId === 'TK'
                      ? 'Taman Kanak-Kanak (TK)'
                      : undefined);
                  runAction(async () => {
                    if (cEditId) {
                      await updateSchoolClass(
                        cEditId,
                        {
                          unitCode: cUnit,
                          educationUnitId: chosenUnitId,
                          educationUnitName: chosenUnitName,
                          name: cName,
                          level: cLevel,
                          cohortId: cCohortId,
                          academicYearId: cYearId,
                          semesterId: cSemId,
                          homeroomTeacherUid: cHomeroomUid,
                          homeroomTeacherName: teacherName,
                          studentCount: cCount,
                        },
                        profile
                      );
                    } else {
                      await createSchoolClass(
                        {
                          unitCode: cUnit,
                          educationUnitId: chosenUnitId,
                          educationUnitName: chosenUnitName,
                          name: cName,
                          level: cLevel,
                          cohortId: cCohortId,
                          academicYearId: cYearId,
                          semesterId: cSemId,
                          homeroomTeacherUid: cHomeroomUid,
                          homeroomTeacherName: teacherName,
                          studentCount: cCount,
                        },
                        profile
                      );
                    }
                    setCEditId(null);
                    setCEducationUnitId('');
                    setCName('');
                    setCLevel('');
                    setCHomeroom('');
                  }, cEditId ? 'Kelas diperbarui.' : 'Kelas baru berhasil dibuat.');
                }}
                className="space-y-3 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Jenjang *</label>
                    <select
                      value={cUnit}
                      onChange={(e) => {
                        const next = e.target.value as EducationLevel;
                        setCUnit(next);
                        setCEducationUnitId(next);
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    >
                      {EDUCATION_LEVELS.map((u) => (
                        <option key={u} value={u}>
                          {u} — {EDUCATION_LEVEL_LABELS[u]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Unit Pendidikan {cUnit === 'TK' ? '(KB / TK)' : '(Unit ID)'}
                    </label>
                    <select
                      value={cEducationUnitId || cUnit}
                      onChange={(e) => setCEducationUnitId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    >
                      {cUnit === 'TK' ? (
                        <>
                          <option value="TK">TK — Taman Kanak-Kanak</option>
                          <option value="KB">KB — Kelompok Bermain</option>
                          {units
                            .filter(
                              (u) =>
                                matchesEducationLevel(u.code, 'TK') &&
                                u.id !== 'TK' &&
                                u.id !== 'KB'
                            )
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.id} — {u.name}
                              </option>
                            ))}
                        </>
                      ) : (
                        <>
                          <option value={cUnit}>{cUnit}</option>
                          {units
                            .filter(
                              (u) => matchesEducationLevel(u.code, cUnit) && u.id !== cUnit
                            )
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.id} — {u.name}
                              </option>
                            ))}
                        </>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Nama Kelas *</label>
                    <input
                      type="text"
                      required
                      value={cName}
                      onChange={(e) => setCName(e.target.value)}
                      placeholder="Contoh: 7A / X-RPL"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tingkat *</label>
                    <input
                      type="text"
                      required
                      value={cLevel}
                      onChange={(e) => setCLevel(e.target.value)}
                      placeholder="Contoh: VII / 10"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Angkatan (Opsional)</label>
                    <select
                      value={cCohortId}
                      onChange={(e) => setCCohortId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    >
                      <option value="">-- Pilih Angkatan --</option>
                      {cohorts
                        .filter((c) => matchesEducationLevel(c.educationLevel, cUnit))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.cohortName} ({c.admissionYear})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tahun Ajaran</label>
                    <select
                      value={cYearId}
                      onChange={(e) => setCYearId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    >
                      <option value="">-- Tahun Ajaran --</option>
                      {academicYears.map((ay) => (
                        <option key={ay.id} value={ay.id}>
                          {ay.yearName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Semester</label>
                    <select
                      value={cSemId}
                      onChange={(e) => setCSemId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    >
                      <option value="">-- Semester --</option>
                      {periods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Wali Kelas *</label>
                    <input
                      type="text"
                      required
                      value={cHomeroom}
                      onChange={(e) => setCHomeroom(e.target.value)}
                      placeholder="Nama Wali Kelas"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
                    >
                      {cEditId ? 'Simpan Perubahan' : 'Tambah Kelas'}
                    </button>
                    {cEditId && (
                      <button
                        type="button"
                        onClick={() => setCEditId(null)}
                        className="px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-700 cursor-pointer"
                      >
                        Batal
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </Panel>
          )}

          <Panel title="Daftar Kelas Terdaftar" meta={`${classes.length} kelas`}>
            {classes.length === 0 ? (
              <EmptyState
                title="Belum Ada Data Kelas"
                description="Admin Yayasan dapat menambahkan rombongan belajar untuk jenjang TK, SD, SMP, SMA, dan SMK."
              />
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {classes.map((c) => {
                  const lvl = normalizeEducationLevel(c.unitCode);
                  const yearLabel =
                    academicYears.find((y) => y.id === c.academicYearId)?.yearName ||
                    c.academicYearId ||
                    '-';
                  return (
                    <div key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {lvl}
                          {c.educationUnitId && c.educationUnitId !== lvl
                            ? ` (${c.educationUnitId})`
                            : ''}{' '}
                          — {c.name} (Tingkat {c.level})
                        </p>
                        <p className="text-slate-500 font-mono">
                          TA: {yearLabel} · Wali: {c.homeroomTeacherName || '-'} · Status:{' '}
                          {c.status || 'ACTIVE'} · ID: {c.id}
                        </p>
                      </div>
                      {isYayasan && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCEditId(c.id);
                              setCUnit(lvl);
                              setCEducationUnitId(c.educationUnitId || lvl);
                              setCName(c.name);
                              setCLevel(c.level);
                              setCCohortId(c.cohortId || '');
                              setCYearId(c.academicYearId || '');
                              setCSemId(c.semesterId || '');
                              setCHomeroomUid(c.homeroomTeacherUid || '');
                              setCHomeroom(c.homeroomTeacherName);
                              setCCount(c.studentCount);
                            }}
                            className="text-slate-600 hover:text-emerald-800 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {renderLifecycleActions('classes', c.id, `${lvl} ${c.name}`, c.status)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Student Promotion / Kenaikan Kelas Workflow */}
          {isYayasan && (
            <Panel
              title="Penempatan & Kenaikan Kelas Siswa (Anti-Cascade History)"
              meta="Memperbarui kelas aktif siswa, mencatat riwayat class_student_history, dan menjaga angkatan serta nilai historis tetap utuh"
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const stu = students.find((s) => s.id === promoStudentId);
                  const cls = classes.find((c) => c.id === promoTargetClassId);
                  if (!stu || !cls) {
                    setErrorMsg('Pilih siswa dan kelas tujuan terlebih dahulu.');
                    return;
                  }
                  runAction(async () => {
                    await promoteOrMoveStudent({
                      student: stu,
                      targetClass: cls,
                      academicYearId: promoYearId || cls.academicYearId || '',
                      semesterId: promoSemId || cls.semesterId || '',
                      movementType: promoType,
                      notes: promoNotes,
                      actor: profile,
                    });
                    setPromoStudentId('');
                    setPromoTargetClassId('');
                    setPromoNotes('');
                  }, `Siswa ${stu.name} berhasil dipindahkan ke ${cls.unitCode} ${cls.name}. Angkatan dan riwayat penilaian sebelumnya tetap utuh.`);
                }}
                className="grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs items-end"
              >
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Siswa *</label>
                  <select
                    required
                    value={promoStudentId}
                    onChange={(e) => setPromoStudentId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="">-- Pilih Siswa --</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nis} — {s.name} ({normalizeEducationLevel(s.unitCode)} · {s.className})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Kelas Tujuan *</label>
                  <select
                    required
                    value={promoTargetClassId}
                    onChange={(e) => setPromoTargetClassId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="">-- Pilih Kelas --</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {normalizeEducationLevel(c.unitCode)} · {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jenis Perpindahan</label>
                  <select
                    value={promoType}
                    onChange={(e) =>
                      setPromoType(e.target.value as 'ENROLLMENT' | 'PROMOTION' | 'TRANSFER')
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="PROMOTION">Kenaikan Kelas</option>
                    <option value="ENROLLMENT">Penempatan Awal</option>
                    <option value="TRANSFER">Pindah Rombel / Jenjang</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Catatan</label>
                  <input
                    type="text"
                    value={promoNotes}
                    onChange={(e) => setPromoNotes(e.target.value)}
                    placeholder="Kenaikan kelas TP 2026/2027"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Proses</span>
                </button>
              </form>

              {classHistory.length > 0 && (
                <div className="mt-5 overflow-x-auto border-t border-slate-200 pt-4">
                  <p className="text-xs font-semibold text-slate-800 mb-2">
                    Riwayat Penempatan &amp; Kenaikan Kelas ({classHistory.length} entri)
                  </p>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-1.5 pr-3 font-medium">Waktu</th>
                        <th className="py-1.5 px-3 font-medium">Siswa</th>
                        <th className="py-1.5 px-3 font-medium">Perpindahan</th>
                        <th className="py-1.5 px-3 font-medium">Jenis</th>
                        <th className="py-1.5 pl-3 font-medium">Oleh</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {classHistory.slice(0, 15).map((h) => (
                        <tr key={h.id}>
                          <td className="py-1.5 pr-3 font-mono text-slate-500">
                            {formatTimestamp(h.createdAt)}
                          </td>
                          <td className="py-1.5 px-3 font-medium text-slate-900">
                            {h.studentName} ({h.nis})
                          </td>
                          <td className="py-1.5 px-3 font-mono text-slate-700">
                            {h.fromClassName || '-'} → {h.educationLevel} {h.toClassName}
                          </td>
                          <td className="py-1.5 px-3 font-mono text-slate-600">{h.movementType}</td>
                          <td className="py-1.5 pl-3 text-slate-600">{h.movedByName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </div>
      )}

      {/* 6. DATA SISWA (FULL SECTION 4A + UNIQUENESS + FILTERS + EXPORT) */}
      {tab === 'data_siswa' && (
        <div className="space-y-6">
          <Panel title={sEditId ? 'Edit Profil Siswa' : 'Registrasi Data Master Siswa'}>
            {classes.length === 0 ? (
              <EmptyState
                title="Belum Ada Kelas Terdaftar"
                description="Buat data kelas terlebih dahulu sebelum mendaftarkan siswa."
              />
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const chosenClass = classes.find((c) => c.id === sClassId);
                  if (!chosenClass) {
                    setErrorMsg('Pilih kelas terdaftar untuk siswa.');
                    return;
                  }
                  const effectiveYearId = sAcademicYearId || chosenClass.academicYearId || '';
                  const effectiveUnitId =
                    chosenClass.educationUnitId || normalizeEducationLevel(chosenClass.unitCode);
                  runAction(async () => {
                    if (sEditId) {
                      await updateStudent(
                        sEditId,
                        {
                          nis: sNis,
                          nisn: sNisn,
                          name: sName,
                          birth_place: sBirthPlace,
                          birth_date: sBirthDate,
                          gender: sGender,
                          address: sAddress,
                          phone: sPhone,
                          unitCode: normalizeEducationLevel(chosenClass.unitCode),
                          education_unit_id: effectiveUnitId,
                          cohort_id: sCohortId,
                          admission_year: sAdmitYear,
                          academic_year_id: effectiveYearId,
                          classId: chosenClass.id,
                          className: chosenClass.name,
                          studentUid: sStudentUid || undefined,
                          account_status: sAccountStatus,
                          status: sAccountStatus,
                        },
                        students,
                        profile
                      );
                    } else {
                      await createStudent(
                        {
                          nis: sNis,
                          nisn: sNisn,
                          name: sName,
                          birth_place: sBirthPlace,
                          birth_date: sBirthDate,
                          gender: sGender,
                          address: sAddress,
                          phone: sPhone,
                          unitCode: normalizeEducationLevel(chosenClass.unitCode),
                          education_unit_id: effectiveUnitId,
                          cohort_id: sCohortId,
                          admission_year: sAdmitYear,
                          academic_year_id: effectiveYearId,
                          classId: chosenClass.id,
                          className: chosenClass.name,
                          studentUid: sStudentUid || undefined,
                          account_status: sAccountStatus,
                        },
                        students,
                        profile
                      );
                    }
                    setSEditId(null);
                    setSNis('');
                    setSNisn('');
                    setSName('');
                    setSBirthPlace('');
                    setSBirthDate('');
                    setSAddress('');
                    setSPhone('');
                    setSStudentUid('');
                    setSAccountStatus('ACTIVE');
                  }, sEditId ? 'Profil siswa berhasil diperbarui.' : 'Siswa baru berhasil didaftarkan.');
                }}
                className="space-y-3 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">NIS (Unik) *</label>
                    <input
                      type="text"
                      required
                      value={sNis}
                      onChange={(e) => setSNis(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">NISN (Unik jika diisi)</label>
                    <input
                      type="text"
                      value={sNisn}
                      onChange={(e) => setSNisn(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                    <input
                      type="text"
                      required
                      value={sName}
                      onChange={(e) => setSName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Jenis Kelamin *</label>
                    <select
                      value={sGender}
                      onChange={(e) => setSGender(e.target.value as 'L' | 'P')}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    >
                      <option value="L">Laki-laki (L)</option>
                      <option value="P">Perempuan (P)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Jenjang *</label>
                    <select
                      value={sUnit}
                      onChange={(e) => {
                        setSUnit(e.target.value as EducationLevel);
                        setSClassId('');
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    >
                      {EDUCATION_LEVELS.filter(
                        (u) => isYayasan || profile.assignedUnits.some((au) => matchesEducationLevel(au, u))
                      ).map((u) => (
                        <option key={u} value={u}>
                          {u} — {EDUCATION_LEVEL_LABELS[u]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tahun Ajaran</label>
                    <select
                      value={sAcademicYearId}
                      onChange={(e) => setSAcademicYearId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    >
                      <option value="">-- Otomatis dari Kelas --</option>
                      {academicYears.map((ay) => (
                        <option key={ay.id} value={ay.id}>
                          {ay.yearName} {ay.isActive ? '(Aktif)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Kelas *</label>
                    <select
                      required
                      value={sClassId}
                      onChange={(e) => {
                        const nextClassId = e.target.value;
                        setSClassId(nextClassId);
                        const cls = classes.find((c) => c.id === nextClassId);
                        if (cls?.academicYearId && !sAcademicYearId) {
                          setSAcademicYearId(cls.academicYearId);
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    >
                      <option value="">-- Pilih Kelas --</option>
                      {classes
                        .filter(
                          (c) =>
                            matchesEducationLevel(c.unitCode, sUnit) &&
                            (!sAcademicYearId || !c.academicYearId || c.academicYearId === sAcademicYearId)
                        )
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.educationUnitId && c.educationUnitId !== c.unitCode
                              ? ` (${c.educationUnitId})`
                              : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Angkatan</label>
                    <select
                      value={sCohortId}
                      onChange={(e) => setSCohortId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    >
                      <option value="">-- Pilih Angkatan --</option>
                      {cohorts
                        .filter((c) => matchesEducationLevel(c.educationLevel, sUnit))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.cohortName} ({c.admissionYear})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tahun Masuk</label>
                    <input
                      type="text"
                      value={sAdmitYear}
                      onChange={(e) => setSAdmitYear(e.target.value)}
                      placeholder="2026"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tempat Lahir</label>
                    <input
                      type="text"
                      value={sBirthPlace}
                      onChange={(e) => setSBirthPlace(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tanggal Lahir</label>
                    <input
                      type="date"
                      value={sBirthDate}
                      onChange={(e) => setSBirthDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Akun Siswa (Login UID)</label>
                    {isYayasan && users.length > 0 ? (
                      <select
                        value={sStudentUid}
                        onChange={(e) => setSStudentUid(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                      >
                        <option value="">-- Tautkan Akun Siswa (Opsional) --</option>
                        {users
                          .filter((u) => normalizeRole(u.role) === 'STUDENT')
                          .map((u) => (
                            <option key={u.uid} value={u.uid}>
                              {u.full_name} ({u.email})
                            </option>
                          ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={sAddress}
                        onChange={(e) => setSAddress(e.target.value)}
                        placeholder="Alamat domisili"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Status Akun Siswa</label>
                    <select
                      value={sAccountStatus}
                      onChange={(e) => setSAccountStatus(e.target.value as LifecycleStatus)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="PENDING">PENDING</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
                    >
                      {sEditId ? 'Simpan' : 'Tambah Siswa'}
                    </button>
                    {sEditId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSEditId(null);
                          setSStudentUid('');
                          setSAcademicYearId('');
                        }}
                        className="px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-700 cursor-pointer"
                      >
                        Batal
                      </button>
                    )}
                  </div>
                </div>
              </form>
            )}
          </Panel>

          <Panel
            title="Direktori Peserta Didik"
            meta={`${filteredStudents.length} dari ${students.length} siswa`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadStudentParentTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-600 bg-emerald-50 hover:bg-emerald-100 text-xs font-medium text-emerald-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Unduh Template Siswa (.xlsx)</span>
                </button>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-500 bg-amber-50 hover:bg-amber-100 text-xs font-medium text-amber-800 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-amber-700" />
                  <span>Import Excel</span>
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={handleStudentParentFileChange}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleExportStudentsXlsx}
                  disabled={filteredStudents.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Ekspor Excel</span>
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={stuSearch}
                  onChange={(e) => setStuSearch(e.target.value)}
                  placeholder="Cari NIS / NISN / Nama / Kelas..."
                  className="w-full pl-8 pr-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <select
                value={stuFilterLevel}
                onChange={(e) => setStuFilterLevel(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-300 rounded-md"
              >
                <option value="ALL">Semua Jenjang (TK–SMK)</option>
                {EDUCATION_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l} — {EDUCATION_LEVEL_LABELS[l]}
                  </option>
                ))}
              </select>
              <select
                value={stuFilterCohort}
                onChange={(e) => setStuFilterCohort(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-300 rounded-md"
              >
                <option value="ALL">Semua Angkatan</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.educationLevel} · {c.cohortName}
                  </option>
                ))}
              </select>
              <select
                value={stuFilterStatus}
                onChange={(e) => setStuFilterStatus(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-300 rounded-md"
              >
                <option value="ALL">Semua Status</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PENDING">PENDING</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </div>

            {filteredStudents.length === 0 ? (
              <EmptyState
                title="Tidak Ada Siswa yang Sesuai Filter"
                description="Tambahkan data master siswa atau ubah kata kunci pencarian."
              />
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {filteredStudents.map((s) => {
                  const lvl = normalizeEducationLevel(s.unitCode);
                  return (
                    <div key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {s.full_name || s.name}{' '}
                          <span className="font-mono font-normal text-slate-500">
                            ({s.status || 'ACTIVE'})
                          </span>
                        </p>
                        <p className="text-slate-500 font-mono">
                          NIS: {s.nis}
                          {s.nisn ? ` · NISN: ${s.nisn}` : ''} · {lvl} · Kelas {s.className} ·{' '}
                          {s.gender}
                          {s.admission_year ? ` · Angkatan ${s.admission_year}` : ''}
                        </p>
                      </div>
                      {isYayasan && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSEditId(s.id);
                              setSNis(s.nis);
                              setSNisn(s.nisn || '');
                              setSName(s.full_name || s.name);
                              setSBirthPlace(s.birth_place || '');
                              setSBirthDate(s.birth_date || '');
                              setSGender(s.gender);
                              setSAddress(s.address || '');
                              setSPhone(s.phone || '');
                              setSUnit(lvl);
                              setSClassId(s.classId);
                              setSCohortId(s.cohort_id || '');
                              setSAdmitYear(s.admission_year || '');
                              setSAcademicYearId(s.academic_year_id || '');
                              setSStudentUid(s.student_uid || s.studentUid || '');
                              setSAccountStatus(s.account_status || s.status || 'ACTIVE');
                            }}
                            className="text-slate-600 hover:text-emerald-800 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {renderLifecycleActions('students', s.id, s.name, s.status)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* 7. DATA ORANG TUA / WALI */}
      {tab === 'data_orang_tua' && isYayasan && (
        <div className="space-y-6">
          <Panel title={gEditId ? 'Edit Data Orang Tua / Wali' : 'Tambah Data Orang Tua / Wali'}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(async () => {
                  await upsertGuardianProfile(
                    {
                      id: gEditId || undefined,
                      user_uid: gUid,
                      full_name: gName,
                      email: gEmail,
                      phone: gPhone,
                      address: gAddress,
                      relationship_type: gRel,
                      linked_student_ids: [],
                      verification_status: gVer,
                      status: 'ACTIVE',
                    },
                    profile
                  );
                  setGEditId(null);
                  setGUid('');
                  setGName('');
                  setGEmail('');
                  setGPhone('');
                  setGAddress('');
                }, 'Data Orang Tua/Wali berhasil disimpan.');
              }}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs items-end"
            >
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nama Wali *</label>
                <input
                  type="text"
                  required
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={gEmail}
                  onChange={(e) => setGEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Telepon *</label>
                <input
                  type="tel"
                  required
                  value={gPhone}
                  onChange={(e) => setGPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Hubungan &amp; Verifikasi</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={gRel}
                    onChange={(e) => setGRel(e.target.value as 'ayah' | 'ibu' | 'wali')}
                    className="px-2 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="ayah">Ayah</option>
                    <option value="ibu">Ibu</option>
                    <option value="wali">Wali</option>
                  </select>
                  <select
                    value={gVer}
                    onChange={(e) =>
                      setGVer(e.target.value as 'verified' | 'pending' | 'rejected')
                    }
                    className="px-2 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="verified">verified</option>
                    <option value="pending">pending</option>
                    <option value="rejected">rejected</option>
                  </select>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">Alamat Domisili</label>
                <input
                  type="text"
                  value={gAddress}
                  onChange={(e) => setGAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">UID Akun Google (Opsional)</label>
                <input
                  type="text"
                  value={gUid}
                  onChange={(e) => setGUid(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
              >
                {gEditId ? 'Simpan' : 'Tambah Wali'}
              </button>
            </form>
          </Panel>

          <Panel title="Daftar Orang Tua / Wali" meta={`${guardians.length} profil`}>
            {guardians.length === 0 ? (
              <EmptyState
                title="Belum Ada Profil Orang Tua / Wali"
                description="Profil orang tua yang mendaftar atau ditambahkan Admin Yayasan akan tampil di sini."
              />
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {guardians.map((g) => (
                  <div key={g.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {g.full_name} ({g.relationship_type.toUpperCase()})
                      </p>
                      <p className="font-mono text-slate-500">
                        {g.email} · {g.phone} · Verifikasi: {g.verification_status} · Status:{' '}
                        {g.status}
                      </p>
                    </div>
                    {renderLifecycleActions('guardians', g.id, g.full_name, g.status)}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* 8. DATA GURU */}
      {tab === 'data_guru' && isYayasan && (
        <div className="space-y-6">
          <Panel title={tEditId ? 'Edit Data Guru' : 'Tambah Data Guru / Wali Kelas'}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const subj = tSubjects
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
                runAction(async () => {
                  if (tEditId) {
                    await updateTeacher(
                      tEditId,
                      {
                        nip: tNip,
                        name: tName,
                        email: tEmail,
                        phone: tPhone,
                        address: tAddress,
                        unitCode: tUnit,
                        roleTitle: tRole,
                        employment_status: tEmpStatus,
                        teaching_subjects: subj,
                        isPaiTeacher: tPai,
                      },
                      profile
                    );
                  } else {
                    await createTeacher(
                      {
                        nip: tNip,
                        employee_number: tNip,
                        name: tName,
                        email: tEmail,
                        phone: tPhone,
                        address: tAddress,
                        gender: tGender,
                        unitCode: tUnit,
                        roleTitle: tRole,
                        employment_status: tEmpStatus,
                        teaching_subjects: subj,
                        isPaiTeacher: tPai,
                      },
                      profile
                    );
                  }
                  setTEditId(null);
                  setTNip('');
                  setTName('');
                  setTEmail('');
                  setTPhone('');
                  setTAddress('');
                }, tEditId ? 'Data Guru diperbarui.' : 'Data Guru baru ditambahkan.');
              }}
              className="space-y-3 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">NIP / NIY *</label>
                  <input
                    type="text"
                    required
                    value={tNip}
                    onChange={(e) => setTNip(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                  <input
                    type="text"
                    required
                    value={tName}
                    onChange={(e) => setTName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jenjang Unit *</label>
                  <select
                    value={tUnit}
                    onChange={(e) => setTUnit(e.target.value as EducationLevel)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    {EDUCATION_LEVELS.map((u) => (
                      <option key={u} value={u}>
                        {u} — {EDUCATION_LEVEL_LABELS[u]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jabatan *</label>
                  <input
                    type="text"
                    required
                    value={tRole}
                    onChange={(e) => setTRole(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={tEmail}
                    onChange={(e) => setTEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Telepon</label>
                  <input
                    type="tel"
                    value={tPhone}
                    onChange={(e) => setTPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Status Kepegawaian</label>
                  <select
                    value={tEmpStatus}
                    onChange={(e) =>
                      setTEmpStatus(e.target.value as 'TETAP' | 'KONTRAK' | 'HONORER')
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="TETAP">TETAP</option>
                    <option value="KONTRAK">KONTRAK</option>
                    <option value="HONORER">HONORER</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Mata Pelajaran</label>
                  <input
                    type="text"
                    value={tSubjects}
                    onChange={(e) => setTSubjects(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1 text-slate-700">
                    <input
                      type="checkbox"
                      checked={tPai}
                      onChange={(e) => setTPai(e.target.checked)}
                    />
                    PAI
                  </label>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-3 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
                  >
                    {tEditId ? 'Simpan' : 'Tambah'}
                  </button>
                </div>
              </div>
            </form>
          </Panel>

          <Panel
            title="Daftar Guru Terdaftar"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadTeacherAssignmentTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-600 bg-emerald-50 hover:bg-emerald-100 text-xs font-medium text-emerald-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Unduh Template (.xlsx)</span>
                </button>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-500 bg-amber-50 hover:bg-amber-100 text-xs font-medium text-amber-800 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-amber-700" />
                  <span>Import Excel</span>
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={handleTeacherFileChange}
                  />
                </label>
                <select
                  value={tFilterLevel}
                  onChange={(e) => setTFilterLevel(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                >
                  <option value="ALL">Semua Jenjang</option>
                  {EDUCATION_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            }
          >
            {teachers.filter((t) => matchesEducationLevel(t.unitCode, tFilterLevel)).length === 0 ? (
              <EmptyState title="Belum Ada Data Guru" description="Tambahkan pendidik dan pengampu PAI." />
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {teachers
                  .filter((t) => matchesEducationLevel(t.unitCode, tFilterLevel))
                  .map((t) => (
                    <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {t.full_name || t.name} ({t.status || 'ACTIVE'})
                        </p>
                        <p className="text-slate-500 font-mono">
                          {normalizeEducationLevel(t.unitCode)} · {t.roleTitle} ·{' '}
                          {t.employment_status || 'TETAP'} · {t.isPaiTeacher ? 'PAI' : 'Umum'} · NIP:{' '}
                          {t.nip || '-'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setTEditId(t.id);
                            setTNip(t.nip);
                            setTName(t.full_name || t.name);
                            setTEmail(t.email || '');
                            setTPhone(t.phone || '');
                            setTAddress(t.address || '');
                            setTUnit(normalizeEducationLevel(t.unitCode));
                            setTRole(t.roleTitle);
                            setTEmpStatus(t.employment_status || 'TETAP');
                            setTSubjects((t.teaching_subjects || []).join(', '));
                            setTPai(t.isPaiTeacher);
                          }}
                          className="text-slate-600 hover:text-emerald-800 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {renderLifecycleActions('teachers', t.id, t.name, t.status)}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* 9. PENUGASAN GURU & WALI KELAS */}
      {tab === 'penugasan_guru' && isYayasan && (
        <Panel
          title="Penugasan Guru &amp; Wali Kelas"
          meta={`${classAssignments.length} penugasan tercatat`}
        >
          <div className="space-y-4 text-xs">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const cls = classes.find((c) => c.id === assignClassId);
                if (!assignTeacherUid || !cls) {
                  setErrorMsg('Pilih akun Guru dan Kelas terlebih dahulu.');
                  return;
                }
                runAction(
                  () =>
                    createTeacherClassAssignment(
                      {
                        teacher_uid: assignTeacherUid,
                        class_id: cls.id,
                        education_unit_id: normalizeEducationLevel(cls.unitCode),
                        academic_year_id: assignYearId || periods[0]?.id || 'DEFAULT',
                        semester_id: assignSemId || periods[0]?.id || '',
                        is_homeroom: assignHomeroom,
                        subject_name: assignSubject,
                      },
                      profile
                    ),
                  `Penugasan kelas ${normalizeEducationLevel(cls.unitCode)} · ${cls.name} disimpan.`
                );
              }}
              className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
            >
              <div>
                <label className="block font-medium text-slate-700 mb-1">Akun Guru / Wali Kelas *</label>
                <select
                  required
                  value={assignTeacherUid}
                  onChange={(e) => setAssignTeacherUid(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                >
                  <option value="">-- Pilih Akun Guru --</option>
                  {users
                    .filter((u) => {
                      const r = normalizeRole(u.role);
                      return r === 'TEACHER' || r === 'HOMEROOM_TEACHER';
                    })
                    .map((t) => (
                      <option key={t.uid} value={t.uid}>
                        {t.full_name} ({normalizeRole(t.role)})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Kelas *</label>
                <select
                  required
                  value={assignClassId}
                  onChange={(e) => setAssignClassId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                >
                  <option value="">-- Pilih Kelas --</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {normalizeEducationLevel(c.unitCode)} · {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Periode / Tahun</label>
                <select
                  value={assignYearId || periods[0]?.id || ''}
                  onChange={(e) => setAssignYearId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                >
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Mata Pelajaran</label>
                <input
                  type="text"
                  value={assignSubject}
                  onChange={(e) => setAssignSubject(e.target.value)}
                  placeholder="PAI / Wali Kelas"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignHomeroom}
                    onChange={(e) => setAssignHomeroom(e.target.checked)}
                  />
                  <span>Wali Kelas</span>
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
                >
                  Tetapkan
                </button>
              </div>
            </form>

            {classAssignments.length === 0 ? (
              <EmptyState title="Belum Ada Penugasan Kelas" description="Tetapkan guru/wali kelas pada kelas aktif." />
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md px-3">
                {classAssignments.map((ca) => {
                  const tUser = users.find((u) => u.uid === ca.teacher_uid);
                  const cls = classes.find((c) => c.id === ca.class_id);
                  return (
                    <div key={ca.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {tUser?.full_name || ca.teacher_uid} →{' '}
                          {normalizeEducationLevel(ca.education_unit_id)} · {cls?.name || ca.class_id}
                        </p>
                        <p className="text-slate-500 font-mono">
                          {ca.is_homeroom ? 'Wali Kelas' : 'Guru Bidang'}
                          {ca.subject_name ? ` · ${ca.subject_name}` : ''} · Status:{' '}
                          {ca.assignment_status}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          runAction(
                            () =>
                              toggleClassAssignmentStatus(
                                ca.id,
                                ca.assignment_status === 'active' ? 'inactive' : 'active',
                                profile
                              ),
                            'Status penugasan kelas diperbarui.'
                          )
                        }
                        className="text-emerald-800 font-medium hover:underline cursor-pointer"
                      >
                        {ca.assignment_status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* 10. DATA ANGGOTA KOMITE */}
      {tab === 'anggota_komite' && isYayasan && (
        <div className="space-y-6">
          <Panel title="Tambah / Perbarui Data Anggota Komite Pendidikan Agama">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(async () => {
                  await upsertCommitteeMember(
                    {
                      id: cmEditId || undefined,
                      user_uid: cmUid,
                      full_name: cmName,
                      email: cmEmail,
                      phone: cmPhone,
                      committee_position: cmPos,
                      appointment_number: cmSk,
                      appointment_date: cmSkDate,
                      term_start: cmStart,
                      term_end: cmEnd,
                      membership_status: cmStatus,
                    },
                    profile
                  );
                  setCmEditId(null);
                  setCmUid('');
                  setCmName('');
                  setCmEmail('');
                  setCmPhone('');
                  setCmSk('');
                }, 'Data Anggota Komite berhasil disimpan.');
              }}
              className="space-y-3 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                  <input
                    type="text"
                    required
                    value={cmName}
                    onChange={(e) => setCmName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={cmEmail}
                    onChange={(e) => setCmEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Telepon</label>
                  <input
                    type="tel"
                    value={cmPhone}
                    onChange={(e) => setCmPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jabatan Komite *</label>
                  <input
                    type="text"
                    required
                    value={cmPos}
                    onChange={(e) => setCmPos(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nomor SK *</label>
                  <input
                    type="text"
                    required
                    value={cmSk}
                    onChange={(e) => setCmSk(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tanggal SK</label>
                  <input
                    type="date"
                    value={cmSkDate}
                    onChange={(e) => setCmSkDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Mulai Masa Tugas</label>
                  <input
                    type="date"
                    value={cmStart}
                    onChange={(e) => setCmStart(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Akhir Masa Tugas</label>
                  <input
                    type="date"
                    value={cmEnd}
                    onChange={(e) => setCmEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
                >
                  Simpan Anggota Komite
                </button>
              </div>
            </form>
          </Panel>

          <Panel title="Daftar Anggota Komite Pendidikan Agama" meta={`${committeeMembers.length} anggota`}>
            {committeeMembers.length === 0 ? (
              <EmptyState title="Belum Ada Data Anggota Komite" description="Tambahkan anggota Komite Pendidikan Agama beserta SK pengangkatannya." />
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {committeeMembers.map((cm) => (
                  <div key={cm.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {cm.full_name} — {cm.committee_position}
                      </p>
                      <p className="font-mono text-slate-500">
                        SK: {cm.appointment_number} · Masa Tugas: {cm.term_start || '-'} s.d.{' '}
                        {cm.term_end || '-'} · Status: {cm.membership_status}
                      </p>
                    </div>
                    {renderLifecycleActions('committee_members', cm.id, cm.full_name, cm.status)}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* 11. DATA ADMIN YAYASAN */}
      {tab === 'admin_yayasan' && isYayasan && (
        <div className="space-y-6">
          <Panel
            title="Tambah / Perbarui Data Admin Yayasan"
            meta="Setiap perubahan tercatat di Audit Trail Sistem"
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(async () => {
                  await upsertFoundationAdmin(
                    {
                      id: faEditId || undefined,
                      user_uid: faUid,
                      full_name: faName,
                      email: faEmail,
                      phone: faPhone,
                      position: faPos,
                      division: faDiv,
                      appointment_number: faSk,
                      appointment_date: faSkDate,
                      employment_status: faStatus,
                    },
                    profile
                  );
                  setFaEditId(null);
                  setFaUid('');
                  setFaName('');
                  setFaEmail('');
                  setFaPhone('');
                  setFaSk('');
                }, 'Data Admin Yayasan disimpan dan dicatat dalam Audit Trail.');
              }}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs items-end"
            >
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={faName}
                  onChange={(e) => setFaName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={faEmail}
                  onChange={(e) => setFaEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Jabatan *</label>
                <input
                  type="text"
                  required
                  value={faPos}
                  onChange={(e) => setFaPos(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Divisi *</label>
                <input
                  type="text"
                  required
                  value={faDiv}
                  onChange={(e) => setFaDiv(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nomor SK</label>
                <input
                  type="text"
                  value={faSk}
                  onChange={(e) => setFaSk(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Telepon</label>
                <input
                  type="tel"
                  value={faPhone}
                  onChange={(e) => setFaPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">UID Akun (Opsional)</label>
                <input
                  type="text"
                  value={faUid}
                  onChange={(e) => setFaUid(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
              >
                Simpan Admin Yayasan
              </button>
            </form>
          </Panel>

          <Panel title="Daftar Admin Yayasan" meta={`${foundationAdmins.length} admin`}>
            {foundationAdmins.length === 0 ? (
              <EmptyState title="Belum Ada Profil Admin Yayasan Tambahan" description="Tambahkan struktur pejabat Yayasan pemegang otoritas administrasi." />
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {foundationAdmins.map((fa) => (
                  <div key={fa.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {fa.full_name} — {fa.position}
                      </p>
                      <p className="font-mono text-slate-500">
                        Divisi: {fa.division} · SK: {fa.appointment_number || '-'} · Status:{' '}
                        {fa.employment_status}
                      </p>
                    </div>
                    {renderLifecycleActions('foundation_admins', fa.id, fa.full_name, fa.status)}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* 12. RELASI SISWA DAN ORANG TUA */}
      {tab === 'relasi_wali' && isYayasan && (
        <Panel
          title="Relasi Siswa dan Orang Tua / Wali (student_guardians)"
          meta={`${studentGuardians.length} relasi tercatat`}
        >
          <div className="space-y-4 text-xs">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!relStudentId || !relGuardianUid) {
                  setErrorMsg('Pilih akun Orang Tua dan Siswa.');
                  return;
                }
                runAction(
                  () =>
                    createVerifiedGuardianRelation(
                      {
                        student_id: relStudentId,
                        guardian_uid: relGuardianUid,
                        relationship_type: relType,
                        verification_status: relStatus,
                      },
                      profile
                    ),
                  'Relasi wali-siswa berhasil disimpan.'
                );
              }}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="block font-medium text-slate-700 mb-1">Akun Orang Tua / Wali *</label>
                <select
                  required
                  value={relGuardianUid}
                  onChange={(e) => setRelGuardianUid(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                >
                  <option value="">-- Pilih Akun PARENT --</option>
                  {users
                    .filter((u) => normalizeRole(u.role) === 'PARENT')
                    .map((p) => (
                      <option key={p.uid} value={p.uid}>
                        {p.full_name} ({p.email})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Siswa *</label>
                <select
                  required
                  value={relStudentId}
                  onChange={(e) => setRelStudentId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                >
                  <option value="">-- Pilih Siswa --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nis} — {s.name} ({normalizeEducationLevel(s.unitCode)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={relType}
                  onChange={(e) => setRelType(e.target.value as 'ayah' | 'ibu' | 'wali')}
                  className="px-2.5 py-2 bg-white border border-slate-300 rounded-md"
                >
                  <option value="ayah">Ayah</option>
                  <option value="ibu">Ibu</option>
                  <option value="wali">Wali</option>
                </select>
                <select
                  value={relStatus}
                  onChange={(e) =>
                    setRelStatus(e.target.value as 'verified' | 'pending' | 'rejected')
                  }
                  className="px-2.5 py-2 bg-white border border-slate-300 rounded-md"
                >
                  <option value="verified">verified</option>
                  <option value="pending">pending</option>
                  <option value="rejected">rejected</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
              >
                Simpan Relasi Wali
              </button>
            </form>

            {studentGuardians.length > 0 && (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md px-3">
                {studentGuardians.map((sg) => {
                  const pUser = users.find((u) => u.uid === sg.guardian_uid);
                  const stu = students.find((s) => s.id === sg.student_id);
                  return (
                    <div key={sg.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {pUser?.full_name || sg.guardian_uid} →{' '}
                          {stu ? `${stu.name} (${stu.nis})` : sg.student_id}
                        </p>
                        <p className="font-mono text-slate-500">
                          Hubungan: {sg.relationship_type} · Status: {sg.verification_status}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* 13. USER MANAGEMENT & PENDING APPROVAL QUEUE (READ-ONLY) */}
      {tab === 'manajemen_user' && isYayasan && (
        <div className="space-y-6">
          <div className="p-3 border border-amber-300 bg-amber-50 rounded-md text-xs text-amber-900">
            <span className="font-semibold">Kebijakan Keamanan Fase 1 (Mode Baca): </span>
            {PRIVILEGED_MUTATION_DISABLED_MESSAGE}
          </div>
          <Panel
            title="Antrean Persetujuan Akun Baru (PENDING / PENDING_VERIFICATION)"
            meta={`${pendingUsers.length} akun menunggu aktivasi melalui backend`}
          >
            {pendingUsers.length === 0 ? (
              <EmptyState
                title="Tidak Ada Akun PENDING"
                description="Semua pengguna yang mendaftar telah diverifikasi atau belum ada pengajuan baru."
              />
            ) : (
              <div className="divide-y divide-slate-200 text-xs">
                {pendingUsers.map((u) => {
                  const statusLabel = normalizeAccountStatus(u.account_status);
                  return (
                    <div key={u.uid} className="py-4 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">
                            {u.full_name || u.displayName}{' '}
                            <span className="font-mono text-xs text-amber-800">[{statusLabel}]</span>
                          </p>
                          <p className="font-mono text-slate-500">
                            {u.email} · Portal dipilih: {u.requested_portal || '-'} · Ajuan role:{' '}
                            {u.requested_role || 'STUDENT'}
                          </p>
                        </div>
                        <span className="font-mono text-xs text-slate-500">
                          Role saat ini: {normalizeRole(u.role)} (Menunggu layanan backend)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel
            title="Seluruh Pengguna SIAKHLAK (Mode Baca)"
            meta={`${users.length} pengguna`}
            action={
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Cari email atau nama..."
                className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
              />
            }
          >
            <div className="divide-y divide-slate-100 text-xs">
              {users
                .filter((u) => {
                  if (!userSearch.trim()) return true;
                  const q = userSearch.toLowerCase();
                  return `${u.full_name} ${u.email} ${u.role}`.toLowerCase().includes(q);
                })
                .map((u) => {
                  const canonical = normalizeRole(u.role);
                  const normStatus = normalizeAccountStatus(u.account_status);
                  return (
                    <div
                      key={u.uid}
                      className="py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{u.full_name || u.displayName}</p>
                        <p className="font-mono text-slate-500">
                          {u.email} · Profil: {u.profile_status || 'VERIFIED'} · Unit:{' '}
                          {(u.assignedUnits || []).join(', ') || '-'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={canonical}
                          disabled
                          aria-label={`Role ${u.email}`}
                          className="px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded-md text-slate-700 cursor-not-allowed"
                        >
                          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                          <option value="FOUNDATION_ADMIN">FOUNDATION_ADMIN</option>
                          <option value="COMMITTEE_ADMIN">COMMITTEE_ADMIN</option>
                          <option value="HOMEROOM_TEACHER">HOMEROOM_TEACHER</option>
                          <option value="TEACHER">TEACHER</option>
                          <option value="PARENT">PARENT</option>
                          <option value="STUDENT">STUDENT</option>
                        </select>
                        <select
                          value={normStatus}
                          disabled
                          aria-label={`Status ${u.email}`}
                          className="px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded-md font-mono text-slate-700 cursor-not-allowed"
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option>
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="SUSPENDED">SUSPENDED</option>
                          <option value="REVOKED">REVOKED</option>
                          <option value="INACTIVE">INACTIVE</option>
                          <option value="ARCHIVED">ARCHIVED</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
            </div>
          </Panel>
        </div>
      )}

      {/* 14. ROLE & PERMISSION MANAGEMENT (READ-ONLY) */}
      {tab === 'role_permission' && isYayasan && (
        <Panel
          title="Matriks Role &amp; Permission Granular (user_permissions — Mode Baca)"
          meta="Lihat kewenangan efektif per akun dan cakupan 5 jenjang unit (TK, SD, SMP, SMA, SMK)"
        >
          <div className="mb-4 p-3 border border-amber-300 bg-amber-50 rounded-md text-xs text-amber-900">
            <span className="font-semibold">Kebijakan Keamanan Fase 1: </span>
            {PRIVILEGED_MUTATION_DISABLED_MESSAGE}
          </div>
          <div className="divide-y divide-slate-200 text-xs">
            {users.map((u) => {
              const canonical = normalizeRole(u.role);
              const permDoc = userPermissionsList.find((p) => p.uid === u.uid);
              const perms: PermissionKey[] =
                permDoc?.permissions?.length
                  ? permDoc.permissions
                  : defaultPermissionsForRole(canonical);
              const isOpen = expandedPermUid === u.uid;
              return (
                <div key={u.uid} className="py-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {u.full_name} ({canonical})
                      </p>
                      <p className="font-mono text-slate-500">
                        {u.email} · {perms.length} izin aktif · Unit:{' '}
                        {(u.assignedUnits || []).join(', ') || '-'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedPermUid(isOpen ? null : u.uid)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 font-medium cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-800" />
                      <span>{isOpen ? 'Tutup Matriks' : 'Lihat Permission & Unit'}</span>
                    </button>
                  </div>
                  {isOpen && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-medium text-slate-800">Unit Kewenangan:</span>
                        {EDUCATION_LEVELS.map((lvl) => {
                          const checked = (u.assignedUnits || []).some((x) =>
                            matchesEducationLevel(x, lvl)
                          );
                          return (
                            <label key={lvl} className="inline-flex items-center gap-1 text-slate-600 cursor-not-allowed">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled
                                readOnly
                              />
                              <span>{lvl}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {ALL_PERMISSIONS.map((permDef) => {
                          const checked = perms.includes(permDef.key);
                          return (
                            <label
                              key={permDef.key}
                              className="inline-flex items-start gap-2 text-slate-600 cursor-not-allowed"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled
                                readOnly
                              />
                              <span>
                                <span className="font-medium text-slate-900">{permDef.label}</span>
                                <span className="block font-mono text-slate-500">
                                  {permDef.key}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* 15. AUDIT TRAIL */}
      {tab === 'audit_trail' && isYayasan && (
        <Panel
          title="Riwayat Perubahan Data &amp; Audit Trail"
          meta={`${auditLogs.length} catatan audit tercatat`}
          action={
            <input
              type="text"
              value={auditFilter}
              onChange={(e) => setAuditFilter(e.target.value)}
              placeholder="Filter aksi / aktor / koleksi..."
              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
            />
          }
        >
          {auditLogs.length === 0 ? (
            <EmptyState
              title="Belum Ada Catatan Audit"
              description="Setiap perubahan master data, persetujuan akun, kenaikan kelas, dan import Excel tercatat permanen di sini."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Waktu</th>
                    <th className="py-2 px-3 font-medium">Aktor</th>
                    <th className="py-2 px-3 font-medium">Aksi</th>
                    <th className="py-2 px-3 font-medium">Target</th>
                    <th className="py-2 pl-3 font-medium">Ringkasan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs
                    .filter((a) => {
                      if (!auditFilter.trim()) return true;
                      const q = auditFilter.toLowerCase();
                      return `${a.actorName} ${a.action} ${a.targetCollection} ${a.summary}`
                        .toLowerCase()
                        .includes(q);
                    })
                    .slice(0, 60)
                    .map((a) => (
                      <tr key={a.id}>
                        <td className="py-2 pr-3 font-mono text-slate-500 whitespace-nowrap">
                          {formatTimestamp(a.createdAt)}
                        </td>
                        <td className="py-2 px-3 text-slate-800">
                          {a.actorName}{' '}
                          <span className="font-mono text-slate-500">({a.actorRole})</span>
                        </td>
                        <td className="py-2 px-3 font-mono font-medium text-slate-900">
                          {a.action}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {a.targetCollection}/{a.targetId}
                        </td>
                        <td className="py-2 pl-3 text-slate-700">{a.summary}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
