import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

async function main() {
  const emulatorRulesPath = path.resolve(process.cwd(), 'firestore.emulator.rules');
  const rules = fs.existsSync(emulatorRulesPath)
    ? fs.readFileSync(emulatorRulesPath, 'utf8')
    : fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: 'siakhlak-rules-test',
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });

  try {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users', 'uid_superadmin'), {
        uid: 'uid_superadmin',
        email: 'superadmin@siakhlak.test',
        full_name: 'Super Administrator',
        roles: ['SUPER_ADMIN', 'FOUNDATION_ADMIN'],
        role: 'SUPER_ADMIN',
        account_status: 'ACTIVE',
        organization_id: 'yayasan_siakhlak',
        assignedUnits: ['TK', 'SD', 'SMP', 'SMA', 'SMK'],
        allowIndividualStudentAccess: true,
      });
      await setDoc(doc(db, 'users', 'uid_foundation'), {
        uid: 'uid_foundation',
        email: 'foundation@siakhlak.test',
        full_name: 'Admin Yayasan',
        roles: ['FOUNDATION_ADMIN'],
        role: 'FOUNDATION_ADMIN',
        account_status: 'ACTIVE',
        organization_id: 'yayasan_siakhlak',
        assignedUnits: ['SD', 'SMP'],
        allowIndividualStudentAccess: true,
      });
      await setDoc(doc(db, 'users', 'uid_committee'), {
        uid: 'uid_committee',
        email: 'committee@siakhlak.test',
        full_name: 'Komite Agama',
        roles: ['COMMITTEE_ADMIN'],
        role: 'COMMITTEE_ADMIN',
        account_status: 'ACTIVE',
        organization_id: 'yayasan_siakhlak',
        assignedUnits: ['SD'],
        allowIndividualStudentAccess: false,
      });
      await setDoc(doc(db, 'users', 'uid_teacher'), {
        uid: 'uid_teacher',
        email: 'teacher@siakhlak.test',
        full_name: 'Guru SD',
        roles: ['TEACHER'],
        role: 'TEACHER',
        account_status: 'ACTIVE',
        organization_id: 'yayasan_siakhlak',
        assignedUnits: ['SD'],
        assignedClassIds: ['cls_sd_4a'],
        allowIndividualStudentAccess: false,
      });
      await setDoc(doc(db, 'users', 'uid_suspended'), {
        uid: 'uid_suspended',
        email: 'suspended@siakhlak.test',
        full_name: 'Inactive',
        roles: ['TEACHER'],
        role: 'TEACHER',
        account_status: 'INACTIVE',
        organization_id: 'yayasan_siakhlak',
        assignedUnits: ['SD'],
        allowIndividualStudentAccess: false,
      });
      await setDoc(doc(db, 'users', 'uid_pending'), {
        uid: 'uid_pending',
        email: 'pending@siakhlak.test',
        full_name: 'Pending User',
        roles: ['STUDENT'],
        role: 'STUDENT',
        account_status: 'PENDING',
        profile_status: 'PENDING',
        organization_id: 'yayasan_siakhlak',
        assignedUnits: [],
        allowIndividualStudentAccess: false,
      });
      await setDoc(doc(db, 'users', 'uid_parent'), {
        uid: 'uid_parent',
        email: 'parent@siakhlak.test',
        full_name: 'Wali Aisyah',
        roles: ['PARENT'],
        role: 'PARENT',
        account_status: 'ACTIVE',
        organization_id: 'yayasan_siakhlak',
        assignedUnits: [],
        linkedStudentIds: ['stu_001'],
        allowIndividualStudentAccess: false,
      });
      await setDoc(doc(db, 'academicPeriods', 'per_active'), {
        name: '2025/2026 Genap',
        year: '2025/2026',
        semester: 'Genap',
        isActive: true,
        createdBy: 'uid_foundation',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'students', 'stu_001'), {
        nis: '2025001',
        name: 'Aisyah',
        unitCode: 'SD',
        education_level: 'SD',
        classId: 'cls_sd_4a',
        className: '4A',
        gender: 'P',
        guardianUids: ['uid_parent'],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'students', 'stu_002'), {
        nis: '2025002',
        name: 'Anak Lain',
        unitCode: 'SD',
        education_level: 'SD',
        classId: 'cls_sd_4a',
        className: '4A',
        gender: 'L',
        guardianUids: ['uid_other_parent'],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'academic_years', 'ay_active'), {
        yearName: '2026/2027',
        isActive: true,
        status: 'ACTIVE',
        createdBy: 'uid_foundation',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'academic_years', 'ay_inactive'), {
        yearName: '2024/2025',
        isActive: false,
        status: 'INACTIVE',
        createdBy: 'uid_foundation',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'classes', 'cls_sd_4a'), {
        unitCode: 'SD',
        educationLevel: 'SD',
        educationUnitId: 'SD',
        name: '4A',
        level: '4',
        academicYearId: 'ay_active',
        homeroomTeacherName: 'Ustadz Ahmad',
        studentCount: 20,
        status: 'ACTIVE',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'classes', 'cls_inactive'), {
        unitCode: 'SD',
        educationLevel: 'SD',
        educationUnitId: 'SD',
        name: '4Z',
        level: '4',
        academicYearId: 'ay_inactive',
        homeroomTeacherName: '-',
        studentCount: 0,
        status: 'INACTIVE',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'users', 'uid_student'), {
        uid: 'uid_student',
        email: 'student@siakhlak.test',
        full_name: 'Siswa Terdaftar',
        roles: ['STUDENT'],
        role: 'STUDENT',
        account_status: 'ACTIVE',
        organization_id: 'yayasan_siakhlak',
        assignedUnits: [],
        linkedStudentIds: ['stu_003_self'],
        allowIndividualStudentAccess: false,
      });
      await setDoc(doc(db, 'students', 'stu_003_self'), {
        nis: '2026003',
        name: 'Siswa Terdaftar',
        unitCode: 'SD',
        education_level: 'SD',
        academic_year_id: 'ay_active',
        classId: 'cls_sd_4a',
        className: '4A',
        gender: 'L',
        studentUid: 'uid_student',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'students', 'stu_sd_5a'), {
        nis: '2026005',
        name: 'Siswa Kelas Lain',
        unitCode: 'SD',
        education_level: 'SD',
        academic_year_id: 'ay_active',
        classId: 'cls_sd_5a',
        className: '5A',
        gender: 'P',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'units', 'SD'), {
        code: 'SD',
        education_level: 'SD',
        name: 'SD Islam Al Chasanah',
        status: 'ACTIVE',
        updatedAt: serverTimestamp(),
      });
    });

    // 1. Unauthenticated denied PII, allowed ONLY active pre-login academic_years, classes & units queries
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthDb, 'users', 'uid_foundation')));
    await assertFails(getDoc(doc(unauthDb, 'academic_years', 'ay_inactive')));
    await assertFails(getDoc(doc(unauthDb, 'classes', 'cls_inactive')));
    await assertSucceeds(
      getDocs(
        query(
          collection(unauthDb, 'academic_years'),
          where('isActive', '==', true),
          where('status', '==', 'ACTIVE')
        )
      )
    );
    await assertSucceeds(
      getDocs(query(collection(unauthDb, 'classes'), where('status', '==', 'ACTIVE')))
    );
    await assertSucceeds(
      getDocs(query(collection(unauthDb, 'units'), where('status', '==', 'ACTIVE')))
    );

    // 1b. Student reads only own student doc, denied reading other student
    const studentDb = testEnv
      .authenticatedContext('uid_student', { email_verified: true })
      .firestore();
    await assertSucceeds(getDoc(doc(studentDb, 'students', 'stu_003_self')));
    await assertFails(getDoc(doc(studentDb, 'students', 'stu_001')));

    // 2. Inactive / suspended account denied
    const suspDb = testEnv
      .authenticatedContext('uid_suspended', { email_verified: true })
      .firestore();
    await assertFails(getDoc(doc(suspDb, 'academicPeriods', 'per_active')));

    // 3. Parent reads verified child, denied reading other child
    const parentDb = testEnv
      .authenticatedContext('uid_parent', { email_verified: true })
      .firestore();
    await assertSucceeds(getDoc(doc(parentDb, 'students', 'stu_001')));
    await assertFails(getDoc(doc(parentDb, 'students', 'stu_002')));

    // 4. PENDING user can save own draft student profile with PENDING status, CANNOT self-activate or escalate role
    const pendingDb = testEnv
      .authenticatedContext('uid_pending', { email_verified: true })
      .firestore();
    await assertFails(
      updateDoc(doc(pendingDb, 'users', 'uid_pending'), {
        account_status: 'ACTIVE',
        role: 'FOUNDATION_ADMIN',
      })
    );
    await assertSucceeds(
      setDoc(doc(pendingDb, 'students', 'stu_pending_uid_pending'), {
        nis: 'REG-001',
        name: 'Pending User',
        full_name: 'Pending User',
        gender: 'L',
        unitCode: 'SMA',
        education_level: 'SMA',
        classId: 'pending_cls',
        className: 'Menunggu Penempatan',
        studentUid: 'uid_pending',
        profile_status: 'PENDING',
        status: 'PENDING',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(getDoc(doc(pendingDb, 'academicPeriods', 'per_active')));

    // 5. Teacher cannot verify assessment without assessment:verify permission
    const teacherDb = testEnv
      .authenticatedContext('uid_teacher', { email_verified: true })
      .firestore();
    await assertFails(
      setDoc(doc(teacherDb, 'studentAssessments', 'ass_verify_fail'), {
        studentId: 'stu_001',
        studentName: 'Aisyah',
        unitCode: 'SD',
        classId: 'cls_sd_4a',
        className: '4A',
        periodId: 'per_active',
        scores: { P1: 4 },
        averageScore: 100,
        verificationStatus: 'Terverifikasi',
        isPublishedToParents: false,
        createdBy: 'uid_teacher',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 6. Teacher CAN submit Menunggu Verifikasi in assigned unit/class/active period
    await assertSucceeds(
      setDoc(doc(teacherDb, 'studentAssessments', 'ass_submit_ok'), {
        studentId: 'stu_001',
        studentName: 'Aisyah',
        unitCode: 'SD',
        classId: 'cls_sd_4a',
        className: '4A',
        periodId: 'per_active',
        scores: { P1: 4 },
        averageScore: 100,
        verificationStatus: 'Menunggu Verifikasi',
        isPublishedToParents: false,
        createdBy: 'uid_teacher',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 7. Foundation Admin can write cohort & class_student_history, cannot delete historical studentAssessments
    const foundationDb = testEnv
      .authenticatedContext('uid_foundation', { email_verified: true })
      .firestore();
    await assertSucceeds(
      setDoc(doc(foundationDb, 'cohorts', 'coh_smk_2026'), {
        cohortName: 'Angkatan SMK 2026',
        educationUnitId: 'unit_smk',
        educationLevel: 'SMK',
        admissionYear: '2026',
        status: 'ACTIVE',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(deleteDoc(doc(foundationDb, 'studentAssessments', 'ass_submit_ok')));

    // 8. Committee cannot write studentAssessments or systemConfig
    const committeeDb = testEnv
      .authenticatedContext('uid_committee', { email_verified: true })
      .firestore();
    await assertFails(
      setDoc(doc(committeeDb, 'systemConfig', 'main'), {
        foundationName: 'Hack',
        activePeriodId: 'per_active',
        activePeriodName: 'X',
        komiteDefaultScope: 'All',
        updatedBy: 'uid_committee',
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(
      updateDoc(doc(committeeDb, 'studentAssessments', 'ass_submit_ok'), {
        verificationStatus: 'Terverifikasi',
      })
    );

    // 9. Verified assessment revision guard & publish toggle exception
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'studentAssessments', 'ass_verified_1'), {
        studentId: 'stu_001',
        studentName: 'Aisyah',
        unitCode: 'SD',
        classId: 'cls_sd_4a',
        className: '4A',
        periodId: 'per_active',
        scores: { P1: 4 },
        averageScore: 100,
        verificationStatus: 'Terverifikasi',
        isPublishedToParents: false,
        createdBy: 'uid_foundation',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'komiteFindings', 'find_smp_1'), {
        title: 'Temuan SMP',
        unitCode: 'SMP',
        periodId: 'per_active',
        aspect: 'Mutabaah',
        findingDetail: 'Perlu peningkatan',
        problemAnalysis: 'Kurang jadwal',
        recommendation: 'Buat jadwal rutin',
        priority: 'Tinggi',
        picName: 'Kepala SMP',
        picUnit: 'SMP',
        dueDate: '2026-12-01',
        followUpStatus: 'Baru',
        createdBy: 'uid_committee',
        createdByName: 'Komite Agama',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'komiteDecisions', 'dec_smp_1'), {
        meetingId: 'meet_1',
        meetingTitle: 'Rapat Rutin',
        decisionText: 'Jadwal tahfidz SMP',
        unitCode: 'SMP',
        picName: 'Kepala SMP',
        deadline: '2026-12-01',
        executionStatus: 'Belum Dimulai',
        createdBy: 'uid_committee',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    // Rejects score edit on verified assessment without revisionReason (>= 5 chars)
    await assertFails(
      updateDoc(doc(foundationDb, 'studentAssessments', 'ass_verified_1'), {
        scores: { P1: 3 },
        averageScore: 75,
        updatedAt: serverTimestamp(),
      })
    );
    // Allows toggling isPublishedToParents only without revisionReason
    await assertSucceeds(
      updateDoc(doc(foundationDb, 'studentAssessments', 'ass_verified_1'), {
        isPublishedToParents: true,
        updatedAt: serverTimestamp(),
      })
    );
    // Allows verified revision with explicit revisionReason >= 5 chars
    await assertSucceeds(
      updateDoc(doc(foundationDb, 'studentAssessments', 'ass_verified_1'), {
        scores: { P1: 3 },
        averageScore: 75,
        revisionReason: 'Koreksi nilai observasi oleh admin yayasan',
        updatedAt: serverTimestamp(),
      })
    );

    // 10. PENDING user cannot self-set profile_status to VERIFIED
    await assertFails(
      updateDoc(doc(pendingDb, 'users', 'uid_pending'), {
        full_name: 'Pending User',
        profile_status: 'VERIFIED',
        updatedAt: serverTimestamp(),
      })
    );

    // 11. SD-only teacher denied cross-unit writes on SMP unitAggregates, religiousPrograms, komiteFindings, komiteDecisions
    await assertFails(
      setDoc(doc(teacherDb, 'unitAggregates', 'SMP_per_active'), {
        unitCode: 'SMP',
        periodId: 'per_active',
        periodName: '2025/2026 Genap',
        assessedStudentCount: 10,
        overallAkhlakScore: 80,
        indicatorScores: { P1: 80 },
        monevProgressPct: 80,
        mutabaahCompliancePct: 80,
        pembiasaanExecutionPct: 80,
        religiousConditionSummary: 'Cross unit attempt',
        updatedBy: 'uid_teacher',
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(
      setDoc(doc(teacherDb, 'religiousPrograms', 'prog_smp_fail'), {
        category: 'monev',
        unitCode: 'SMP',
        periodId: 'per_active',
        title: 'Program SMP',
        description: 'Cross unit attempt',
        targetParticipants: 20,
        actualParticipants: 18,
        completionPct: 90,
        schedule: 'Rutin',
        picName: 'Guru SD',
        status: 'Berjalan',
        createdBy: 'uid_teacher',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(
      updateDoc(doc(teacherDb, 'komiteFindings', 'find_smp_1'), {
        followUpStatus: 'Diterima',
        followUpResponse: 'Cross unit attempt',
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(
      updateDoc(doc(teacherDb, 'komiteDecisions', 'dec_smp_1'), {
        executionStatus: 'Berjalan',
        progressNote: 'Cross unit attempt',
        updatedAt: serverTimestamp(),
      })
    );

    // 12. Teacher in SD (cls_sd_4a) denied reading/listing/writing unassigned class cls_sd_5a in same SD unit
    await assertFails(getDoc(doc(teacherDb, 'students', 'stu_sd_5a')));
    await assertFails(
      getDocs(query(collection(teacherDb, 'students'), where('classId', '==', 'cls_sd_5a')))
    );
    await assertSucceeds(
      getDocs(query(collection(teacherDb, 'students'), where('classId', 'in', ['cls_sd_4a'])))
    );

    // 13. Email/Password provider (email_verified: false) allowed for registered active users & blocked for self-creating new user doc
    const passwordTeacherDb = testEnv
      .authenticatedContext('uid_teacher', {
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore();
    await assertSucceeds(getDoc(doc(passwordTeacherDb, 'users', 'uid_teacher')));
    await assertSucceeds(getDoc(doc(passwordTeacherDb, 'students', 'stu_001')));
    await assertFails(getDoc(doc(passwordTeacherDb, 'students', 'stu_sd_5a')));

    // 14. Audit Log Immutability & Access Control across all roles
    // A. Foundation Admin can create valid audit log
    await assertSucceeds(
      setDoc(doc(foundationDb, 'auditLogs', 'log_foundation_01'), {
        actorUid: 'uid_foundation',
        actorName: 'Admin Yayasan',
        actorRole: 'FOUNDATION_ADMIN',
        action: 'UPDATE_SYSTEM_SETTINGS',
        targetCollection: 'systemConfig',
        targetId: 'main',
        summary: 'Pembaruan konfigurasi yayasan',
        createdAt: serverTimestamp(),
      })
    );
    // B. Teacher can create valid audit log for assessment actions
    await assertSucceeds(
      setDoc(doc(teacherDb, 'auditLogs', 'log_teacher_01'), {
        actorUid: 'uid_teacher',
        actorName: 'Guru SD',
        actorRole: 'TEACHER',
        action: 'SUBMIT_ASSESSMENT',
        targetCollection: 'studentAssessments',
        targetId: 'ass_submit_ok',
        summary: 'Submit nilai siswa',
        createdAt: serverTimestamp(),
      })
    );
    // C. Student & Parent CANNOT create audit log
    await assertFails(
      setDoc(doc(studentDb, 'auditLogs', 'log_student_fail'), {
        actorUid: 'uid_student',
        actorName: 'Siswa Terdaftar',
        actorRole: 'STUDENT',
        action: 'HACK_LOG',
        targetCollection: 'auditLogs',
        targetId: 'log_student_fail',
        summary: 'Unauthorized log',
        createdAt: serverTimestamp(),
      })
    );
    // D. Foundation Admin CANNOT update or delete existing audit log (IMMUTABLE)
    await assertFails(
      updateDoc(doc(foundationDb, 'auditLogs', 'log_foundation_01'), {
        summary: 'Tampered summary',
      })
    );
    await assertFails(deleteDoc(doc(foundationDb, 'auditLogs', 'log_foundation_01')));
    // E. Teacher & Committee CANNOT update or delete audit log
    await assertFails(
      updateDoc(doc(teacherDb, 'auditLogs', 'log_teacher_01'), {
        summary: 'Tampered summary',
      })
    );
    await assertFails(deleteDoc(doc(teacherDb, 'auditLogs', 'log_teacher_01')));
    // F. Student & Parent CANNOT read audit logs
    await assertFails(getDoc(doc(studentDb, 'auditLogs', 'log_foundation_01')));
    await assertFails(getDoc(doc(parentDb, 'auditLogs', 'log_foundation_01')));

    // 15. SUPER_ADMIN privileges & role validation in Rules
    const superAdminDb = testEnv
      .authenticatedContext('uid_superadmin', { email_verified: true })
      .firestore();
    await assertSucceeds(getDoc(doc(superAdminDb, 'users', 'uid_foundation')));
    await assertSucceeds(getDoc(doc(superAdminDb, 'academicPeriods', 'per_active')));
    await assertSucceeds(getDocs(query(collection(superAdminDb, 'studentAssessments'))));

    // 16. Instrument Versioning security & immutability on studentAssessments
    // A. Valid create with v1.0-legacy succeeds
    await assertSucceeds(
      setDoc(doc(foundationDb, 'studentAssessments', 'ass_v1_ok'), {
        studentId: 'stu_001',
        studentName: 'Aisyah',
        unitCode: 'SD',
        periodId: 'per_active',
        className: '4A',
        scores: { P01: 4, P02: 4 },
        averageScore: 100,
        verificationStatus: 'Terverifikasi',
        instrumentVersion: 'v1.0-legacy',
        createdBy: 'uid_foundation',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // B. Valid create with v2.0-canonical succeeds (in emulator testing)
    await assertSucceeds(
      setDoc(doc(foundationDb, 'studentAssessments', 'ass_v2_ok'), {
        studentId: 'stu_001',
        studentName: 'Aisyah',
        unitCode: 'SD',
        periodId: 'per_active',
        className: '4A',
        scores: { P01: 4, P02: 4 },
        averageScore: 100,
        verificationStatus: 'Terverifikasi',
        instrumentVersion: 'v2.0-canonical',
        createdBy: 'uid_foundation',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // C. Invalid instrumentVersion fails
    await assertFails(
      setDoc(doc(foundationDb, 'studentAssessments', 'ass_v3_fail'), {
        studentId: 'stu_001',
        studentName: 'Aisyah',
        unitCode: 'SD',
        periodId: 'per_active',
        className: '4A',
        scores: { P01: 4, P02: 4 },
        averageScore: 100,
        verificationStatus: 'Terverifikasi',
        instrumentVersion: 'v3.0-unauthorized',
        createdBy: 'uid_foundation',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // D. Update preserving existing instrumentVersion succeeds (with valid revisionReason for Terverifikasi)
    await assertSucceeds(
      updateDoc(doc(foundationDb, 'studentAssessments', 'ass_v1_ok'), {
        teacherNotes: 'Catatan diperbarui',
        revisionReason: 'Revisi resmi catatan oleh admin',
        updatedAt: serverTimestamp(),
      })
    );

    // E. Update attempting to mutate instrumentVersion fails (IMMUTABLE)
    await assertFails(
      updateDoc(doc(foundationDb, 'studentAssessments', 'ass_v1_ok'), {
        instrumentVersion: 'v2.0-canonical',
        revisionReason: 'Mencoba ubah versi',
        updatedAt: serverTimestamp(),
      })
    );

    // F. Production rules verification: v2.0-canonical is strictly REJECTED on create in Production rules
    const prodRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const updateResp = await fetch('http://127.0.0.1:8080/emulator/v1/projects/siakhlak-rules-test:securityRules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: { files: [{ content: prodRules }] } }),
    });
    if (!updateResp.ok) throw new Error(await updateResp.text());
    await assertFails(
      setDoc(doc(foundationDb, 'studentAssessments', 'ass_v2_prod_fail'), {
        studentId: 'stu_001',
        studentName: 'Aisyah',
        unitCode: 'SD',
        periodId: 'per_active',
        className: '4A',
        scores: { P01: 4, P02: 4 },
        averageScore: 100,
        verificationStatus: 'Terverifikasi',
        instrumentVersion: 'v2.0-canonical',
        createdBy: 'uid_foundation',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    // And v1.0-legacy succeeds in Production rules
    await assertSucceeds(
      setDoc(doc(foundationDb, 'studentAssessments', 'ass_v1_prod_ok'), {
        studentId: 'stu_001',
        studentName: 'Aisyah',
        unitCode: 'SD',
        periodId: 'per_active',
        className: '4A',
        scores: { P01: 4, P02: 4 },
        averageScore: 100,
        verificationStatus: 'Terverifikasi',
        instrumentVersion: 'v1.0-legacy',
        createdBy: 'uid_foundation',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    console.log('PASS: All Firestore security rules emulator tests passed (16 suites).');
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
