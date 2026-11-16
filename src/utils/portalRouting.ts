import {
  ActiveMenuKey,
  CanonicalRole,
  CoreMenuKey,
  KomiteMenuKey,
  LoginPortal,
  MasterSubmenuKey,
  normalizeRole,
  normalizeRolesList,
  portalForRole,
  portalFromLoginRoute,
  StudentParentMenuKey,
  UserRole,
} from '../types/siakhlak';

const STUDENT_ONLY_MENUS: readonly StudentParentMenuKey[] = [
  'siswa_dashboard',
  'siswa_profil',
  'siswa_mutabaah',
];

const PARENT_ONLY_MENUS: readonly StudentParentMenuKey[] = [
  'siswa_dashboard',
  'siswa_profil',
  'siswa_akhlak',
  'siswa_mutabaah',
  'siswa_riwayat',
];

const TEACHER_ALLOWED_CORE_MENUS: readonly CoreMenuKey[] = [
  'core_dashboard',
  'core_penilaian_akhlak',
  'core_program_keagamaan',
  'core_tindak_lanjut_unit',
  'core_master_data',
  'profil_saya',
];

const KOMITE_ALLOWED_MENUS: readonly (KomiteMenuKey | 'profil_saya')[] = [
  'komite_dashboard',
  'komite_monitoring_agama',
  'komite_evaluasi_program',
  'komite_monitoring_akhlak',
  'komite_monitoring_mutabaah',
  'komite_temuan_rekomendasi',
  'komite_rapat_keputusan',
  'komite_tindak_lanjut',
  'komite_laporan',
  'profil_saya',
];

export const ROUTE_TO_MENU: Record<string, ActiveMenuKey> = {
  '/student/dashboard': 'siswa_dashboard',
  '/student/profile': 'siswa_profil',
  '/student/assessments': 'siswa_akhlak',
  '/student/mutabaah': 'siswa_mutabaah',
  '/student/history': 'siswa_riwayat',

  '/parent/dashboard': 'siswa_dashboard',
  '/parent/profile': 'siswa_profil',
  '/parent/assessments': 'siswa_akhlak',
  '/parent/mutabaah': 'siswa_mutabaah',
  '/parent/history': 'siswa_riwayat',

  '/teacher/dashboard': 'core_dashboard',
  '/teacher/profile': 'profil_saya',
  '/teacher/assessments': 'core_penilaian_akhlak',
  '/teacher/programs': 'core_program_keagamaan',
  '/teacher/mutabaah': 'core_program_keagamaan',
  '/teacher/follow-up': 'core_tindak_lanjut_unit',
  '/teacher/classes': 'core_master_data',

  '/committee/dashboard': 'komite_dashboard',
  '/committee/profile': 'profil_saya',
  '/committee/monitoring-agama': 'komite_monitoring_agama',
  '/committee/evaluasi-program': 'komite_evaluasi_program',
  '/committee/monitoring-akhlak': 'komite_monitoring_akhlak',
  '/committee/monitoring-mutabaah': 'komite_monitoring_mutabaah',
  '/committee/temuan-rekomendasi': 'komite_temuan_rekomendasi',
  '/committee/rapat-keputusan': 'komite_rapat_keputusan',
  '/committee/tindak-lanjut': 'komite_tindak_lanjut',
  '/committee/laporan': 'komite_laporan',

  '/foundation/dashboard': 'core_dashboard',
  '/foundation/profile': 'profil_saya',
  '/foundation/operational': 'core_dashboard',
  '/foundation/assessments': 'core_penilaian_akhlak',
  '/foundation/programs': 'core_program_keagamaan',
  '/foundation/follow-up': 'core_tindak_lanjut_unit',
  '/foundation/master-data': 'core_master_data',
  '/foundation/assignments': 'core_master_data',
  '/foundation/users': 'core_pengaturan_sistem',
  '/foundation/settings': 'core_pengaturan_sistem',
  '/foundation/audit-trail': 'core_audit_trail',
  '/foundation/committee': 'komite_dashboard',
};

const MASTER_ROUTE_SUBMENU_MAP: Record<string, MasterSubmenuKey> = {
  '/foundation/master-data/units': 'unit_pendidikan',
  '/foundation/master-data/cohorts': 'data_angkatan',
  '/foundation/master-data/academic-years': 'tahun_ajaran',
  '/foundation/master-data/semesters': 'semester',
  '/foundation/master-data/classes': 'data_kelas',
  '/foundation/master-data/students': 'data_siswa',
  '/foundation/master-data/guardians': 'data_orang_tua',
  '/foundation/master-data/teachers': 'data_guru',
  '/foundation/master-data/assignments': 'penugasan_guru',
  '/foundation/master-data/committee': 'anggota_komite',
  '/foundation/master-data/admins': 'admin_yayasan',
  '/foundation/master-data/relations': 'relasi_wali',
  '/foundation/master-data/users': 'manajemen_user',
  '/foundation/master-data/permissions': 'role_permission',
  '/foundation/master-data/audit': 'audit_trail',
};

export function parseMasterSubmenuFromRoute(pathname: string): MasterSubmenuKey | null {
  const clean = pathname.trim().toLowerCase().replace(/\/+$/, '');
  return MASTER_ROUTE_SUBMENU_MAP[clean] || null;
}

export function defaultMenuForRole(role: UserRole): ActiveMenuKey {
  const canonical = normalizeRole(role);
  if (canonical === 'STUDENT' || canonical === 'PARENT') return 'siswa_dashboard';
  if (canonical === 'COMMITTEE_ADMIN') return 'komite_dashboard';
  return 'core_dashboard';
}

export function isMenuAuthorizedForRole(menu: ActiveMenuKey, role: UserRole): boolean {
  const canonical = normalizeRole(role);
  if (canonical === 'SUPER_ADMIN' || canonical === 'FOUNDATION_ADMIN') {
    return !(PARENT_ONLY_MENUS as readonly string[]).includes(menu);
  }
  if (canonical === 'COMMITTEE_ADMIN') {
    return (KOMITE_ALLOWED_MENUS as readonly string[]).includes(menu);
  }
  if (canonical === 'TEACHER' || canonical === 'HOMEROOM_TEACHER') {
    return (TEACHER_ALLOWED_CORE_MENUS as readonly string[]).includes(menu);
  }
  if (canonical === 'PARENT') {
    return (PARENT_ONLY_MENUS as readonly string[]).includes(menu);
  }
  if (canonical === 'STUDENT') {
    return (STUDENT_ONLY_MENUS as readonly string[]).includes(menu);
  }
  return false;
}

export function routePathForMenu(menu: ActiveMenuKey, role: UserRole): string {
  const canonical = normalizeRole(role);
  if (canonical === 'STUDENT') {
    switch (menu) {
      case 'siswa_profil':
        return '/student/profile';
      case 'siswa_akhlak':
        return '/student/assessments';
      case 'siswa_mutabaah':
        return '/student/mutabaah';
      case 'siswa_riwayat':
        return '/student/history';
      default:
        return '/student/dashboard';
    }
  }
  if (canonical === 'PARENT') {
    switch (menu) {
      case 'siswa_profil':
        return '/parent/profile';
      case 'siswa_akhlak':
        return '/parent/assessments';
      case 'siswa_mutabaah':
        return '/parent/mutabaah';
      case 'siswa_riwayat':
        return '/parent/history';
      default:
        return '/parent/dashboard';
    }
  }
  if (canonical === 'TEACHER' || canonical === 'HOMEROOM_TEACHER') {
    switch (menu) {
      case 'profil_saya':
        return '/teacher/profile';
      case 'core_penilaian_akhlak':
        return '/teacher/assessments';
      case 'core_program_keagamaan':
        return '/teacher/programs';
      case 'core_tindak_lanjut_unit':
        return '/teacher/follow-up';
      case 'core_master_data':
        return '/teacher/classes';
      default:
        return '/teacher/dashboard';
    }
  }
  if (canonical === 'COMMITTEE_ADMIN') {
    switch (menu) {
      case 'profil_saya':
        return '/committee/profile';
      case 'komite_monitoring_agama':
        return '/committee/monitoring-agama';
      case 'komite_evaluasi_program':
        return '/committee/evaluasi-program';
      case 'komite_monitoring_akhlak':
        return '/committee/monitoring-akhlak';
      case 'komite_monitoring_mutabaah':
        return '/committee/monitoring-mutabaah';
      case 'komite_temuan_rekomendasi':
        return '/committee/temuan-rekomendasi';
      case 'komite_rapat_keputusan':
        return '/committee/rapat-keputusan';
      case 'komite_tindak_lanjut':
        return '/committee/tindak-lanjut';
      case 'komite_laporan':
        return '/committee/laporan';
      default:
        return '/committee/dashboard';
    }
  }
  // FOUNDATION_ADMIN
  switch (menu) {
    case 'profil_saya':
      return '/foundation/profile';
    case 'core_dashboard':
      return '/foundation/dashboard';
    case 'core_penilaian_akhlak':
      return '/foundation/assessments';
    case 'core_program_keagamaan':
      return '/foundation/programs';
    case 'core_tindak_lanjut_unit':
      return '/foundation/follow-up';
    case 'core_master_data':
      return '/foundation/master-data';
    case 'core_pengaturan_sistem':
      return '/foundation/settings';
    case 'core_audit_trail':
      return '/foundation/audit-trail';
    case 'komite_dashboard':
      return '/committee/dashboard';
    case 'komite_monitoring_agama':
      return '/committee/monitoring-agama';
    case 'komite_evaluasi_program':
      return '/committee/evaluasi-program';
    case 'komite_monitoring_akhlak':
      return '/committee/monitoring-akhlak';
    case 'komite_monitoring_mutabaah':
      return '/committee/monitoring-mutabaah';
    case 'komite_temuan_rekomendasi':
      return '/committee/temuan-rekomendasi';
    case 'komite_rapat_keputusan':
      return '/committee/rapat-keputusan';
    case 'komite_tindak_lanjut':
      return '/committee/tindak-lanjut';
    case 'komite_laporan':
      return '/committee/laporan';
    default:
      return '/foundation/dashboard';
  }
}

export function isProtectedRoutePath(pathname: string): boolean {
  const clean = pathname.trim().toLowerCase().replace(/\/+$/, '');
  return (
    clean.startsWith('/student') ||
    clean.startsWith('/parent') ||
    clean.startsWith('/teacher') ||
    clean.startsWith('/committee') ||
    clean.startsWith('/foundation')
  );
}

export function parseMenuFromRoute(pathname: string): ActiveMenuKey | null {
  const clean = pathname.trim().toLowerCase().replace(/\/+$/, '');
  if (!clean || clean === '/' || portalFromLoginRoute(clean) !== null) {
    return null;
  }
  if (clean in ROUTE_TO_MENU) {
    return ROUTE_TO_MENU[clean];
  }
  if (clean.startsWith('/foundation/master-data')) {
    return 'core_master_data';
  }
  if (clean.startsWith('/student/') || clean.startsWith('/parent/')) return 'siswa_dashboard';
  if (clean.startsWith('/teacher/')) return 'core_dashboard';
  if (clean.startsWith('/committee/')) return 'komite_dashboard';
  if (clean.startsWith('/foundation/')) return 'core_dashboard';
  return null;
}

export function isRoutePathAuthorizedForRole(pathname: string, role: UserRole): boolean {
  const clean = pathname.trim().toLowerCase().replace(/\/+$/, '');
  if (!clean || clean === '/' || portalFromLoginRoute(clean) !== null) {
    return true;
  }
  const canonical = normalizeRole(role);
  if (clean.startsWith('/student/')) {
    if (canonical !== 'STUDENT') return false;
    if (clean === '/student/assessments' || clean === '/student/history') return false;
    const parsed = parseMenuFromRoute(clean);
    return parsed ? isMenuAuthorizedForRole(parsed, 'STUDENT') : false;
  }
  if (clean.startsWith('/parent/')) {
    return canonical === 'PARENT';
  }
  if (clean.startsWith('/teacher/')) {
    return canonical === 'TEACHER' || canonical === 'HOMEROOM_TEACHER';
  }
  if (clean.startsWith('/committee/')) {
    return (
      canonical === 'COMMITTEE_ADMIN' ||
      canonical === 'FOUNDATION_ADMIN' ||
      canonical === 'SUPER_ADMIN'
    );
  }
  if (clean.startsWith('/foundation/')) {
    return canonical === 'FOUNDATION_ADMIN' || canonical === 'SUPER_ADMIN';
  }
  return false;
}

export function checkPortalAccess(
  rolesInput: UserRole | readonly UserRole[],
  selectedPortal: LoginPortal
): {
  allowed: boolean;
  officialPortal: LoginPortal;
  primaryRole: CanonicalRole;
} {
  const roles = Array.isArray(rolesInput)
    ? normalizeRolesList(rolesInput as readonly UserRole[])
    : [normalizeRole(rolesInput as UserRole)];
  const primaryRole = roles[0] || 'STUDENT';

  const allowedPortals = new Set(roles.map((r) => portalForRole(r)));
  return {
    allowed: allowedPortals.has(selectedPortal),
    officialPortal: portalForRole(primaryRole),
    primaryRole,
  };
}

export const SELECTED_PORTAL_STORAGE_KEY = 'siakhlak_selected_portal';
export const PORTAL_CHECK_ACTIVE_KEY = 'siakhlak_portal_intent';
export const LOGIN_AUTH_METHOD_KEY = 'siakhlak_auth_method';
export const STUDENT_LOGIN_MODE_KEY = 'siakhlak_student_login_mode';
export const STUDENT_LOGIN_SELECTION_KEY = 'siakhlak_student_login_selection';
export const TEACHER_LOGIN_SELECTION_KEY = 'siakhlak_teacher_login_selection';

export function parseStudentSelectionFromUrlSearch(search: string): {
  educationLevel?: string;
  educationUnitId?: string;
  academicYearId?: string;
  classId?: string;
} | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(search);
    const educationLevel = params.get('level') || params.get('educationLevel') || params.get('jenjang') || undefined;
    const educationUnitId = params.get('unit') || params.get('educationUnitId') || params.get('unitId') || undefined;
    const academicYearId = params.get('academicYearId') || params.get('yearId') || params.get('tahunAjaran') || undefined;
    const classId = params.get('classId') || params.get('kelas') || undefined;
    if (!educationLevel && !educationUnitId && !academicYearId && !classId) {
      return null;
    }
    return { educationLevel, educationUnitId, academicYearId, classId };
  } catch {
    return null;
  }
}

export const parseTeacherSelectionFromUrlSearch = parseStudentSelectionFromUrlSearch;

export function clearClientSessionStorage(): void {
  try {
    if (typeof window === 'undefined') return;
    const clearStore = (store: Storage) => {
      const keysToDelete: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const k = store.key(i);
        if (k && (k.startsWith('siakhlak_') || k.startsWith('firebase:'))) {
          keysToDelete.push(k);
        }
      }
      keysToDelete.forEach((k) => store.removeItem(k));
    };
    clearStore(window.sessionStorage);
    clearStore(window.localStorage);
  } catch {
    // Ignore storage errors in restricted contexts
  }
}
