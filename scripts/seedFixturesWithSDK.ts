import { auth, db } from '../src/lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDocs, collection } from 'firebase/firestore';
import { EducationLevel } from '../src/types/siakhlak';

const PREFIX = 'TEST-SIAKHLAK-2026';
const EMULATOR_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const PROJECT_ID = 'gen-lang-client-0615487865';
const DATABASE_ID = 'ai-studio-5bc153b0-7bff-4f18-9cd0-db920dac4c5b';

async function adminDelete(collectionName: string, docId: string) {
  const url = `http://${EMULATOR_HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${collectionName}/${docId}`;
  await fetch(url, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  const urlDef = `http://${EMULATOR_HOST}:${FIRESTORE_PORT}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}/${docId}`;
  await fetch(urlDef, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
}

async function seed() {
  console.log('--- Cleaning up prior test fixtures (if any) ---');
  const academicYearId = `${PREFIX}-AY-2026-2027`;
  const semester1Id = `${PREFIX}-SEM-1`;
  const semester2Id = `${PREFIX}-SEM-2`;
  const period1Id = `${PREFIX}-PER-PTS-GANJIL`;
  const period2Id = `${PREFIX}-PER-PAS-GANJIL`;

  await adminDelete('academic_years', academicYearId);
  await adminDelete('semesters', semester1Id);
  await adminDelete('semesters', semester2Id);
  await adminDelete('academicPeriods', period1Id);
  await adminDelete('academicPeriods', period2Id);

  for (const lvl of ['TK', 'SD', 'SMP', 'SMA', 'SMK']) {
    await adminDelete('units', `${PREFIX}-UNIT-${lvl}`);
    await adminDelete('education_units', `${PREFIX}-UNIT-${lvl}`);
    await adminDelete('unitAggregates', `${PREFIX}-AGG-${lvl}-${period1Id}`);
  }

  const classConfigs: { unitCode: EducationLevel; code: string; name: string; level: string }[] = [
    { unitCode: 'TK', code: 'TK-A', name: 'Kelompok A (Bintang)', level: 'TK-A' },
    { unitCode: 'TK', code: 'TK-B', name: 'Kelompok B (Matahari)', level: 'TK-B' },
    { unitCode: 'SD', code: '1A', name: 'Kelas 1-A (Ibnu Sina)', level: '1' },
    { unitCode: 'SD', code: '1B', name: 'Kelas 1-B (Al-Farabi)', level: '1' },
    { unitCode: 'SMP', code: '7A', name: 'Kelas 7-A (Imam Bukhari)', level: '7' },
    { unitCode: 'SMP', code: '7B', name: 'Kelas 7-B (Imam Muslim)', level: '7' },
    { unitCode: 'SMA', code: '10IPA', name: 'Kelas 10-IPA 1 (Al-Biruni)', level: '10' },
    { unitCode: 'SMA', code: '10IPS', name: 'Kelas 10-IPS 1 (Ibnu Khaldun)', level: '10' },
    { unitCode: 'SMK', code: '10RPL', name: 'Kelas 10-RPL 1 (Software)', level: '10' },
    { unitCode: 'SMK', code: '10TKJ', name: 'Kelas 10-TKJ 1 (Network)', level: '10' },
  ];

  for (const c of classConfigs) {
    await adminDelete('classes', `${PREFIX}-CLS-${c.unitCode}-${c.code}`);
  }

  for (let i = 0; i < 10; i++) {
    const cls = classConfigs[i];
    await adminDelete('teachers', `${PREFIX}-TCH-${cls.unitCode}-${i + 1}`);
  }

  for (const lvl of ['TK', 'SD', 'SMP', 'SMA', 'SMK']) {
    for (let s = 1; s <= 5; s++) {
      const sId = `${PREFIX}-STU-${lvl}-${s}`;
      await adminDelete('students', sId);
      await adminDelete('studentAssessments', `${PREFIX}-ASS-${sId}`);
    }
  }

  console.log('Cleanup finished.');

  console.log('--- Signing in as Super Admin to Firestore Emulator ---');
  await signInWithEmailAndPassword(auth, 'superadmin.local@alchasanah.sch.id', 'uat123');
  console.log('Authenticated successfully as:', auth.currentUser?.email);

  const uid = auth.currentUser!.uid;

  // 1. Academic Year
  console.log('1/9 Seeding Academic Year...');
  await setDoc(doc(db, 'academic_years', academicYearId), {
    yearName: '2026/2027',
    startDate: '2026-07-15',
    endDate: '2027-06-25',
    isActive: true,
    status: 'ACTIVE',
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2. Semesters
  console.log('2/9 Seeding Semesters...');
  await setDoc(doc(db, 'semesters', semester1Id), {
    academicYearId,
    yearName: '2026/2027',
    semester: 'Ganjil',
    name: 'Semester Ganjil 2026/2027',
    isActive: true,
    status: 'ACTIVE',
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'semesters', semester2Id), {
    academicYearId,
    yearName: '2026/2027',
    semester: 'Genap',
    name: 'Semester Genap 2026/2027',
    isActive: false,
    status: 'INACTIVE',
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 3. Academic Periods
  console.log('3/9 Seeding Academic Periods...');
  await setDoc(doc(db, 'academicPeriods', period1Id), {
    name: 'Penilaian Tengah Semester Ganjil 2026/2027',
    year: '2026/2027',
    semester: 'Ganjil',
    academicYearId,
    isActive: true,
    status: 'ACTIVE',
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'academicPeriods', period2Id), {
    name: 'Penilaian Akhir Semester Ganjil 2026/2027',
    year: '2026/2027',
    semester: 'Ganjil',
    academicYearId,
    isActive: false,
    status: 'INACTIVE',
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 4. Units (5 Education Units)
  console.log('4/9 Seeding 5 Education Units...');
  const unitDefs: { code: EducationLevel; name: string; headName: string; phone: string }[] = [
    { code: 'TK', name: 'TK Islam Terpadu Al Chasanah', headName: 'Ustadzah Fatimah, S.Pd.I', phone: '021-5550101' },
    { code: 'SD', name: 'SD Islam Terpadu Al Chasanah', headName: 'H. Ahmad Dahlan, M.Pd', phone: '021-5550102' },
    { code: 'SMP', name: 'SMP Islam Terpadu Al Chasanah', headName: 'Drs. H. M. Yusuf, M.Ag', phone: '021-5550103' },
    { code: 'SMA', name: 'SMA Islam Al Chasanah', headName: 'Dr. H. Sulaiman, M.Si', phone: '021-5550104' },
    { code: 'SMK', name: 'SMK Teknologi Al Chasanah', headName: 'Ir. Hendra Gunawan, M.T', phone: '021-5550105' },
  ];

  for (const u of unitDefs) {
    const uId = `${PREFIX}-UNIT-${u.code}`;
    const uData = {
      code: u.code,
      education_level: u.code,
      name: u.name,
      headName: u.headName,
      phone: u.phone,
      studentCount: 5,
      teacherCount: 2,
      classCount: 2,
      status: 'ACTIVE',
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'units', uId), uData);
    await setDoc(doc(db, 'education_units', uId), uData);
  }

  // 5. Classes (10 Classes)
  console.log('5/9 Seeding 10 Classes...');
  const classes: { id: string; unitCode: EducationLevel; name: string }[] = [];
  for (const c of classConfigs) {
    const cId = `${PREFIX}-CLS-${c.unitCode}-${c.code}`;
    const payload = {
      unitCode: c.unitCode,
      educationLevel: c.unitCode,
      educationUnitId: `${PREFIX}-UNIT-${c.unitCode}`,
      name: c.name,
      className: c.name,
      level: c.level,
      academicYearId,
      semesterId: semester1Id,
      homeroomTeacherName: `Wali Kelas ${c.name}`,
      studentCount: 3,
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'classes', cId), payload);
    classes.push({ id: cId, unitCode: c.unitCode, name: c.name });
  }

  // 6. Teachers (10 Teachers)
  console.log('6/9 Seeding 10 Teachers...');
  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    const tId = `${PREFIX}-TCH-${cls.unitCode}-${i + 1}`;
    const nip = `198501012010011${String(i + 1).padStart(3, '0')}`;
    await setDoc(doc(db, 'teachers', tId), {
      nip,
      employee_number: nip,
      name: `Ustadz/Ustadzah Guru ${cls.name}`,
      full_name: `Ustadz/Ustadzah Guru ${cls.name}`,
      unitCode: cls.unitCode,
      education_level: cls.unitCode,
      roleTitle: 'Guru & Wali Kelas',
      gender: i % 2 === 0 ? 'L' : 'P',
      isPaiTeacher: true,
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 7. Students (25 Students)
  console.log('7/9 Seeding 25 Students...');
  const names = [
    'Ahmad Fauzi', 'Aisyah Humaira', 'Bilal Al-Habasyi', 'Dhiya Ulhaq', 'Fathimah Azzahra',
    'Hasan Basri', 'Ibrahim Khalil', 'Khadijah Al-Kubra', 'Luqman Hakim', 'Maryam Binti Imran',
    'Muhammad Al-Fatih', 'Naufal Faris', 'Nurul Izzah', 'Raihan Syahputra', 'Salsabila Rahma',
    'Thoriq Bin Ziyad', 'Umar Al-Faruq', 'Usman Bin Affan', 'Zaid Bin Tsabit', 'Zulfa Nailah',
    'Ali Bin Abi Thalib', 'Hamzah Bin Abdul Muthalib', 'Salman Al-Farisi', 'Khalid Bin Walid', 'Saad Bin Abi Waqqas'
  ];

  let nameIdx = 0;
  const students: { id: string; unitCode: EducationLevel; nis: string; name: string; classId: string }[] = [];

  for (const level of ['TK', 'SD', 'SMP', 'SMA', 'SMK'] as EducationLevel[]) {
    const unitClasses = classes.filter((c) => c.unitCode === level);
    for (let s = 1; s <= 5; s++) {
      const assignedClass = unitClasses[s % unitClasses.length];
      const sId = `${PREFIX}-STU-${level}-${s}`;
      const nis = `2026${level}${String(s).padStart(3, '0')}`;
      const nisn = `00${level.charCodeAt(0)}${String(s).padStart(6, '0')}`;
      const sName = names[nameIdx++] || `Siswa ${level} ${s}`;

      await setDoc(doc(db, 'students', sId), {
        nis,
        nisn,
        name: sName,
        full_name: sName,
        gender: s % 2 === 0 ? 'L' : 'P',
        unitCode: level,
        education_level: level,
        education_unit_id: `${PREFIX}-UNIT-${level}`,
        classId: assignedClass.id,
        class_id: assignedClass.id,
        className: assignedClass.name,
        academic_year_id: academicYearId,
        semester_id: semester1Id,
        admission_year: '2026',
        status: 'ACTIVE',
        account_status: 'ACTIVE',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      students.push({ id: sId, unitCode: level, nis, name: sName, classId: assignedClass.id });
    }
  }

  // 8. Assessments (25 Student Assessments)
  console.log('8/9 Seeding 25 Assessments...');
  for (let i = 0; i < students.length; i++) {
    const stu = students[i];
    const assId = `${PREFIX}-ASS-${stu.id}`;

    const scores: Record<string, number | null> = {};
    let sum = 0;
    let count = 0;
    for (let ind = 1; ind <= 31; ind++) {
      const code = ind < 10 ? `P0${ind}` : `P${ind}`;
      if (ind === 31 && i % 2 === 0) {
        scores[code] = null;
      } else {
        const val = ((ind + i) % 4) + 1; // 1, 2, 3, 4
        scores[code] = val;
        sum += val;
        count++;
      }
    }
    const averageScore = Number((sum / count).toFixed(2));

    await setDoc(doc(db, 'studentAssessments', assId), {
      studentId: stu.id,
      studentName: stu.name,
      nis: stu.nis,
      unitCode: stu.unitCode,
      educationLevel: stu.unitCode,
      classId: stu.classId,
      className: classes.find((c) => c.id === stu.classId)?.name || 'Kelas',
      periodId: period1Id,
      academicYearId,
      semesterId: semester1Id,
      scores,
      averageScore,
      verificationStatus: 'Terverifikasi',
      isPublishedToParents: true,
      instrumentVersion: 'v1.0-legacy',
      importSource: 'manual',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // 9. Unit Aggregates (5 Units)
  console.log('9/9 Seeding 5 Unit Aggregates...');
  for (const level of ['TK', 'SD', 'SMP', 'SMA', 'SMK'] as EducationLevel[]) {
    const aggId = `${PREFIX}-AGG-${level}-${period1Id}`;
    await setDoc(doc(db, 'unitAggregates', aggId), {
      unitCode: level,
      periodId: period1Id,
      periodName: 'Penilaian Tengah Semester Ganjil 2026/2027',
      assessedStudentCount: 5,
      overallAkhlakScore: 87.5,
      indicatorScores: { P01: 4, P02: 4, P03: 3.5 },
      monevProgressPct: 90,
      mutabaahCompliancePct: 85,
      pembiasaanExecutionPct: 88,
      religiousConditionSummary: 'Sangat Baik',
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
  }

  // Verify counts in DB
  const stuSnap = await getDocs(collection(db, 'students'));
  const clsSnap = await getDocs(collection(db, 'classes'));
  const assSnap = await getDocs(collection(db, 'studentAssessments'));
  const tchSnap = await getDocs(collection(db, 'teachers'));
  const uniSnap = await getDocs(collection(db, 'units'));
  const aySnap = await getDocs(collection(db, 'academic_years'));
  const semSnap = await getDocs(collection(db, 'semesters'));
  const perSnap = await getDocs(collection(db, 'academicPeriods'));
  const aggSnap = await getDocs(collection(db, 'unitAggregates'));

  console.log(`\n=================================================`);
  console.log(`🎉 ALL FIXTURES SEEDED VIA FIREBASE JS SDK!`);
  console.log(`=================================================`);
  console.log(`- Academic Years:  ${aySnap.size}`);
  console.log(`- Semesters:       ${semSnap.size}`);
  console.log(`- Periods:         ${perSnap.size}`);
  console.log(`- Education Units: ${uniSnap.size}`);
  console.log(`- Classes:         ${clsSnap.size}`);
  console.log(`- Teachers:        ${tchSnap.size}`);
  console.log(`- Students:        ${stuSnap.size}`);
  console.log(`- Assessments:     ${assSnap.size}`);
  console.log(`- Unit Aggregates: ${aggSnap.size}`);
  console.log(`=================================================\n`);
}

seed().catch(console.error);
