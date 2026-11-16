import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Eye,
  EyeOff,
  GraduationCap,
  Landmark,
  LogIn,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  AcademicYearDoc,
  DbConnectionStatus,
  EducationLevel,
  EducationUnit,
  LOGIN_EDUCATION_LEVEL_OPTIONS,
  LoginPortal,
  loginRouteForPortal,
  normalizeEducationLevel,
  normalizeRole,
  portalForRole,
  portalLabel,
  roleLabel,
  SchoolClass,
  TeacherLoginSelection,
  UserProfile,
} from '../types/siakhlak';
import {
  extractUnitsForEducationLevel,
  filterActiveAllowedAcademicYears,
  filterStudentLoginClasses,
} from '../services/siakhlakService';
import { DbStatusBadge } from './ui/Primitives';
import { FOUNDATION_BRAND, FoundationBrand } from './branding/FoundationBrand';

interface PortalDef {
  key: LoginPortal;
  route: string;
  title: string;
  description: string;
  rolesText: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PORTAL_DEFS: PortalDef[] = [
  {
    key: 'parent_student',
    route: loginRouteForPortal('parent_student'),
    title: 'Portal Siswa / Orang Tua Murid',
    description:
      'Portal Siswa untuk profil & Mutaba’ah pribadi, atau Portal Orang Tua/Wali terverifikasi untuk memantau penilaian 31 indikator yang dipublikasikan, Mutaba’ah, dan riwayat perkembangan anak.',
    rolesText: 'Role resmi: STUDENT · PARENT',
    icon: GraduationCap,
  },
  {
    key: 'teacher',
    route: loginRouteForPortal('teacher'),
    title: 'Portal Guru / Wali Kelas',
    description:
      'Login berbasis unit, jenjang, tahun ajaran, dan kelas penugasan resmi untuk mengelola penilaian 31 indikator, Template & Import Excel, Mutaba’ah, dan tindak lanjut.',
    rolesText: 'Role resmi: TEACHER · HOMEROOM_TEACHER',
    icon: BookOpenCheck,
  },
  {
    key: 'committee',
    route: loginRouteForPortal('committee'),
    title: 'Portal Admin Komite Pendidikan Agama',
    description:
      'Akses 9 modul pengawasan Komite: Monitoring Pendidikan Agama, Evaluasi Program, Akhlakul Karimah, Mutaba’ah, Temuan, Rapat, Tindak Lanjut & Laporan.',
    rolesText: 'Role resmi: COMMITTEE_ADMIN',
    icon: ShieldCheck,
  },
  {
    key: 'foundation',
    route: loginRouteForPortal('foundation'),
    title: 'Portal Admin Yayasan',
    description:
      'Kendali operasional Yayasan dan tata kelola sistem: Data Master Unit/Kelas/Siswa, Penugasan Guru, Relasi Wali, dan Audit Trail.',
    rolesText: 'Role resmi: FOUNDATION_ADMIN · SUPER_ADMIN',
    icon: Landmark,
  },
];

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder = 'Masukkan password',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block font-medium text-slate-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          required
          autoComplete="current-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 bg-white border border-slate-300 rounded-md text-slate-900"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'}
          className="absolute inset-y-0 right-0 px-2.5 flex items-center text-slate-500 hover:text-slate-800 cursor-pointer"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export function AuthGate({
  activeLoginPortal,
  onOpenPortalLogin,
  onBackToPortalSelection,
  onSignIn,
  onStudentEmailSignIn,
  onStudentGoogleSignIn,
  onParentEmailSignIn,
  onTeacherEmailSignIn,
  onTeacherGoogleSignIn,
  onCommitteeEmailSignIn,
  onFoundationEmailSignIn,
  academicYears = [],
  classes = [],
  units = [],
  dbStatus,
  onRetryDb,
  errorMsg,
}: {
  activeLoginPortal: LoginPortal | null;
  onOpenPortalLogin: (portal: LoginPortal) => void;
  onBackToPortalSelection: () => void;
  onSignIn: (portal: LoginPortal) => Promise<void>;
  onStudentEmailSignIn: (email: string, password: string) => Promise<void>;
  onStudentGoogleSignIn: () => Promise<void>;
  onParentEmailSignIn: (email: string, password: string) => Promise<void>;
  onTeacherEmailSignIn: (
    email: string,
    password: string,
    selection: TeacherLoginSelection
  ) => Promise<void>;
  onTeacherGoogleSignIn: (selection: TeacherLoginSelection) => Promise<void>;
  onCommitteeEmailSignIn: (email: string, password: string) => Promise<void>;
  onFoundationEmailSignIn: (email: string, password: string) => Promise<void>;
  academicYears?: AcademicYearDoc[];
  classes?: SchoolClass[];
  units?: EducationUnit[];
  dbStatus: DbConnectionStatus;
  onRetryDb: () => void;
  errorMsg: string | null;
}) {
  const [loading, setLoading] = useState(false);

  // Portal Siswa / Orang Tua tab mode ('student' | 'parent')
  const [spMode, setSpMode] = useState<'student' | 'parent'>('student');

  // Teacher mandatory pre-auth selections (Jenjang -> Tahun Ajaran -> Kelas)
  const [teacherLevel, setTeacherLevel] = useState<EducationLevel>('SD');
  const [teacherUnitId, setTeacherUnitId] = useState<string>('');
  const [teacherYearId, setTeacherYearId] = useState<string>('');
  const [teacherClassId, setTeacherClassId] = useState<string>('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const activeDef = activeLoginPortal
    ? PORTAL_DEFS.find((p) => p.key === activeLoginPortal) || PORTAL_DEFS[0]
    : null;

  useEffect(() => {
    setLocalError(null);
    setPassword('');
  }, [activeLoginPortal]);

  const activeYears = useMemo(
    () => filterActiveAllowedAcademicYears(academicYears),
    [academicYears]
  );

  // Build Jenjang options enriched with master unit names when available
  const teacherLevelOptions = useMemo(() => {
    return LOGIN_EDUCATION_LEVEL_OPTIONS.map((opt) => {
      const matchedUnit = units.find(
        (u) => normalizeEducationLevel(u.education_level || u.code) === opt.value
      );
      return {
        ...opt,
        unitName: matchedUnit?.name,
      };
    });
  }, [units]);

  // Initial newest active academic year auto-select (never auto-creates)
  useEffect(() => {
    if (activeYears.length === 0) {
      setTeacherYearId('');
      return;
    }
    if (!teacherYearId || !activeYears.some((y) => y.id === teacherYearId)) {
      setTeacherYearId(activeYears[0].id);
    }
  }, [activeYears, teacherYearId]);

  const availableUnitsForTeacherLevel = useMemo(
    () => extractUnitsForEducationLevel(classes, teacherLevel),
    [classes, teacherLevel]
  );

  // Keep unit aligned when jenjang changes
  useEffect(() => {
    if (availableUnitsForTeacherLevel.length === 0) {
      setTeacherUnitId('');
    } else if (
      availableUnitsForTeacherLevel.length === 1 ||
      !availableUnitsForTeacherLevel.some((u) => u.unitId === teacherUnitId)
    ) {
      setTeacherUnitId(availableUnitsForTeacherLevel[0].unitId);
    }
  }, [availableUnitsForTeacherLevel, teacherUnitId]);

  const filteredTeacherClasses = useMemo(
    () =>
      filterStudentLoginClasses(
        classes,
        teacherLevel,
        teacherYearId,
        availableUnitsForTeacherLevel.length > 1 ? teacherUnitId : undefined
      ),
    [classes, teacherLevel, teacherYearId, availableUnitsForTeacherLevel.length, teacherUnitId]
  );

  // Reset selected class whenever jenjang, unit, or academic year changes or selected class disappears
  useEffect(() => {
    setTeacherClassId((prev) =>
      filteredTeacherClasses.some((c) => c.id === prev) ? prev : ''
    );
  }, [teacherLevel, teacherUnitId, teacherYearId, filteredTeacherClasses]);

  const handlePortalGoogleLogin = async () => {
    if (!activeLoginPortal) return;
    setLocalError(null);
    setLoading(true);
    try {
      await onSignIn(activeLoginPortal);
    } finally {
      setLoading(false);
    }
  };

  // --- Portal 1: Student & Parent Handlers (NO manual class dropdown) ---
  const handleStudentEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!email.trim() || !password) {
      setLocalError('Email siswa dan password wajib diisi.');
      return;
    }
    setLoading(true);
    try {
      await onStudentEmailSignIn(email.trim(), password);
    } finally {
      setLoading(false);
    }
  };

  const handleStudentGoogleClick = async () => {
    setLocalError(null);
    setLoading(true);
    try {
      await onStudentGoogleSignIn();
    } finally {
      setLoading(false);
    }
  };

  const handleParentEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!email.trim() || !password) {
      setLocalError('Email orang tua dan password wajib diisi.');
      return;
    }
    setLoading(true);
    try {
      await onParentEmailSignIn(email.trim(), password);
    } finally {
      setLoading(false);
    }
  };

  // --- Portal 2: Teacher Handlers (Jenjang -> Tahun Ajaran -> Kelas -> Email -> Password) ---
  const buildValidatedTeacherSelection = (): TeacherLoginSelection | null => {
    if (activeYears.length === 0 || !teacherYearId) {
      setLocalError('Data tahun ajaran aktif belum tersedia atau belum dipilih.');
      return null;
    }
    if (filteredTeacherClasses.length === 0 || !teacherClassId) {
      setLocalError('Silakan pilih kelas penugasan sesuai jenjang dan tahun ajaran Anda.');
      return null;
    }
    const chosenClass = filteredTeacherClasses.find((c) => c.id === teacherClassId);
    return {
      educationLevel: teacherLevel,
      educationUnitId:
        chosenClass?.educationUnitId ||
        (availableUnitsForTeacherLevel.length > 1 ? teacherUnitId : undefined),
      academicYearId: teacherYearId,
      classId: teacherClassId,
    };
  };

  const handleTeacherEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const selection = buildValidatedTeacherSelection();
    if (!selection) return;
    if (!email.trim() || !password) {
      setLocalError('Email guru dan password wajib diisi.');
      return;
    }
    setLoading(true);
    try {
      await onTeacherEmailSignIn(email.trim(), password, selection);
    } finally {
      setLoading(false);
    }
  };

  const handleTeacherGoogleClick = async () => {
    setLocalError(null);
    const selection = buildValidatedTeacherSelection();
    if (!selection) return;
    setLoading(true);
    try {
      await onTeacherGoogleSignIn(selection);
    } finally {
      setLoading(false);
    }
  };

  // --- Portal 3 & 4: Admin Committee / Admin Foundation Handlers ---
  const handleAdminEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLoginPortal) return;
    setLocalError(null);
    if (!email.trim() || !password) {
      setLocalError('Email dan password wajib diisi.');
      return;
    }
    setLoading(true);
    try {
      if (activeLoginPortal === 'committee') {
        await onCommitteeEmailSignIn(email.trim(), password);
      } else if (activeLoginPortal === 'foundation') {
        await onFoundationEmailSignIn(email.trim(), password);
      }
    } finally {
      setLoading(false);
    }
  };

  const combinedError = localError || errorMsg;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3 max-w-5xl w-full mx-auto">
        <FoundationBrand variant="header" />
        <DbStatusBadge status={dbStatus} onRetry={onRetryDb} />
      </div>

      {!activeDef ? (
        <div className="max-w-5xl w-full mx-auto my-8 bg-white border border-slate-200 border-t-4 border-t-emerald-800 rounded-lg p-6 sm:p-10 space-y-8">
          <div className="space-y-3">
            <FoundationBrand variant="hero" />
            <p className="text-xs sm:text-sm text-slate-600">
              Pilih salah satu dari empat portal masuk resmi sesuai peran akun Anda. Setiap portal menggunakan login Email/Password (utama) atau Google Sign-In serta validasi peran Firestore.
            </p>
          </div>

          {dbStatus === 'NOT CONNECTED' && (
            <div className="p-3.5 border border-red-300 bg-red-50 rounded-md flex items-start gap-2.5 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold font-mono">STATUS: NOT CONNECTED</p>
                <p className="mt-0.5">
                  Database Firestore belum terhubung atau perangkat sedang luring. Periksa koneksi internet Anda lalu coba kembali.
                </p>
              </div>
            </div>
          )}

          {combinedError && (
            <div className="p-3.5 border border-red-300 bg-red-50 rounded-md text-xs text-red-800">
              {combinedError}
            </div>
          )}

          {/* Four Dedicated Login Portals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PORTAL_DEFS.map((portal) => {
              const Icon = portal.icon;
              return (
                <div
                  key={portal.key}
                  className="border border-slate-200 rounded-lg p-5 bg-white flex flex-col justify-between gap-4 hover:border-emerald-800/60 transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="w-9 h-9 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-emerald-800" />
                      </div>
                      <span className="font-mono text-xs text-slate-500">
                        {portal.route}
                      </span>
                    </div>
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      {portal.title}
                    </h2>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {portal.description}
                    </p>
                  </div>
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-slate-500">
                      {portal.rolesText}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenPortalLogin(portal.key)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Buka Login</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="max-w-xl w-full mx-auto my-8 bg-white border border-slate-200 border-t-4 border-t-emerald-800 rounded-lg p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onBackToPortalSelection}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke 4 Pilihan Portal</span>
            </button>
            <span className="font-mono text-xs text-slate-500">{activeDef.route}</span>
          </div>

          <FoundationBrand variant="portal" className="pb-4 border-b border-amber-600/30" />

          <div className="flex items-start gap-3.5 pb-5 border-b border-slate-200">
            <div className="w-11 h-11 rounded-lg border border-slate-200 bg-emerald-900 flex items-center justify-center shrink-0">
              <activeDef.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">
                {activeDef.title}
              </h1>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {activeDef.description}
              </p>
            </div>
          </div>

          {dbStatus === 'NOT CONNECTED' && (
            <div className="p-3.5 border border-red-300 bg-red-50 rounded-md flex items-start gap-2.5 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold font-mono">STATUS: NOT CONNECTED</p>
                <p className="mt-0.5">
                  Database Firestore belum terhubung. Periksa koneksi internet Anda lalu coba kembali.
                </p>
              </div>
            </div>
          )}

          {combinedError && (
            <div className="p-3.5 border border-red-300 bg-red-50 rounded-md text-xs text-red-800">
              {combinedError}
            </div>
          )}

          {/* PORTAL 1: SISWA / ORANG TUA MURID (Tanpa pilihan kelas manual) */}
          {activeDef.key === 'parent_student' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setSpMode('student');
                    setLocalError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md font-medium transition-colors cursor-pointer ${
                    spMode === 'student'
                      ? 'bg-emerald-900 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>Login Siswa</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSpMode('parent');
                    setLocalError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md font-medium transition-colors cursor-pointer ${
                    spMode === 'parent'
                      ? 'bg-emerald-900 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Login Orang Tua / Wali</span>
                </button>
              </div>

              {spMode === 'student' ? (
                <form onSubmit={handleStudentEmailSubmit} className="space-y-4 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-slate-600 leading-relaxed">
                    <p className="font-semibold text-slate-900">Portal Login Siswa</p>
                    <p className="mt-0.5">
                      Masuk menggunakan Email dan Password akun siswa terdaftar. Data jenjang pendidikan, tahun ajaran, dan kelas aktif Anda akan dimuat otomatis dari Firestore.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="stu-login-email"
                        className="block font-medium text-slate-700 mb-1"
                      >
                        Email / Akun Siswa *
                      </label>
                      <input
                        id="stu-login-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="siswa@alchasanah.sch.id"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-900"
                      />
                    </div>
                    <PasswordField
                      id="stu-login-password"
                      label="Password *"
                      value={password}
                      onChange={setPassword}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-medium transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{loading ? 'Memverifikasi Akun...' : 'Masuk ke Portal Siswa'}</span>
                  </button>

                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-2 bg-white text-slate-500">
                        atau masuk dengan akun Google terdaftar
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleStudentGoogleClick}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium disabled:opacity-60 cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Masuk dengan Google (Siswa)</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleParentEmailSubmit} className="space-y-4 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-slate-600 leading-relaxed">
                    <p className="font-semibold text-slate-900">
                      Portal Orang Tua / Wali Murid
                    </p>
                    <p className="mt-0.5">
                      Login Orang Tua menggunakan email dan password wali terdaftar tanpa memilih kelas. Sistem otomatis menampilkan data anak dengan relasi wali terverifikasi beserta jenjang, tahun ajaran, dan kelasnya.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="parent-login-email"
                        className="block font-medium text-slate-700 mb-1"
                      >
                        Email Orang Tua / Wali *
                      </label>
                      <input
                        id="parent-login-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="wali@domain.com"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-900"
                      />
                    </div>
                    <PasswordField
                      id="parent-login-password"
                      label="Password *"
                      value={password}
                      onChange={setPassword}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-medium transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{loading ? 'Memverifikasi Akun...' : 'Masuk sebagai Orang Tua / Wali'}</span>
                  </button>

                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-2 bg-white text-slate-500">
                        atau masuk dengan Google
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handlePortalGoogleLogin}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium disabled:opacity-60 cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Masuk dengan Google (Orang Tua / Wali)</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* PORTAL 2: GURU / WALI KELAS (1. Jenjang -> 2. Tahun Ajaran -> 3. Kelas -> 4. Email -> 5. Password -> 6. Masuk) */}
          {activeDef.key === 'teacher' && (
            <form onSubmit={handleTeacherEmailSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-900">
                  Login Guru / Wali Kelas Berbasis Penugasan Kelas
                </p>
                <p className="mt-0.5">
                  Pilih <span className="font-medium">Jenjang Pendidikan</span>,{' '}
                  <span className="font-medium">Tahun Ajaran Aktif</span>, dan{' '}
                  <span className="font-medium">Kelas</span> yang Anda ajar sebelum memasukkan Email dan Password Guru.
                </p>
              </div>

              {/* 1. JENJANG PENDIDIKAN */}
              <div>
                <label
                  htmlFor="teacher-login-level"
                  className="block font-medium text-slate-700 mb-1"
                >
                  1. Jenjang Pendidikan *
                </label>
                <select
                  id="teacher-login-level"
                  value={teacherLevel}
                  onChange={(e) => {
                    setTeacherLevel(e.target.value as EducationLevel);
                    setLocalError(null);
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-900"
                >
                  {teacherLevelOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.unitName || opt.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Separate unit selector when multiple units exist under grouped jenjang (e.g. KB & TK under KB/TK) */}
              {availableUnitsForTeacherLevel.length > 1 && (
                <div>
                  <label
                    htmlFor="teacher-login-unit"
                    className="block font-medium text-slate-700 mb-1"
                  >
                    Unit Pendidikan ({teacherLevel === 'TK' ? 'KB / TK' : teacherLevel}) *
                  </label>
                  <select
                    id="teacher-login-unit"
                    value={teacherUnitId}
                    onChange={(e) => {
                      setTeacherUnitId(e.target.value);
                      setLocalError(null);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-900"
                  >
                    {availableUnitsForTeacherLevel.map((u) => (
                      <option key={u.unitId} value={u.unitId}>
                        {u.unitLabel}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 2. TAHUN AJARAN */}
              <div>
                <label
                  htmlFor="teacher-login-year"
                  className="block font-medium text-slate-700 mb-1"
                >
                  2. Tahun Ajaran *
                </label>
                {activeYears.length === 0 ? (
                  <div className="p-2.5 border border-amber-300 bg-amber-50 rounded-md text-amber-900">
                    Data tahun ajaran aktif belum tersedia. Hubungi Admin Yayasan untuk mengaktifkan Tahun Ajaran pada Master Data.
                  </div>
                ) : (
                  <select
                    id="teacher-login-year"
                    value={teacherYearId}
                    onChange={(e) => {
                      setTeacherYearId(e.target.value);
                      setLocalError(null);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-900 font-mono"
                  >
                    {activeYears.map((ay) => (
                      <option key={ay.id} value={ay.id}>
                        {ay.yearName} (Aktif)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 3. KELAS */}
              <div>
                <label
                  htmlFor="teacher-login-class"
                  className="block font-medium text-slate-700 mb-1"
                >
                  3. Kelas *
                </label>
                {!teacherYearId || filteredTeacherClasses.length === 0 ? (
                  <div className="p-2.5 border border-slate-200 bg-slate-50 rounded-md text-slate-600">
                    Kelas belum tersedia untuk jenjang{' '}
                    <span className="font-semibold">
                      {LOGIN_EDUCATION_LEVEL_OPTIONS.find((o) => o.value === teacherLevel)?.label ||
                        teacherLevel}
                    </span>{' '}
                    pada tahun ajaran yang dipilih. Pastikan Admin Yayasan telah mendaftarkan kelas aktif.
                  </div>
                ) : (
                  <select
                    id="teacher-login-class"
                    required
                    value={teacherClassId}
                    onChange={(e) => {
                      setTeacherClassId(e.target.value);
                      setLocalError(null);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-900"
                  >
                    <option value="">-- Pilih Kelas Penugasan --</option>
                    {filteredTeacherClasses.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} (Tingkat {cls.level}
                        {cls.educationUnitName ? ` · ${cls.educationUnitName}` : ''})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 4. EMAIL GURU & 5. PASSWORD */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor="teacher-login-email"
                    className="block font-medium text-slate-700 mb-1"
                  >
                    4. Email Guru *
                  </label>
                  <input
                    id="teacher-login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="guru@alchasanah.sch.id"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-900"
                  />
                </div>
                <PasswordField
                  id="teacher-login-password"
                  label="5. Password *"
                  value={password}
                  onChange={setPassword}
                />
              </div>

              {/* 6. MASUK KE PORTAL GURU */}
              <button
                type="submit"
                disabled={
                  loading || activeYears.length === 0 || filteredTeacherClasses.length === 0
                }
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-medium transition-colors disabled:opacity-60 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {loading ? 'Memverifikasi Penugasan Kelas...' : 'MASUK KE PORTAL GURU'}
                </span>
              </button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-slate-500">
                    atau masuk dengan Google Guru terdaftar
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTeacherGoogleClick}
                disabled={
                  loading || activeYears.length === 0 || filteredTeacherClasses.length === 0
                }
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium disabled:opacity-60 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Masuk dengan Google (Guru / Wali Kelas)</span>
              </button>
            </form>
          )}

          {/* PORTAL 3 & 4: ADMIN KOMITE & ADMIN YAYASAN (Email/Password utama + Google sekunder) */}
          {(activeDef.key === 'committee' || activeDef.key === 'foundation') && (
            <form onSubmit={handleAdminEmailSubmit} className="space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-slate-700 space-y-1">
                <p className="font-medium text-slate-900">{activeDef.rolesText}</p>
                <p className="text-slate-600 leading-relaxed">
                  Gunakan Email dan Password akun administrator terdaftar pada Firebase Authentication atau Google Sign-In. Sistem memverifikasi peran aktual dan status ACTIVE dari Cloud Firestore.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="admin-login-email"
                    className="block font-medium text-slate-700 mb-1"
                  >
                    Email Administrator *
                  </label>
                  <input
                    id="admin-login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      activeDef.key === 'committee'
                        ? 'komite@alchasanah.sch.id'
                        : 'admin@alchasanah.sch.id'
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-900"
                  />
                </div>
                <PasswordField
                  id="admin-login-password"
                  label="Password *"
                  value={password}
                  onChange={setPassword}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-medium transition-colors disabled:opacity-60 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {loading
                    ? 'Memverifikasi Akun...'
                    : `Masuk ke ${activeDef.title}`}
                </span>
              </button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-slate-500">
                    atau masuk menggunakan Google Sign-In
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePortalGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium disabled:opacity-60 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Masuk dengan Google</span>
              </button>
            </form>
          )}
        </div>
      )}

      <footer className="max-w-5xl w-full mx-auto text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <span>
          {FOUNDATION_BRAND.foundationName} · {FOUNDATION_BRAND.reportSubtitle}
        </span>
        <span>{FOUNDATION_BRAND.levelsSummary}</span>
      </footer>
    </div>
  );
}

export function StudentSelectionMismatchGate({
  email,
  reason,
  code,
  onSignOut,
}: {
  email?: string | null;
  reason: string;
  code?: string;
  onSignOut: () => Promise<void>;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border border-red-200 border-t-4 border-t-emerald-800 rounded-lg p-8 space-y-5">
        <FoundationBrand variant="portal" className="pb-4 border-b border-slate-200" />
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-red-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-mono text-xs font-semibold text-red-700">
              LOGIN SISWA DITOLAK · {code || 'PLACEMENT_VERIFICATION_FAILED'}
            </p>
            <h1 className="font-display text-lg font-semibold text-slate-900 mt-1">
              Validasi Data &amp; Status Siswa Gagal
            </h1>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              {email ? (
                <>
                  Akun <span className="font-medium text-slate-900">{email}</span>:{' '}
                </>
              ) : null}
              {reason}
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 space-y-1">
          <p>
            Sistem tidak memberikan akses dashboard siswa dan tidak mengubah data kelas, jenjang, atau tahun ajaran secara otomatis.
          </p>
          <p>
            Hubungi Admin Yayasan apabila data siswa Anda belum ditautkan atau perlu pembaruan penempatan kelas.
          </p>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-medium cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout &amp; Kembali ke Portal Login</span>
        </button>
      </div>
    </div>
  );
}

export function TeacherSelectionMismatchGate({
  email,
  reason,
  code,
  onSignOut,
}: {
  email?: string | null;
  reason: string;
  code?: string;
  onSignOut: () => Promise<void>;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border border-red-200 border-t-4 border-t-emerald-800 rounded-lg p-8 space-y-5">
        <FoundationBrand variant="portal" className="pb-4 border-b border-slate-200" />
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-red-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-mono text-xs font-semibold text-red-700">
              LOGIN GURU DITOLAK · {code || 'TEACHER_ASSIGNMENT_VERIFICATION_FAILED'}
            </p>
            <h1 className="font-display text-lg font-semibold text-slate-900 mt-1">
              Validasi Penugasan Kelas Guru Gagal
            </h1>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              {email ? (
                <>
                  Akun <span className="font-medium text-slate-900">{email}</span>:{' '}
                </>
              ) : null}
              {reason}
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 space-y-1">
          <p>
            Anda tidak terdaftar sebagai pengajar pada kelas yang dipilih. Sistem menolak akses dashboard dan tidak mengubah data penugasan secara otomatis.
          </p>
          <p>
            Silakan periksa kembali Jenjang Pendidikan, Tahun Ajaran, dan Kelas penugasan Anda atau hubungi Admin Yayasan.
          </p>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-medium cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout &amp; Kembali ke Portal Login</span>
        </button>
      </div>
    </div>
  );
}

export function PortalMismatchGate({
  profile,
  selectedPortal,
  onEnterAuthorizedPortal,
  onSignOut,
}: {
  profile: UserProfile;
  selectedPortal: LoginPortal;
  onEnterAuthorizedPortal: () => void;
  onSignOut: () => Promise<void>;
}) {
  const canonicalRole = normalizeRole(profile.role);
  const actualPortal = portalForRole(canonicalRole);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border border-slate-200 border-t-4 border-t-emerald-800 rounded-lg p-8 space-y-5">
        <FoundationBrand variant="portal" className="pb-4 border-b border-slate-200" />
        <div className="flex items-start gap-3 text-red-800">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-mono text-xs font-semibold text-red-700">
              AKSES PORTAL DITOLAK · KATEGORI TIDAK SESUAI
            </p>
            <h1 className="font-display text-lg font-semibold text-slate-900 mt-1">
              Kategori Akun Tidak Sesuai dengan Portal yang Dipilih
            </h1>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Akun <span className="font-medium text-slate-900">{profile.email}</span> memiliki role{' '}
              <span className="font-semibold text-slate-900">{roleLabel(canonicalRole)}</span> pada Firestore, sehingga ditolak masuk melalui{' '}
              <span className="font-semibold text-slate-900">{portalLabel(selectedPortal)}</span>{' '}
              (<span className="font-mono">{loginRouteForPortal(selectedPortal)}</span>).
            </p>
          </div>
        </div>

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 space-y-1">
          <p>
            Portal resmi sesuai role akun Anda:{' '}
            <span className="font-semibold text-slate-900">{portalLabel(actualPortal)}</span>
          </p>
          <p>
            Sistem tidak mengubah role akun secara otomatis dan tidak menampilkan dashboard sebelum login melalui portal yang sesuai.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <button
            type="button"
            onClick={onEnterAuthorizedPortal}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-medium cursor-pointer"
          >
            <span>Buka {portalLabel(actualPortal)}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout &amp; Kembali ke Pilihan Portal</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccountDisabledGate({
  profile,
  onSignOut,
}: {
  profile: UserProfile;
  onSignOut: () => Promise<void>;
}) {
  const status = profile.account_status.toUpperCase();
  const statusTitle =
    status === 'PENDING_VERIFICATION'
      ? 'Menunggu Verifikasi Email Akun'
      : status === 'SUSPENDED'
      ? 'Akun Ditangguhkan Sementara (SUSPENDED)'
      : status === 'REVOKED'
      ? 'Akses Akun Dicabut Permanen (REVOKED)'
      : status === 'ARCHIVED'
      ? 'Akun Diarsipkan (ARCHIVED)'
      : 'Akun Tidak Aktif (INACTIVE)';

  const statusDetail =
    status === 'PENDING_VERIFICATION'
      ? 'Akun Anda masih berstatus PENDING_VERIFICATION. Silakan selesaikan verifikasi email resmi sebelum mengakses sistem SIAKHLAK.'
      : status === 'SUSPENDED'
      ? 'Akses akun Anda ditangguhkan sementara (SUSPENDED). Hubungi Super Admin atau Admin Yayasan untuk peninjauan status akun.'
      : status === 'REVOKED'
      ? 'Kewenangan dan akses akun Anda telah dicabut (REVOKED) dari sistem SIAKHLAK. Hubungi administrator yayasan apabila terdapat kekeliruan.'
      : 'Hubungi Admin Yayasan atau Super Admin untuk mengaktifkan kembali akun Anda.';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border border-red-200 border-t-4 border-t-emerald-800 rounded-lg p-8 space-y-5">
        <FoundationBrand variant="portal" className="pb-4 border-b border-slate-200" />
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-red-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-mono text-xs font-semibold text-red-700">
              STATUS AKUN: {status}
            </p>
            <h1 className="font-display text-lg font-semibold text-slate-900 mt-1">
              {statusTitle}
            </h1>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Akun <span className="font-medium text-slate-900">{profile.email}</span> pada organisasi{' '}
              <span className="font-mono">{profile.organization_id}</span> saat ini berstatus{' '}
              <span className="font-semibold text-red-800">{status}</span>. {statusDetail}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-medium cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout &amp; Kembali ke Halaman Awal</span>
        </button>
      </div>
    </div>
  );
}

export function EmailVerificationRequiredGate({
  email,
  onSignOut,
}: {
  email?: string | null;
  onSignOut: () => Promise<void>;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border border-amber-200 border-t-4 border-t-emerald-800 rounded-lg p-8 space-y-5">
        <FoundationBrand variant="portal" className="pb-4 border-b border-slate-200" />
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-mono text-xs font-semibold text-amber-800">
              VERIFIKASI EMAIL WAJIB · EMAIL_NOT_VERIFIED
            </p>
            <h1 className="font-display text-lg font-semibold text-slate-900 mt-1">
              Email Akun Belum Terverifikasi
            </h1>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Token autentikasi Firebase untuk akun{' '}
              <span className="font-medium text-slate-900">{email || '-'}</span> belum memiliki status{' '}
              <span className="font-mono font-semibold">email_verified = true</span>. Sistem menolak akses dashboard sebelum email terverifikasi.
            </p>
          </div>
        </div>
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600">
          Silakan buka tautan verifikasi pada kotak masuk email Anda atau hubungi administrator yayasan.
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-medium cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout &amp; Kembali ke Halaman Awal</span>
        </button>
      </div>
    </div>
  );
}
