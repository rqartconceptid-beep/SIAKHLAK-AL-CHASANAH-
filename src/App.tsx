import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { LogOut, ShieldAlert } from 'lucide-react';
import { auth, googleProvider, testFirestoreConnection } from './lib/firebase';
import {
  ensureUserProfile,
  fetchRegisteredUserProfile,
  formatFirebaseAuthError,
  subscribeAllUsers,
  subscribeClassScopedCollection,
  subscribeCollection,
  subscribeLinkedStudentsForPortal,
  subscribeOwnOnboardingDocs,
  subscribePublishedCollectionForStudents,
  subscribeStudentLoginCatalog,
  subscribeTeacherClassAssignments,
  subscribeTeacherImportLogs,
  subscribeUserPermissions,
  subscribeUserProfile,
  subscribeVerifiedGuardiansForParent,
  subscribeVerifiedStudentsForParent,
  validateStudentLoginPlacement,
  validateTeacherLoginAssignment,
} from './services/siakhlakService';
import {
  AcademicPeriod,
  AcademicYearDoc,
  ActiveMenuKey,
  AuditLog,
  ClassAssignment,
  ClassStudentHistory,
  Cohort,
  CommitteeMemberProfile,
  DbConnectionStatus,
  DEFAULT_ORGANIZATION_ID,
  defaultPermissionsForRole,
  EDUCATION_LEVELS,
  EducationUnit,
  ExcelImportLog,
  FoundationAdminProfile,
  GuardianProfile,
  isAccountActive,
  isFoundationOrSuperAdmin,
  KomiteDecision,
  KomiteFinding,
  KomiteMeeting,
  KomiteReport,
  LoginPortal,
  loginRouteForPortal,
  MasterSubmenuKey,
  MutabaahLog,
  normalizeAccountStatus,
  normalizeEducationLevel,
  normalizeRole,
  portalForRole,
  portalFromLoginRoute,
  ReligiousProgram,
  roleLabel,
  SchoolClass,
  SemesterDoc,
  Student,
  StudentAssessment,
  StudentGuardian,
  StudentLoginSelection,
  StudentParentMenuKey,
  SystemConfig,
  Teacher,
  TeacherLoginSelection,
  UnitAggregate,
  UnitCode,
  UserPermissionsDoc,
  UserProfile,
} from './types/siakhlak';
import {
  checkPortalAccess,
  clearClientSessionStorage,
  defaultMenuForRole,
  isMenuAuthorizedForRole,
  isProtectedRoutePath,
  isRoutePathAuthorizedForRole,
  LOGIN_AUTH_METHOD_KEY,
  parseMasterSubmenuFromRoute,
  parseMenuFromRoute,
  parseStudentSelectionFromUrlSearch,
  parseTeacherSelectionFromUrlSearch,
  PORTAL_CHECK_ACTIVE_KEY,
  routePathForMenu,
  SELECTED_PORTAL_STORAGE_KEY,
  STUDENT_LOGIN_MODE_KEY,
  STUDENT_LOGIN_SELECTION_KEY,
  TEACHER_LOGIN_SELECTION_KEY,
} from './utils/portalRouting';
import {
  AccountDisabledGate,
  AuthGate,
  EmailVerificationRequiredGate,
  PortalMismatchGate,
  StudentSelectionMismatchGate,
  TeacherSelectionMismatchGate,
} from './components/AuthGate';
import { ProfileOnboardingGate } from './components/profile/ProfileOnboardingGate';
import { MyProfileView } from './components/profile/MyProfileView';
import { Sidebar } from './components/Sidebar';
import { DbStatusBadge } from './components/ui/Primitives';
import { FOUNDATION_BRAND, FoundationBrand } from './components/branding/FoundationBrand';

// Komite Pendidikan Agama Modules (9 Menus)
import { KomiteDashboard } from './components/komite/KomiteDashboard';
import { MonitoringPendidikanAgama } from './components/komite/MonitoringPendidikanAgama';
import { EvaluasiProgramKeagamaan } from './components/komite/EvaluasiProgramKeagamaan';
import { MonitoringAkhlak } from './components/komite/MonitoringAkhlak';
import { MonitoringMutabaah } from './components/komite/MonitoringMutabaah';
import { TemuanRekomendasi } from './components/komite/TemuanRekomendasi';
import { RapatKeputusan } from './components/komite/RapatKeputusan';
import { TindakLanjutRekomendasi } from './components/komite/TindakLanjutRekomendasi';
import { LaporanKomite } from './components/komite/LaporanKomite';

// Preserved Core SIAKHLAK Modules
import { CoreDashboard } from './components/core/CoreDashboard';
import { CoreMasterData } from './components/core/CoreMasterData';
import { CoreAssessmentModule } from './components/core/CoreAssessmentModule';
import { CoreProgramsModule } from './components/core/CoreProgramsModule';
import { CoreUnitFollowUp } from './components/core/CoreUnitFollowUp';
import { CoreSystemSettings } from './components/core/CoreSystemSettings';
import { CoreAuditTrail } from './components/core/CoreAuditTrail';

// Student & Parent Portal Module
import { StudentParentPortal } from './components/student/StudentParentPortal';

function isValidPortalValue(val: string | null): val is LoginPortal {
  return (
    val === 'parent_student' ||
    val === 'teacher' ||
    val === 'committee' ||
    val === 'foundation'
  );
}

function readInitialLoginPortalFromUrl(): LoginPortal | null {
  if (typeof window === 'undefined') return null;
  return portalFromLoginRoute(window.location.pathname);
}

function readStoredPortal(): LoginPortal {
  const fromUrl = readInitialLoginPortalFromUrl();
  if (fromUrl) return fromUrl;
  try {
    const val = window.sessionStorage.getItem(SELECTED_PORTAL_STORAGE_KEY);
    if (isValidPortalValue(val)) return val;
  } catch {
    // Ignore storage read failure
  }
  return 'parent_student';
}

function readPortalIntentFlag(): boolean {
  try {
    return window.sessionStorage.getItem(PORTAL_CHECK_ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
}

function readStudentLoginMode(): 'student' | 'parent' | null {
  try {
    const val = window.sessionStorage.getItem(STUDENT_LOGIN_MODE_KEY);
    if (val === 'student' || val === 'parent') return val;
    return null;
  } catch {
    return null;
  }
}

function readStoredStudentSelection(): StudentLoginSelection | null {
  try {
    const raw = window.sessionStorage.getItem(STUDENT_LOGIN_SELECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudentLoginSelection>;
    if (!parsed || !parsed.educationLevel || !parsed.academicYearId || !parsed.classId) {
      return null;
    }
    return {
      educationLevel: normalizeEducationLevel(parsed.educationLevel),
      educationUnitId: parsed.educationUnitId,
      academicYearId: parsed.academicYearId,
      classId: parsed.classId,
    };
  } catch {
    return null;
  }
}

function readAuthMethod(): 'email' | 'google' | null {
  try {
    const val = window.sessionStorage.getItem(LOGIN_AUTH_METHOD_KEY);
    if (val === 'email' || val === 'google') return val;
    return null;
  } catch {
    return null;
  }
}

function readStoredTeacherSelection(): TeacherLoginSelection | null {
  try {
    const raw = window.sessionStorage.getItem(TEACHER_LOGIN_SELECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TeacherLoginSelection>;
    if (!parsed || !parsed.educationLevel || !parsed.academicYearId || !parsed.classId) {
      return null;
    }
    return {
      educationLevel: normalizeEducationLevel(parsed.educationLevel),
      educationUnitId: parsed.educationUnitId,
      academicYearId: parsed.academicYearId,
      classId: parsed.classId,
    };
  } catch {
    return null;
  }
}

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userPermissionsDoc, setUserPermissionsDoc] = useState<UserPermissionsDoc | null>(null);
  const [dbStatus, setDbStatus] = useState<DbConnectionStatus>('CHECKING');
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeLoginRoutePortal, setActiveLoginRoutePortal] = useState<LoginPortal | null>(
    readInitialLoginPortalFromUrl
  );
  const [selectedPortal, setSelectedPortal] = useState<LoginPortal>(readStoredPortal);
  const [verifyPortalMatch, setVerifyPortalMatch] = useState<boolean>(readPortalIntentFlag);
  const [studentLoginSelection, setStudentLoginSelection] = useState<StudentLoginSelection | null>(
    readStoredStudentSelection
  );
  const [teacherLoginSelection, setTeacherLoginSelection] = useState<TeacherLoginSelection | null>(
    readStoredTeacherSelection
  );
  const [selectedTeacherClassId, setSelectedTeacherClassId] = useState<string>(
    () => readStoredTeacherSelection()?.classId || ''
  );
  const [studentDocLoaded, setStudentDocLoaded] = useState(false);
  const [teacherAssignmentsLoaded, setTeacherAssignmentsLoaded] = useState(false);
  const [loginCatalogLoaded, setLoginCatalogLoaded] = useState(false);
  const [loginAcademicYears, setLoginAcademicYears] = useState<AcademicYearDoc[]>([]);
  const [loginClasses, setLoginClasses] = useState<SchoolClass[]>([]);
  const [loginUnits, setLoginUnits] = useState<EducationUnit[]>([]);
  const [activeMenu, setActiveMenu] = useState<ActiveMenuKey>('core_dashboard');
  const [masterSubmenu, setMasterSubmenu] = useState<MasterSubmenuKey | null>(() =>
    typeof window !== 'undefined' ? parseMasterSubmenuFromRoute(window.location.pathname) : null
  );
  const [unauthorizedRoute, setUnauthorizedRoute] = useState<string | null>(null);

  // Live Own Onboarding / Entity Profile Docs (used by PENDING onboarding & Profil Saya)
  const [ownOnboardingDocs, setOwnOnboardingDocs] = useState<{
    student?: Student | null;
    guardian?: GuardianProfile | null;
    teacher?: Teacher | null;
    committee?: CommitteeMemberProfile | null;
    foundationAdmin?: FoundationAdminProfile | null;
  }>({});

  // Firestore Live Collections
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [units, setUnits] = useState<EducationUnit[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearDoc[]>([]);
  const [semesters, setSemesters] = useState<SemesterDoc[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classHistory, setClassHistory] = useState<ClassStudentHistory[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [guardians, setGuardians] = useState<GuardianProfile[]>([]);
  const [committeeMembers, setCommitteeMembers] = useState<CommitteeMemberProfile[]>([]);
  const [foundationAdmins, setFoundationAdmins] = useState<FoundationAdminProfile[]>([]);
  const [assessments, setAssessments] = useState<StudentAssessment[]>([]);
  const [mutabaahLogs, setMutabaahLogs] = useState<MutabaahLog[]>([]);
  const [importLogs, setImportLogs] = useState<ExcelImportLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [aggregates, setAggregates] = useState<UnitAggregate[]>([]);
  const [programs, setPrograms] = useState<ReligiousProgram[]>([]);
  const [findings, setFindings] = useState<KomiteFinding[]>([]);
  const [meetings, setMeetings] = useState<KomiteMeeting[]>([]);
  const [decisions, setDecisions] = useState<KomiteDecision[]>([]);
  const [reports, setReports] = useState<KomiteReport[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allUserPermissions, setAllUserPermissions] = useState<UserPermissionsDoc[]>([]);
  const [classAssignments, setClassAssignments] = useState<ClassAssignment[]>([]);
  const [studentGuardians, setStudentGuardians] = useState<StudentGuardian[]>([]);

  // Tracks active Firestore listeners for immediate synchronous detachment on logout
  const activeListenersRef = useRef<(() => void)[]>([]);
  const preservedAuthErrorRef = useRef<string | null>(null);

  const detachAllListeners = useCallback(() => {
    activeListenersRef.current.forEach((unsub) => {
      try {
        unsub();
      } catch {
        // Ignore teardown errors
      }
    });
    activeListenersRef.current = [];
  }, []);

  const clearAllClientState = useCallback(() => {
    detachAllListeners();
    setProfile(null);
    setUserPermissionsDoc(null);
    setOwnOnboardingDocs({});
    setSystemConfig(null);
    setUnits([]);
    setCohorts([]);
    setAcademicYears([]);
    setSemesters([]);
    setPeriods([]);
    setClasses([]);
    setClassHistory([]);
    setTeachers([]);
    setStudents([]);
    setGuardians([]);
    setCommitteeMembers([]);
    setFoundationAdmins([]);
    setAssessments([]);
    setMutabaahLogs([]);
    setImportLogs([]);
    setAuditLogs([]);
    setAggregates([]);
    setPrograms([]);
    setFindings([]);
    setMeetings([]);
    setDecisions([]);
    setReports([]);
    setAllUsers([]);
    setAllUserPermissions([]);
    setClassAssignments([]);
    setStudentGuardians([]);
    setMasterSubmenu(null);
    setUnauthorizedRoute(null);
    setAuthError(null);
    setVerifyPortalMatch(false);
    setStudentLoginSelection(null);
    setTeacherLoginSelection(null);
    setSelectedTeacherClassId('');
    setStudentDocLoaded(false);
    setTeacherAssignmentsLoaded(false);
    clearClientSessionStorage();
  }, [detachAllListeners]);

  const checkDb = useCallback(async () => {
    setDbStatus('CHECKING');
    const ok = await testFirestoreConnection();
    setDbStatus(ok ? 'CONNECTED' : 'NOT CONNECTED');
  }, []);

  useEffect(() => {
    checkDb();
    const handleOnline = () => checkDb();
    const handleOffline = () => setDbStatus('NOT CONNECTED');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkDb]);

  // Live pre-auth, teacher, and student/parent catalog of active units, academic years & classes
  useEffect(() => {
    const role = profile ? normalizeRole(profile.role) : null;
    const shouldSubscribeCatalog =
      !firebaseUser ||
      !profile ||
      role === 'STUDENT' ||
      role === 'PARENT' ||
      role === 'TEACHER' ||
      role === 'HOMEROOM_TEACHER';
    if (!shouldSubscribeCatalog) return;
    const unsub = subscribeStudentLoginCatalog(
      (yrs) => setLoginAcademicYears(yrs),
      (clsList) => {
        setLoginClasses(clsList);
        setLoginCatalogLoaded(true);
      },
      (err) => {
        console.error(err);
        setLoginCatalogLoaded(true);
      },
      (unitList) => setLoginUnits(unitList)
    );
    return () => unsub();
  }, [firebaseUser, profile]);

  // Merge user profile with live user_permissions doc
  const effectiveProfile = useMemo<UserProfile | null>(() => {
    if (!profile) return null;
    const canonicalRole = normalizeRole(profile.role);
    const mergedPerms =
      userPermissionsDoc?.permissions && userPermissionsDoc.permissions.length > 0
        ? userPermissionsDoc.permissions
        : profile.permissions && profile.permissions.length > 0
        ? profile.permissions
        : defaultPermissionsForRole(canonicalRole);
    const mergedStudentAccess =
      profile.allowIndividualStudentAccess ||
      mergedPerms.includes('committee:view_individual_students');
    return {
      ...profile,
      role: canonicalRole,
      permissions: mergedPerms,
      allowIndividualStudentAccess: mergedStudentAccess,
    };
  }, [profile, userPermissionsDoc]);

  const navigateBrowserPath = useCallback((path: string, replace = false) => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === path && !window.location.hash) return;
    if (replace) {
      window.history.replaceState(null, '', path);
    } else {
      window.history.pushState(null, '', path);
    }
  }, []);

  // Apply authorized menu + pathname synchronization
  const navigateToMenu = useCallback(
    (nextMenu: ActiveMenuKey) => {
      if (!effectiveProfile) return;
      const canonical = normalizeRole(effectiveProfile.role);
      if (!isMenuAuthorizedForRole(nextMenu, canonical)) {
        setUnauthorizedRoute(routePathForMenu(nextMenu, canonical));
        return;
      }
      setUnauthorizedRoute(null);
      setActiveMenu(nextMenu);
      navigateBrowserPath(routePathForMenu(nextMenu, canonical));
    },
    [effectiveProfile, navigateBrowserPath]
  );

  // Sync browser pathname navigation & enforce route guard (authenticated & logged-out back protection)
  useEffect(() => {
    const syncRoute = () => {
      const currentPath = window.location.pathname;
      const loginPortalFromPath = portalFromLoginRoute(currentPath);

      if (!firebaseUser || !effectiveProfile) {
        setActiveLoginRoutePortal(loginPortalFromPath);
        if (loginPortalFromPath) {
          setSelectedPortal(loginPortalFromPath);
        }
        // Block Browser Back onto protected dashboards when signed out
        if (isProtectedRoutePath(currentPath)) {
          navigateBrowserPath('/', true);
          setActiveLoginRoutePortal(null);
        }
        return;
      }

      // Signed in
      if (!firebaseUser.emailVerified || !isAccountActive(effectiveProfile.account_status)) {
        return;
      }

      const portalAccess = checkPortalAccess(effectiveProfile.roles, selectedPortal);
      if (verifyPortalMatch && !portalAccess.allowed) {
        return;
      }

      const canonical = normalizeRole(effectiveProfile.role);

      // If user hits / or /login/* while authenticated, route to their official role dashboard
      if (currentPath === '/' || loginPortalFromPath !== null) {
        const def = defaultMenuForRole(canonical);
        setUnauthorizedRoute(null);
        setMasterSubmenu(null);
        setActiveMenu(def);
        navigateBrowserPath(routePathForMenu(def, canonical), true);
        return;
      }

      if (!isRoutePathAuthorizedForRole(currentPath, canonical)) {
        setUnauthorizedRoute(currentPath);
        return;
      }

      const parsedMenu = parseMenuFromRoute(currentPath);
      if (!parsedMenu || !isMenuAuthorizedForRole(parsedMenu, canonical)) {
        setUnauthorizedRoute(currentPath);
        return;
      }

      setUnauthorizedRoute(null);
      setActiveMenu(parsedMenu);
      setMasterSubmenu(parseMasterSubmenuFromRoute(currentPath));
    };

    syncRoute();
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, [firebaseUser, effectiveProfile, selectedPortal, verifyPortalMatch, navigateBrowserPath]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const studentMode = readStudentLoginMode();
          const authMethod = readAuthMethod();
          const isPasswordProvider =
            user.providerData?.length > 0 &&
            user.providerData.every((pd) => pd.providerId === 'password');
          const requireRegisteredProfile =
            authMethod === 'email' || isPasswordProvider || studentMode === 'student';

          if (requireRegisteredProfile) {
            // Strict Registered Profile check for Email/Password & Student logins: NEVER auto-create user doc
            const registered = await fetchRegisteredUserProfile(user.uid);
            if (!registered) {
              const msg =
                'Profil akun Anda belum terdaftar di sistem SIAKHLAK. Hubungi Admin Yayasan untuk pembuatan akun.';
              preservedAuthErrorRef.current = msg;
              setAuthError(msg);
              clearClientSessionStorage();
              setStudentLoginSelection(null);
              setTeacherLoginSelection(null);
              try {
                await signOut(auth);
              } catch {
                // Ignore sign-out cleanup error
              }
              setAuthReady(true);
              return;
            }
            setProfile(registered);
            const canonical = normalizeRole(registered.role);
            const requestedFromRoute = parseMenuFromRoute(window.location.pathname);
            if (
              requestedFromRoute &&
              isRoutePathAuthorizedForRole(window.location.pathname, canonical) &&
              isMenuAuthorizedForRole(requestedFromRoute, canonical)
            ) {
              setUnauthorizedRoute(null);
              setActiveMenu(requestedFromRoute);
              setMasterSubmenu(parseMasterSubmenuFromRoute(window.location.pathname));
            } else {
              const def = defaultMenuForRole(canonical);
              setActiveMenu(def);
              setMasterSubmenu(null);
            }
            if (!readPortalIntentFlag()) {
              const urlPortal = portalFromLoginRoute(window.location.pathname);
              setSelectedPortal(urlPortal || portalForRole(canonical));
            }
            setAuthError(null);
            setAuthReady(true);
            return;
          }

          const initialPortal = readStoredPortal();
          const p = await ensureUserProfile(user, initialPortal);
          setProfile(p);
          const canonical = normalizeRole(p.role);
          const requestedFromRoute = parseMenuFromRoute(window.location.pathname);

          if (requestedFromRoute) {
            if (
              isRoutePathAuthorizedForRole(window.location.pathname, canonical) &&
              isMenuAuthorizedForRole(requestedFromRoute, canonical)
            ) {
              setUnauthorizedRoute(null);
              setActiveMenu(requestedFromRoute);
              setMasterSubmenu(parseMasterSubmenuFromRoute(window.location.pathname));
            } else {
              setUnauthorizedRoute(window.location.pathname);
            }
          } else {
            const def = defaultMenuForRole(canonical);
            setActiveMenu(def);
            setMasterSubmenu(null);
          }

          if (!readPortalIntentFlag()) {
            const urlPortal = portalFromLoginRoute(window.location.pathname);
            setSelectedPortal(
              urlPortal ||
                (normalizeAccountStatus(p.account_status) === 'PENDING' && p.requested_portal
                  ? p.requested_portal
                  : portalForRole(canonical))
            );
          }
          setAuthError(null);
        } catch (err) {
          setAuthError(
            err instanceof Error ? err.message : 'Gagal memuat profil pengguna.'
          );
        }
      } else {
        const preservedError = preservedAuthErrorRef.current;
        preservedAuthErrorRef.current = null;
        clearAllClientState();
        if (preservedError) setAuthError(preservedError);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [clearAllClientState]);

  // Subscribe to current user profile, permissions & own entity/onboarding docs
  useEffect(() => {
    if (!firebaseUser) return;
    const unsubProfile = subscribeUserProfile(firebaseUser.uid, (nextProfile) => {
      if (nextProfile) {
        setProfile(nextProfile);
        const canonical = normalizeRole(nextProfile.role);
        setActiveMenu((prev) =>
          isMenuAuthorizedForRole(prev, canonical) ? prev : defaultMenuForRole(canonical)
        );
      }
    });
    const unsubPerms = subscribeUserPermissions(firebaseUser.uid, (permDoc) => {
      setUserPermissionsDoc(permDoc);
    });
    const unsubOwnDocs = subscribeOwnOnboardingDocs(firebaseUser.uid, (docs) => {
      setOwnOnboardingDocs(docs);
    });
    return () => {
      unsubProfile();
      unsubPerms();
      unsubOwnDocs();
    };
  }, [firebaseUser]);

  // Subscribe to role-scoped Firestore collections when authenticated, email-verified, active, and portal matches
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || !effectiveProfile) return;

    if (
      !isAccountActive(effectiveProfile.account_status) ||
      effectiveProfile.organization_id !== DEFAULT_ORGANIZATION_ID
    ) {
      return;
    }

    const portalAccess = checkPortalAccess(effectiveProfile.roles, selectedPortal);
    if (verifyPortalMatch && !portalAccess.allowed) {
      return;
    }

    const unsubs: (() => void)[] = [];
    const register = (fn: () => void) => {
      unsubs.push(fn);
      activeListenersRef.current.push(fn);
    };

    const onSubError = (err: Error) => {
      console.error(err);
    };

    // SystemConfig & AcademicPeriods can be read by all verified active signed-in users
    register(
      subscribeCollection<SystemConfig>(
        'systemConfig',
        (items) => setSystemConfig(items.find((i) => i.id === 'main') || items[0] || null),
        undefined,
        onSubError
      )
    );
    register(
      subscribeCollection<AcademicPeriod>('academicPeriods', setPeriods, 'createdAt', onSubError)
    );

    const canonicalRole = normalizeRole(effectiveProfile.role);
    const isStudentOrParent = canonicalRole === 'STUDENT' || canonicalRole === 'PARENT';

    if (isStudentOrParent) {
      // Clear non-student operational caches
      setUnits([]);
      setCohorts([]);
      setAcademicYears([]);
      setSemesters([]);
      setClasses([]);
      setClassHistory([]);
      setTeachers([]);
      setGuardians([]);
      setCommitteeMembers([]);
      setFoundationAdmins([]);
      setAggregates([]);
      setPrograms([]);
      setFindings([]);
      setMeetings([]);
      setDecisions([]);
      setReports([]);
      setAllUsers([]);
      setAllUserPermissions([]);
      setClassAssignments([]);
      setImportLogs([]);
      setAuditLogs([]);

      if (canonicalRole === 'STUDENT') {
        setStudentDocLoaded(false);
        setStudentGuardians([]);
        // Scope F: Students NEVER subscribe to studentAssessments
        setAssessments([]);
        register(
          subscribeLinkedStudentsForPortal(
            effectiveProfile.uid,
            'STUDENT',
            (linkedList) => {
              setStudents(linkedList);
              setStudentDocLoaded(true);
            },
            (err) => {
              onSubError(err);
              setStudentDocLoaded(true);
            }
          )
        );
      } else {
        // PARENT: must resolve children exclusively through verified student_guardians links
        setStudentDocLoaded(true);
        setStudents([]);
        register(
          subscribeVerifiedGuardiansForParent(
            effectiveProfile.uid,
            setStudentGuardians,
            onSubError
          )
        );
      }
      setMutabaahLogs([]);
    } else {
      // Active Staff: SUPER_ADMIN, FOUNDATION_ADMIN, COMMITTEE_ADMIN, TEACHER, HOMEROOM_TEACHER
      register(subscribeCollection<EducationUnit>('units', setUnits, undefined, onSubError));
      register(subscribeCollection<Cohort>('cohorts', setCohorts, 'createdAt', onSubError));
      register(
        subscribeCollection<AcademicYearDoc>(
          'academic_years',
          setAcademicYears,
          'createdAt',
          onSubError
        )
      );
      register(subscribeCollection<SemesterDoc>('semesters', setSemesters, 'createdAt', onSubError));
      register(subscribeCollection<SchoolClass>('classes', setClasses, 'createdAt', onSubError));
      register(
        subscribeCollection<ClassStudentHistory>(
          'class_student_history',
          setClassHistory,
          'createdAt',
          onSubError
        )
      );
      register(subscribeCollection<Teacher>('teachers', setTeachers, 'createdAt', onSubError));
      register(
        subscribeCollection<UnitAggregate>('unitAggregates', setAggregates, 'updatedAt', onSubError)
      );
      register(
        subscribeCollection<ReligiousProgram>('religiousPrograms', setPrograms, 'createdAt', onSubError)
      );
      register(
        subscribeCollection<KomiteFinding>('komiteFindings', setFindings, 'createdAt', onSubError)
      );
      register(
        subscribeCollection<KomiteMeeting>('komiteMeetings', setMeetings, 'createdAt', onSubError)
      );
      register(
        subscribeCollection<KomiteDecision>('komiteDecisions', setDecisions, 'createdAt', onSubError)
      );
      if (canonicalRole === 'TEACHER' || canonicalRole === 'HOMEROOM_TEACHER') {
        register(
          subscribeClassScopedCollection<MutabaahLog>(
            'mutabaahLogs',
            effectiveProfile.assignedClassIds || [],
            setMutabaahLogs,
            onSubError
          )
        );
      } else {
        register(
          subscribeCollection<MutabaahLog>('mutabaahLogs', setMutabaahLogs, 'createdAt', onSubError)
        );
      }

      if (isFoundationOrSuperAdmin(canonicalRole) || canonicalRole === 'COMMITTEE_ADMIN') {
        register(
          subscribeCollection<KomiteReport>('komiteReports', setReports, 'createdAt', onSubError)
        );
      } else {
        setReports([]);
      }

      if (isFoundationOrSuperAdmin(canonicalRole)) {
        register(subscribeCollection<AuditLog>('auditLogs', setAuditLogs, 'createdAt', onSubError));
        register(
          subscribeCollection<ExcelImportLog>('excelImportLogs', setImportLogs, 'createdAt', onSubError)
        );
        register(subscribeAllUsers(setAllUsers, onSubError));
        register(
          subscribeCollection<UserPermissionsDoc>(
            'user_permissions',
            setAllUserPermissions,
            undefined,
            onSubError
          )
        );
        register(
          subscribeCollection<ClassAssignment>(
            'class_assignments',
            setClassAssignments,
            'created_at',
            onSubError
          )
        );
        register(
          subscribeCollection<StudentGuardian>(
            'student_guardians',
            setStudentGuardians,
            'created_at',
            onSubError
          )
        );
        register(
          subscribeCollection<GuardianProfile>('guardians', setGuardians, 'updatedAt', onSubError)
        );
        register(
          subscribeCollection<CommitteeMemberProfile>(
            'committee_members',
            setCommitteeMembers,
            'updatedAt',
            onSubError
          )
        );
        register(
          subscribeCollection<FoundationAdminProfile>(
            'foundation_admins',
            setFoundationAdmins,
            'updatedAt',
            onSubError
          )
        );
      } else if (canonicalRole === 'TEACHER' || canonicalRole === 'HOMEROOM_TEACHER') {
        setAuditLogs([]);
        setAllUsers([]);
        setAllUserPermissions([]);
        setStudentGuardians([]);
        setGuardians([]);
        setCommitteeMembers([]);
        setFoundationAdmins([]);
        setTeacherAssignmentsLoaded(false);
        register(
          subscribeTeacherImportLogs<ExcelImportLog>(effectiveProfile.uid, setImportLogs, onSubError)
        );
        register(
          subscribeTeacherClassAssignments(
            effectiveProfile.uid,
            (items) => {
              setClassAssignments(items);
              setTeacherAssignmentsLoaded(true);
            },
            (err) => {
              onSubError(err);
              setTeacherAssignmentsLoaded(true);
            }
          )
        );
      } else {
        // COMMITTEE_ADMIN
        setAuditLogs([]);
        setImportLogs([]);
        setAllUsers([]);
        setAllUserPermissions([]);
        setClassAssignments([]);
        setStudentGuardians([]);
        setGuardians([]);
        setFoundationAdmins([]);
        register(
          subscribeCollection<CommitteeMemberProfile>(
            'committee_members',
            setCommitteeMembers,
            'updatedAt',
            onSubError
          )
        );
      }

      const canReadIndividualStudents =
        isFoundationOrSuperAdmin(canonicalRole) ||
        canonicalRole === 'TEACHER' ||
        canonicalRole === 'HOMEROOM_TEACHER' ||
        (canonicalRole === 'COMMITTEE_ADMIN' &&
          (effectiveProfile.allowIndividualStudentAccess ||
            Boolean(effectiveProfile.permissions?.includes('committee:view_individual_students'))));

      if (canReadIndividualStudents) {
        if (canonicalRole === 'TEACHER' || canonicalRole === 'HOMEROOM_TEACHER') {
          register(
            subscribeClassScopedCollection<Student>(
              'students',
              effectiveProfile.assignedClassIds || [],
              setStudents,
              onSubError
            )
          );
          register(
            subscribeClassScopedCollection<StudentAssessment>(
              'studentAssessments',
              effectiveProfile.assignedClassIds || [],
              setAssessments,
              onSubError
            )
          );
        } else {
          register(subscribeCollection<Student>('students', setStudents, 'createdAt', onSubError));
          register(
            subscribeCollection<StudentAssessment>(
              'studentAssessments',
              setAssessments,
              'createdAt',
              onSubError
            )
          );
        }
      } else {
        setStudents([]);
        setAssessments([]);
      }
    }

    return () => {
      unsubs.forEach((fn) => {
        try {
          fn();
        } catch {
          // Ignore teardown
        }
      });
    };
  }, [firebaseUser, effectiveProfile, selectedPortal, verifyPortalMatch]);

  // Student selection validation (defends against wrong dropdown choice & URL/sessionStorage tampering)
  const urlStudentSelection = useMemo(
    () =>
      typeof window !== 'undefined'
        ? parseStudentSelectionFromUrlSearch(window.location.search)
        : null,
    []
  );

  const candidateStudentSelection = useMemo<Partial<StudentLoginSelection> | null>(() => {
    if (urlStudentSelection) {
      return {
        educationLevel: urlStudentSelection.educationLevel
          ? normalizeEducationLevel(urlStudentSelection.educationLevel)
          : studentLoginSelection?.educationLevel,
        educationUnitId:
          urlStudentSelection.educationUnitId ?? studentLoginSelection?.educationUnitId,
        academicYearId:
          urlStudentSelection.academicYearId ?? studentLoginSelection?.academicYearId,
        classId: urlStudentSelection.classId ?? studentLoginSelection?.classId,
      };
    }
    return studentLoginSelection;
  }, [urlStudentSelection, studentLoginSelection]);

  const activeStudentRecord = useMemo(() => {
    if (!effectiveProfile) return null;
    return (
      students.find(
        (s) => (s.student_uid || s.studentUid) === effectiveProfile.uid
      ) ||
      students[0] ||
      ownOnboardingDocs.student ||
      null
    );
  }, [effectiveProfile, students, ownOnboardingDocs.student]);

  const studentPlacementValidation = useMemo(() => {
    if (!effectiveProfile || normalizeRole(effectiveProfile.role) !== 'STUDENT') {
      return { valid: true };
    }
    if (!studentDocLoaded) {
      return { valid: false, code: 'LOADING', reason: 'Memverifikasi data siswa di Firestore...' };
    }
    const selectedClass = candidateStudentSelection?.classId
      ? loginClasses.find((c) => c.id === candidateStudentSelection.classId) || null
      : null;
    const selectedYear = candidateStudentSelection?.academicYearId
      ? loginAcademicYears.find((y) => y.id === candidateStudentSelection.academicYearId) || null
      : null;
    return validateStudentLoginPlacement({
      profile: effectiveProfile,
      studentDoc: activeStudentRecord,
      selection: candidateStudentSelection || null,
      selectedClass,
      selectedYear,
    });
  }, [
    effectiveProfile,
    candidateStudentSelection,
    studentDocLoaded,
    activeStudentRecord,
    loginClasses,
    loginAcademicYears,
  ]);

  // Teacher selection validation (defends against unauthorized class/level/year & URL/sessionStorage tampering)
  const urlTeacherSelection = useMemo(
    () =>
      typeof window !== 'undefined'
        ? parseTeacherSelectionFromUrlSearch(window.location.search)
        : null,
    []
  );

  const candidateTeacherSelection = useMemo<Partial<TeacherLoginSelection> | null>(() => {
    if (urlTeacherSelection) {
      return {
        educationLevel: urlTeacherSelection.educationLevel
          ? normalizeEducationLevel(urlTeacherSelection.educationLevel)
          : teacherLoginSelection?.educationLevel,
        educationUnitId:
          urlTeacherSelection.educationUnitId ?? teacherLoginSelection?.educationUnitId,
        academicYearId:
          urlTeacherSelection.academicYearId ?? teacherLoginSelection?.academicYearId,
        classId: urlTeacherSelection.classId ?? teacherLoginSelection?.classId,
      };
    }
    return teacherLoginSelection;
  }, [urlTeacherSelection, teacherLoginSelection]);

  const teacherAssignmentValidation = useMemo(() => {
    if (!effectiveProfile) return { valid: true };
    const cRole = normalizeRole(effectiveProfile.role);
    if (cRole !== 'TEACHER' && cRole !== 'HOMEROOM_TEACHER') {
      return { valid: true };
    }
    if (!candidateTeacherSelection) {
      return { valid: true };
    }
    if (!teacherAssignmentsLoaded || !loginCatalogLoaded) {
      return {
        valid: false,
        code: 'LOADING',
        reason: 'Memverifikasi penugasan kelas guru di Firestore...',
      };
    }
    const mergedClasses = classes.length > 0 ? classes : loginClasses;
    const mergedYears = academicYears.length > 0 ? academicYears : loginAcademicYears;
    const selectedClass = candidateTeacherSelection.classId
      ? mergedClasses.find((c) => c.id === candidateTeacherSelection.classId) || null
      : null;
    const selectedYear = candidateTeacherSelection.academicYearId
      ? mergedYears.find((y) => y.id === candidateTeacherSelection.academicYearId) || null
      : null;
    return validateTeacherLoginAssignment({
      profile: effectiveProfile,
      selection: candidateTeacherSelection,
      selectedClass,
      selectedYear,
      classAssignments,
    });
  }, [
    effectiveProfile,
    candidateTeacherSelection,
    teacherAssignmentsLoaded,
    loginCatalogLoaded,
    classes,
    loginClasses,
    academicYears,
    loginAcademicYears,
    classAssignments,
  ]);

  // Keep selectedTeacherClassId synchronized with verified teacher login selection or authorized class list
  useEffect(() => {
    if (!effectiveProfile) return;
    const cRole = normalizeRole(effectiveProfile.role);
    if (cRole !== 'TEACHER' && cRole !== 'HOMEROOM_TEACHER') return;
    const activeIds = classAssignments
      .filter((ca) => ca.teacher_uid === effectiveProfile.uid && ca.assignment_status === 'active')
      .map((ca) => ca.class_id);
    const allowedIds =
      activeIds.length > 0 ? activeIds : effectiveProfile.assignedClassIds || [];
    if (
      teacherLoginSelection?.classId &&
      allowedIds.includes(teacherLoginSelection.classId) &&
      !selectedTeacherClassId
    ) {
      setSelectedTeacherClassId(teacherLoginSelection.classId);
    } else if (allowedIds.length > 0 && (!selectedTeacherClassId || !allowedIds.includes(selectedTeacherClassId))) {
      setSelectedTeacherClassId(allowedIds[0]);
    }
  }, [effectiveProfile, classAssignments, teacherLoginSelection, selectedTeacherClassId]);

  // Subscribe strictly separated collections for STUDENT (Mutaba'ah ONLY, zero assessments) vs PARENT (verified student_guardians ONLY)
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || !effectiveProfile) return;
    if (!isAccountActive(effectiveProfile.account_status)) return;
    const canonicalRole = normalizeRole(effectiveProfile.role);
    if (canonicalRole !== 'STUDENT' && canonicalRole !== 'PARENT') return;

    if (canonicalRole === 'STUDENT') {
      // STUDENT NEVER subscribes to studentAssessments
      setAssessments([]);
      if (!studentPlacementValidation.valid) {
        setMutabaahLogs([]);
        return;
      }
      const ownStudentIds = Array.from(
        new Set([
          ...students
            .filter((s) => (s.student_uid || s.studentUid) === effectiveProfile.uid)
            .map((s) => s.id),
          ...(effectiveProfile.linkedStudentIds || []),
        ])
      ).filter(Boolean);
      if (ownStudentIds.length === 0) {
        setMutabaahLogs([]);
        return;
      }
      const unsubMutabaah = subscribePublishedCollectionForStudents<MutabaahLog>(
        'mutabaahLogs',
        ownStudentIds,
        setMutabaahLogs,
        console.error
      );
      return () => {
        unsubMutabaah();
      };
    }

    // PARENT: derive children EXCLUSIVELY from verified student_guardians links
    const verifiedChildIds = Array.from(
      new Set(
        studentGuardians
          .filter(
            (g) =>
              g.guardian_uid === effectiveProfile.uid &&
              g.verification_status === 'verified'
          )
          .map((g) => g.student_id)
      )
    ).filter(Boolean);

    if (verifiedChildIds.length === 0) {
      setStudents([]);
      setAssessments([]);
      setMutabaahLogs([]);
      return;
    }

    const uStudents = subscribeVerifiedStudentsForParent(
      verifiedChildIds,
      setStudents,
      console.error
    );
    const uAssessments = subscribePublishedCollectionForStudents<StudentAssessment>(
      'studentAssessments',
      verifiedChildIds,
      setAssessments,
      console.error
    );
    const uMutabaah = subscribePublishedCollectionForStudents<MutabaahLog>(
      'mutabaahLogs',
      verifiedChildIds,
      setMutabaahLogs,
      console.error
    );
    return () => {
      uStudents();
      uAssessments();
      uMutabaah();
    };
  }, [
    firebaseUser,
    effectiveProfile,
    students,
    studentGuardians,
    studentPlacementValidation.valid,
  ]);

  const handleOpenPortalLogin = (portal: LoginPortal) => {
    setAuthError(null);
    setActiveLoginRoutePortal(portal);
    setSelectedPortal(portal);
    try {
      window.sessionStorage.setItem(SELECTED_PORTAL_STORAGE_KEY, portal);
    } catch {
      // Ignore storage error
    }
    navigateBrowserPath(loginRouteForPortal(portal));
  };

  const handleBackToPortalSelection = () => {
    setAuthError(null);
    setActiveLoginRoutePortal(null);
    navigateBrowserPath('/');
  };

  const handleSignIn = async (portal: LoginPortal) => {
    setAuthError(null);
    setSelectedPortal(portal);
    setVerifyPortalMatch(true);
    setStudentLoginSelection(null);
    setTeacherLoginSelection(null);
    try {
      window.sessionStorage.setItem(SELECTED_PORTAL_STORAGE_KEY, portal);
      window.sessionStorage.setItem(PORTAL_CHECK_ACTIVE_KEY, '1');
      window.sessionStorage.setItem(LOGIN_AUTH_METHOD_KEY, 'google');
      window.sessionStorage.removeItem(STUDENT_LOGIN_MODE_KEY);
      window.sessionStorage.removeItem(STUDENT_LOGIN_SELECTION_KEY);
      window.sessionStorage.removeItem(TEACHER_LOGIN_SELECTION_KEY);
    } catch {
      // Ignore storage error
    }
    try {
      await signInWithPopup(auth, googleProvider);
      await checkDb();
    } catch (err) {
      setVerifyPortalMatch(false);
      try {
        window.sessionStorage.removeItem(PORTAL_CHECK_ACTIVE_KEY);
        window.sessionStorage.removeItem(LOGIN_AUTH_METHOD_KEY);
      } catch {
        // Ignore
      }
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleStudentEmailSignIn = async (email: string, password: string) => {
    setAuthError(null);
    setSelectedPortal('parent_student');
    setVerifyPortalMatch(true);
    setStudentLoginSelection(null);
    setTeacherLoginSelection(null);
    setStudentDocLoaded(false);
    try {
      window.sessionStorage.setItem(SELECTED_PORTAL_STORAGE_KEY, 'parent_student');
      window.sessionStorage.setItem(PORTAL_CHECK_ACTIVE_KEY, '1');
      window.sessionStorage.setItem(LOGIN_AUTH_METHOD_KEY, 'email');
      window.sessionStorage.setItem(STUDENT_LOGIN_MODE_KEY, 'student');
      window.sessionStorage.removeItem(STUDENT_LOGIN_SELECTION_KEY);
      window.sessionStorage.removeItem(TEACHER_LOGIN_SELECTION_KEY);
    } catch {
      // Ignore storage error
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      await checkDb();
    } catch (err) {
      setVerifyPortalMatch(false);
      try {
        window.sessionStorage.removeItem(PORTAL_CHECK_ACTIVE_KEY);
        window.sessionStorage.removeItem(LOGIN_AUTH_METHOD_KEY);
        window.sessionStorage.removeItem(STUDENT_LOGIN_MODE_KEY);
      } catch {
        // Ignore
      }
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleStudentGoogleSignIn = async () => {
    setAuthError(null);
    setSelectedPortal('parent_student');
    setVerifyPortalMatch(true);
    setStudentLoginSelection(null);
    setTeacherLoginSelection(null);
    setStudentDocLoaded(false);
    try {
      window.sessionStorage.setItem(SELECTED_PORTAL_STORAGE_KEY, 'parent_student');
      window.sessionStorage.setItem(PORTAL_CHECK_ACTIVE_KEY, '1');
      window.sessionStorage.setItem(LOGIN_AUTH_METHOD_KEY, 'google');
      window.sessionStorage.setItem(STUDENT_LOGIN_MODE_KEY, 'student');
      window.sessionStorage.removeItem(STUDENT_LOGIN_SELECTION_KEY);
      window.sessionStorage.removeItem(TEACHER_LOGIN_SELECTION_KEY);
    } catch {
      // Ignore storage error
    }
    try {
      await signInWithPopup(auth, googleProvider);
      await checkDb();
    } catch (err) {
      setVerifyPortalMatch(false);
      try {
        window.sessionStorage.removeItem(PORTAL_CHECK_ACTIVE_KEY);
        window.sessionStorage.removeItem(LOGIN_AUTH_METHOD_KEY);
        window.sessionStorage.removeItem(STUDENT_LOGIN_MODE_KEY);
      } catch {
        // Ignore
      }
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleParentEmailSignIn = async (email: string, password: string) => {
    setAuthError(null);
    setSelectedPortal('parent_student');
    setVerifyPortalMatch(true);
    setStudentLoginSelection(null);
    setTeacherLoginSelection(null);
    try {
      window.sessionStorage.setItem(SELECTED_PORTAL_STORAGE_KEY, 'parent_student');
      window.sessionStorage.setItem(PORTAL_CHECK_ACTIVE_KEY, '1');
      window.sessionStorage.setItem(LOGIN_AUTH_METHOD_KEY, 'email');
      window.sessionStorage.setItem(STUDENT_LOGIN_MODE_KEY, 'parent');
      window.sessionStorage.removeItem(STUDENT_LOGIN_SELECTION_KEY);
      window.sessionStorage.removeItem(TEACHER_LOGIN_SELECTION_KEY);
    } catch {
      // Ignore storage error
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      await checkDb();
    } catch (err) {
      setVerifyPortalMatch(false);
      try {
        window.sessionStorage.removeItem(PORTAL_CHECK_ACTIVE_KEY);
        window.sessionStorage.removeItem(LOGIN_AUTH_METHOD_KEY);
        window.sessionStorage.removeItem(STUDENT_LOGIN_MODE_KEY);
      } catch {
        // Ignore
      }
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleTeacherEmailSignIn = async (
    email: string,
    password: string,
    selection: TeacherLoginSelection
  ) => {
    setAuthError(null);
    setSelectedPortal('teacher');
    setVerifyPortalMatch(true);
    setStudentLoginSelection(null);
    setTeacherLoginSelection(selection);
    setSelectedTeacherClassId(selection.classId);
    setTeacherAssignmentsLoaded(false);
    try {
      window.sessionStorage.setItem(SELECTED_PORTAL_STORAGE_KEY, 'teacher');
      window.sessionStorage.setItem(PORTAL_CHECK_ACTIVE_KEY, '1');
      window.sessionStorage.setItem(LOGIN_AUTH_METHOD_KEY, 'email');
      window.sessionStorage.setItem(TEACHER_LOGIN_SELECTION_KEY, JSON.stringify(selection));
      window.sessionStorage.removeItem(STUDENT_LOGIN_MODE_KEY);
      window.sessionStorage.removeItem(STUDENT_LOGIN_SELECTION_KEY);
    } catch {
      // Ignore storage error
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      await checkDb();
    } catch (err) {
      setVerifyPortalMatch(false);
      setTeacherLoginSelection(null);
      setSelectedTeacherClassId('');
      try {
        window.sessionStorage.removeItem(PORTAL_CHECK_ACTIVE_KEY);
        window.sessionStorage.removeItem(LOGIN_AUTH_METHOD_KEY);
        window.sessionStorage.removeItem(TEACHER_LOGIN_SELECTION_KEY);
      } catch {
        // Ignore
      }
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleTeacherGoogleSignIn = async (selection: TeacherLoginSelection) => {
    setAuthError(null);
    setSelectedPortal('teacher');
    setVerifyPortalMatch(true);
    setStudentLoginSelection(null);
    setTeacherLoginSelection(selection);
    setSelectedTeacherClassId(selection.classId);
    setTeacherAssignmentsLoaded(false);
    try {
      window.sessionStorage.setItem(SELECTED_PORTAL_STORAGE_KEY, 'teacher');
      window.sessionStorage.setItem(PORTAL_CHECK_ACTIVE_KEY, '1');
      window.sessionStorage.setItem(LOGIN_AUTH_METHOD_KEY, 'google');
      window.sessionStorage.setItem(TEACHER_LOGIN_SELECTION_KEY, JSON.stringify(selection));
      window.sessionStorage.removeItem(STUDENT_LOGIN_MODE_KEY);
      window.sessionStorage.removeItem(STUDENT_LOGIN_SELECTION_KEY);
    } catch {
      // Ignore storage error
    }
    try {
      await signInWithPopup(auth, googleProvider);
      await checkDb();
    } catch (err) {
      setVerifyPortalMatch(false);
      setTeacherLoginSelection(null);
      setSelectedTeacherClassId('');
      try {
        window.sessionStorage.removeItem(PORTAL_CHECK_ACTIVE_KEY);
        window.sessionStorage.removeItem(LOGIN_AUTH_METHOD_KEY);
        window.sessionStorage.removeItem(TEACHER_LOGIN_SELECTION_KEY);
      } catch {
        // Ignore
      }
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handlePortalAdminEmailSignIn = async (
    portal: 'committee' | 'foundation',
    email: string,
    password: string
  ) => {
    setAuthError(null);
    setSelectedPortal(portal);
    setVerifyPortalMatch(true);
    setStudentLoginSelection(null);
    setTeacherLoginSelection(null);
    try {
      window.sessionStorage.setItem(SELECTED_PORTAL_STORAGE_KEY, portal);
      window.sessionStorage.setItem(PORTAL_CHECK_ACTIVE_KEY, '1');
      window.sessionStorage.setItem(LOGIN_AUTH_METHOD_KEY, 'email');
      window.sessionStorage.removeItem(STUDENT_LOGIN_MODE_KEY);
      window.sessionStorage.removeItem(STUDENT_LOGIN_SELECTION_KEY);
      window.sessionStorage.removeItem(TEACHER_LOGIN_SELECTION_KEY);
    } catch {
      // Ignore storage error
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      await checkDb();
    } catch (err) {
      setVerifyPortalMatch(false);
      try {
        window.sessionStorage.removeItem(PORTAL_CHECK_ACTIVE_KEY);
        window.sessionStorage.removeItem(LOGIN_AUTH_METHOD_KEY);
      } catch {
        // Ignore
      }
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleSignOut = async () => {
    detachAllListeners();
    try {
      await signOut(auth);
    } finally {
      clearAllClientState();
      setActiveLoginRoutePortal(null);
      window.history.replaceState(null, '', '/');
    }
  };

  const handleEnterAuthorizedPortal = () => {
    if (!effectiveProfile) return;
    const canonical = normalizeRole(effectiveProfile.role);
    const official = portalForRole(canonical);
    setSelectedPortal(official);
    setVerifyPortalMatch(false);
    try {
      window.sessionStorage.setItem(SELECTED_PORTAL_STORAGE_KEY, official);
      window.sessionStorage.removeItem(PORTAL_CHECK_ACTIVE_KEY);
    } catch {
      // Ignore
    }
    const def = defaultMenuForRole(canonical);
    setActiveMenu(def);
    navigateBrowserPath(routePathForMenu(def, canonical), true);
  };

  if (!firebaseUser || !effectiveProfile) {
    return (
      <AuthGate
        activeLoginPortal={activeLoginRoutePortal}
        onOpenPortalLogin={handleOpenPortalLogin}
        onBackToPortalSelection={handleBackToPortalSelection}
        onSignIn={handleSignIn}
        onStudentEmailSignIn={handleStudentEmailSignIn}
        onStudentGoogleSignIn={handleStudentGoogleSignIn}
        onParentEmailSignIn={handleParentEmailSignIn}
        onTeacherEmailSignIn={handleTeacherEmailSignIn}
        onTeacherGoogleSignIn={handleTeacherGoogleSignIn}
        onCommitteeEmailSignIn={(em, pw) => handlePortalAdminEmailSignIn('committee', em, pw)}
        onFoundationEmailSignIn={(em, pw) => handlePortalAdminEmailSignIn('foundation', em, pw)}
        academicYears={loginAcademicYears}
        classes={loginClasses}
        units={loginUnits}
        dbStatus={dbStatus}
        onRetryDb={checkDb}
        errorMsg={authError}
      />
    );
  }

  // Enforce Firebase Auth Token email_verified == true as sole authoritative verification source
  if (!firebaseUser.emailVerified) {
    return (
      <EmailVerificationRequiredGate
        email={firebaseUser.email}
        onSignOut={handleSignOut}
      />
    );
  }

  // Enforce Account Status (PENDING onboarding vs PENDING_VERIFICATION/SUSPENDED/REVOKED/INACTIVE/ARCHIVED) & Organization Isolation
  if (
    !isAccountActive(effectiveProfile.account_status) ||
    effectiveProfile.organization_id !== DEFAULT_ORGANIZATION_ID
  ) {
    if (
      normalizeAccountStatus(effectiveProfile.account_status) === 'PENDING' &&
      effectiveProfile.organization_id === DEFAULT_ORGANIZATION_ID
    ) {
      return (
        <ProfileOnboardingGate
          profile={effectiveProfile}
          selectedPortal={selectedPortal}
          ownDocs={ownOnboardingDocs}
          onSignOut={handleSignOut}
        />
      );
    }
    return (
      <AccountDisabledGate
        profile={effectiveProfile}
        onSignOut={handleSignOut}
      />
    );
  }

  // Enforce Login Portal Matching against Verified Firestore Role
  const portalCheck = checkPortalAccess(effectiveProfile.roles, selectedPortal);
  if (verifyPortalMatch && !portalCheck.allowed) {
    return (
      <PortalMismatchGate
        profile={effectiveProfile}
        selectedPortal={selectedPortal}
        onEnterAuthorizedPortal={handleEnterAuthorizedPortal}
        onSignOut={handleSignOut}
      />
    );
  }

  // Enforce Student Login verification against Firestore student record (and optional placement)
  if (
    normalizeRole(effectiveProfile.role) === 'STUDENT' &&
    !studentPlacementValidation.valid
  ) {
    if (studentPlacementValidation.code === 'LOADING') {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-600">
          Memverifikasi data akun dan kelas siswa di Firestore...
        </div>
      );
    }
    return (
      <StudentSelectionMismatchGate
        email={effectiveProfile.email}
        code={studentPlacementValidation.code}
        reason={
          studentPlacementValidation.reason ||
          'Data akun siswa belum terhubung atau tidak sesuai dengan data resmi sekolah.'
        }
        onSignOut={handleSignOut}
      />
    );
  }

  // Enforce Teacher Login Jenjang + Tahun Ajaran + Kelas assignment verification
  if (
    (normalizeRole(effectiveProfile.role) === 'TEACHER' ||
      normalizeRole(effectiveProfile.role) === 'HOMEROOM_TEACHER') &&
    candidateTeacherSelection &&
    !teacherAssignmentValidation.valid
  ) {
    if (teacherAssignmentValidation.code === 'LOADING') {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-600">
          Memverifikasi jenjang, tahun ajaran, dan penugasan kelas guru di Firestore...
        </div>
      );
    }
    return (
      <TeacherSelectionMismatchGate
        email={effectiveProfile.email}
        code={teacherAssignmentValidation.code}
        reason={
          teacherAssignmentValidation.reason ||
          'Anda tidak terdaftar sebagai pengajar pada kelas yang dipilih. Silakan periksa penugasan Anda atau hubungi Admin Yayasan.'
        }
        onSignOut={handleSignOut}
      />
    );
  }

  const canonicalRole = normalizeRole(effectiveProfile.role);

  const authorizedUnits: UnitCode[] =
    effectiveProfile.assignedUnits && effectiveProfile.assignedUnits.length > 0
      ? effectiveProfile.assignedUnits
      : [...EDUCATION_LEVELS];

  const activePeriodId =
    systemConfig?.activePeriodId ||
    periods.find((p) => p.isActive)?.id ||
    periods[0]?.id ||
    '';

  const activePeriodName =
    systemConfig?.activePeriodName ||
    periods.find((p) => p.id === activePeriodId)?.name ||
    'Belum Ditetapkan';

  const canKomiteAddProgramNote =
    canonicalRole === 'COMMITTEE_ADMIN' || isFoundationOrSuperAdmin(canonicalRole);

  const isStudentOrParent = canonicalRole === 'STUDENT' || canonicalRole === 'PARENT';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        profile={effectiveProfile}
        activeMenu={activeMenu}
        onSelectMenu={navigateToMenu}
        onSignOut={handleSignOut}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Official Foundation Branding on left, status & explicit Logout on right */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <FoundationBrand variant="header" />
            <span aria-hidden="true" className="hidden md:inline text-slate-300">
              |
            </span>
            <span className="hidden md:inline text-xs font-medium text-slate-700 truncate">
              {roleLabel(canonicalRole)}
            </span>
            <span aria-hidden="true" className="hidden xl:inline text-slate-300">
              ·
            </span>
            <span className="hidden xl:inline text-xs text-slate-500 truncate">
              Periode: {activePeriodName}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <DbStatusBadge status={dbStatus} onRetry={checkDb} />
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-xs font-medium text-slate-700 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 sm:p-8 max-w-7xl w-full mx-auto">
          {dbStatus === 'NOT CONNECTED' && (
            <div className="mb-6 p-4 border border-red-300 bg-red-50 rounded-lg text-xs text-red-900 flex items-center justify-between gap-4">
              <div>
                <p className="font-mono font-semibold">DATABASE STATUS: NOT CONNECTED</p>
                <p className="mt-0.5 text-red-800">
                  Koneksi ke Firestore terputus. Perubahan data tidak dapat disimpan hingga koneksi pulih.
                </p>
              </div>
              <button
                type="button"
                onClick={checkDb}
                className="px-3 py-1.5 rounded-md bg-red-800 text-white font-medium shrink-0 cursor-pointer"
              >
                Hubungkan Ulang
              </button>
            </div>
          )}

          {unauthorizedRoute ? (
            <div className="bg-white border border-red-200 rounded-lg p-8 max-w-xl mx-auto space-y-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-6 h-6 text-red-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-xs font-semibold text-red-700">
                    HTTP 403 · AKSES ROUTE DITOLAK
                  </p>
                  <h1 className="font-display text-lg font-semibold text-slate-900 mt-1">
                    Anda Tidak Memiliki Kewenangan Mengakses Halaman Ini
                  </h1>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    Route <span className="font-mono text-slate-800">{unauthorizedRoute}</span> tidak diizinkan untuk peran{' '}
                    <span className="font-semibold text-slate-900">{roleLabel(canonicalRole)}</span>.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => navigateToMenu(defaultMenuForRole(canonicalRole))}
                  className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-medium cursor-pointer"
                >
                  Kembali ke Dashboard Resmi
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-4 py-2 rounded-md border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer"
                >
                  Logout
                </button>
              </div>
            </div>
          ) : isStudentOrParent ? (
            <StudentParentPortal
              profile={effectiveProfile}
              activeMenu={
                isMenuAuthorizedForRole(activeMenu, canonicalRole)
                  ? (activeMenu as StudentParentMenuKey)
                  : 'siswa_dashboard'
              }
              students={students}
              verifiedGuardians={studentGuardians}
              assessments={assessments}
              mutabaahLogs={mutabaahLogs}
              periods={periods}
              academicYears={loginAcademicYears}
              ownDocs={ownOnboardingDocs}
            />
          ) : (
            <>
              {/* 9 Menu Khusus Komite Pendidikan Agama */}
              {activeMenu === 'komite_dashboard' && isMenuAuthorizedForRole('komite_dashboard', canonicalRole) && (
                <KomiteDashboard
                  authorizedUnits={authorizedUnits}
                  units={units}
                  periods={periods}
                  aggregates={aggregates}
                  programs={programs}
                  findings={findings}
                  activePeriodId={activePeriodId}
                  onNavigate={navigateToMenu}
                />
              )}

              {activeMenu === 'komite_monitoring_agama' && isMenuAuthorizedForRole('komite_monitoring_agama', canonicalRole) && (
                <MonitoringPendidikanAgama
                  authorizedUnits={authorizedUnits}
                  units={units}
                  periods={periods}
                  aggregates={aggregates}
                  programs={programs}
                  students={students}
                  allowIndividualStudentAccess={
                    isFoundationOrSuperAdmin(canonicalRole) ||
                    effectiveProfile.allowIndividualStudentAccess
                  }
                  activePeriodId={activePeriodId}
                />
              )}

              {activeMenu === 'komite_evaluasi_program' && isMenuAuthorizedForRole('komite_evaluasi_program', canonicalRole) && (
                <EvaluasiProgramKeagamaan
                  authorizedUnits={authorizedUnits}
                  periods={periods}
                  programs={programs}
                  activePeriodId={activePeriodId}
                  canAddNote={canKomiteAddProgramNote}
                  onNavigate={navigateToMenu}
                />
              )}

              {activeMenu === 'komite_monitoring_akhlak' && isMenuAuthorizedForRole('komite_monitoring_akhlak', canonicalRole) && (
                <MonitoringAkhlak
                  authorizedUnits={authorizedUnits}
                  periods={periods}
                  aggregates={aggregates}
                  assessments={assessments}
                  allowIndividualStudentAccess={
                    isFoundationOrSuperAdmin(canonicalRole) ||
                    effectiveProfile.allowIndividualStudentAccess
                  }
                  activePeriodId={activePeriodId}
                />
              )}

              {activeMenu === 'komite_monitoring_mutabaah' && isMenuAuthorizedForRole('komite_monitoring_mutabaah', canonicalRole) && (
                <MonitoringMutabaah
                  authorizedUnits={authorizedUnits}
                  periods={periods}
                  aggregates={aggregates}
                  programs={programs}
                  activePeriodId={activePeriodId}
                  canAddNote={canKomiteAddProgramNote}
                />
              )}

              {activeMenu === 'komite_temuan_rekomendasi' && isMenuAuthorizedForRole('komite_temuan_rekomendasi', canonicalRole) && (
                <TemuanRekomendasi
                  profile={effectiveProfile}
                  authorizedUnits={authorizedUnits}
                  periods={periods}
                  findings={findings}
                  activePeriodId={activePeriodId}
                />
              )}

              {activeMenu === 'komite_rapat_keputusan' && isMenuAuthorizedForRole('komite_rapat_keputusan', canonicalRole) && (
                <RapatKeputusan
                  profile={effectiveProfile}
                  authorizedUnits={authorizedUnits}
                  meetings={meetings}
                  decisions={decisions}
                />
              )}

              {activeMenu === 'komite_tindak_lanjut' && isMenuAuthorizedForRole('komite_tindak_lanjut', canonicalRole) && (
                <TindakLanjutRekomendasi
                  profile={effectiveProfile}
                  authorizedUnits={authorizedUnits}
                  findings={findings}
                />
              )}

              {activeMenu === 'komite_laporan' && isMenuAuthorizedForRole('komite_laporan', canonicalRole) && (
                <LaporanKomite
                  profile={effectiveProfile}
                  foundationName={
                    systemConfig?.foundationName || FOUNDATION_BRAND.foundationDisplayName
                  }
                  authorizedUnits={authorizedUnits}
                  periods={periods}
                  aggregates={aggregates}
                  programs={programs}
                  findings={findings}
                  decisions={decisions}
                  reports={reports}
                  activePeriodId={activePeriodId}
                />
              )}

              {/* Preserved SIAKHLAK Core & Guru Modules */}
              {activeMenu === 'core_dashboard' && isMenuAuthorizedForRole('core_dashboard', canonicalRole) && (
                <CoreDashboard
                  profile={effectiveProfile}
                  units={units}
                  periods={periods}
                  academicYears={academicYears}
                  classes={classes}
                  students={students}
                  assessments={assessments}
                  mutabaahLogs={mutabaahLogs}
                  importLogs={importLogs}
                  aggregates={aggregates}
                  programs={programs}
                  findings={findings}
                  activePeriodId={activePeriodId}
                  onNavigate={navigateToMenu}
                  classAssignments={classAssignments}
                  selectedTeacherClassId={selectedTeacherClassId}
                  onSelectTeacherClass={setSelectedTeacherClassId}
                />
              )}

              {activeMenu === 'core_penilaian_akhlak' && isMenuAuthorizedForRole('core_penilaian_akhlak', canonicalRole) && (
                <CoreAssessmentModule
                  profile={effectiveProfile}
                  classes={classes}
                  students={students}
                  periods={periods}
                  assessments={assessments}
                  importLogs={importLogs}
                  activePeriodId={activePeriodId}
                  classAssignments={classAssignments}
                  selectedTeacherClassId={selectedTeacherClassId}
                />
              )}

              {activeMenu === 'core_program_keagamaan' && isMenuAuthorizedForRole('core_program_keagamaan', canonicalRole) && (
                <CoreProgramsModule
                  profile={effectiveProfile}
                  periods={periods}
                  programs={programs}
                  students={students}
                  mutabaahLogs={mutabaahLogs}
                  activePeriodId={activePeriodId}
                  classAssignments={classAssignments}
                />
              )}

              {activeMenu === 'core_tindak_lanjut_unit' && isMenuAuthorizedForRole('core_tindak_lanjut_unit', canonicalRole) && (
                <CoreUnitFollowUp
                  findings={findings}
                  decisions={decisions}
                  authorizedUnits={
                    canonicalRole === 'TEACHER' || canonicalRole === 'HOMEROOM_TEACHER'
                      ? authorizedUnits
                      : undefined
                  }
                />
              )}

              {activeMenu === 'core_master_data' && isMenuAuthorizedForRole('core_master_data', canonicalRole) && (
                <CoreMasterData
                  profile={effectiveProfile}
                  units={units}
                  periods={periods}
                  classes={classes}
                  teachers={teachers}
                  students={students}
                  cohorts={cohorts}
                  academicYears={academicYears}
                  semesters={semesters}
                  classHistory={classHistory}
                  guardians={guardians}
                  committeeMembers={committeeMembers}
                  foundationAdmins={foundationAdmins}
                  classAssignments={classAssignments}
                  studentGuardians={studentGuardians}
                  users={allUsers}
                  userPermissionsList={allUserPermissions}
                  auditLogs={auditLogs}
                  assessments={assessments}
                  mutabaahLogs={mutabaahLogs}
                  initialSubmenu={masterSubmenu}
                  onSubmenuRouteSync={(routePath) => navigateBrowserPath(routePath)}
                />
              )}

              {activeMenu === 'profil_saya' && isMenuAuthorizedForRole('profil_saya', canonicalRole) && (
                <MyProfileView
                  profile={effectiveProfile}
                  ownDocs={ownOnboardingDocs}
                  linkedStudents={students}
                  verifiedGuardians={studentGuardians}
                  classAssignments={classAssignments}
                  classes={classes}
                />
              )}

              {activeMenu === 'core_pengaturan_sistem' && isMenuAuthorizedForRole('core_pengaturan_sistem', canonicalRole) && (
                <CoreSystemSettings
                  profile={effectiveProfile}
                  systemConfig={systemConfig}
                  periods={periods}
                  classes={classes}
                  students={students}
                  users={allUsers}
                  userPermissionsList={allUserPermissions}
                  classAssignments={classAssignments}
                  studentGuardians={studentGuardians}
                />
              )}

              {activeMenu === 'core_audit_trail' && isMenuAuthorizedForRole('core_audit_trail', canonicalRole) && (
                <CoreAuditTrail
                  profile={effectiveProfile}
                  auditLogs={auditLogs}
                  importLogs={importLogs}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
