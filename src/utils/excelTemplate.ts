import * as XLSX from 'xlsx';
import {
  AKHLAK_31_INDICATORS,
  AcademicPeriod,
  EDUCATION_LEVEL_LABELS,
  normalizeEducationLevel,
  SchoolClass,
  Student,
} from '../types/siakhlak';

export const TEMPLATE_VERSION = 'SIAKHLAK-31-V3.0';

export const IDENTITAS_HEADERS = [
  'template_version',
  'student_nis',
  'student_nisn',
  'student_name',
  'education_level',
  'education_unit',
  'cohort_name',
  'class_id',
  'class_name',
  'academic_year',
  'semester',
  'period_id',
  'assessment_month',
  'assessment_year',
  'teacher_identifier',
] as const;

export const PENILAIAN_HEADERS = [
  'student_nis',
  ...AKHLAK_31_INDICATORS.map((i) => i.excelCode),
  'catatan_guru',
] as const;

export const REFERENSI_HEADERS = [
  'kode',
  'nomor',
  'ranah',
  'indikator',
  'deskripsi_skala',
] as const;

export interface AssessmentTemplateParams {
  student: Student;
  schoolClass: SchoolClass;
  period: AcademicPeriod;
  assessmentMonth: string;
  assessmentYear: string;
  teacherIdentifier: string;
  cohortName?: string;
}

export function buildAssessmentWorkbook(params: AssessmentTemplateParams): XLSX.WorkBook {
  const {
    student,
    schoolClass,
    period,
    assessmentMonth,
    assessmentYear,
    teacherIdentifier,
    cohortName,
  } = params;

  const level = normalizeEducationLevel(schoolClass.educationLevel || schoolClass.unitCode);
  const resolvedCohort = cohortName || schoolClass.cohortName || schoolClass.cohortId || student.cohort_id || '-';

  const wb = XLSX.utils.book_new();

  // Sheet 1: PETUNJUK
  const petunjukRows: string[][] = [
    ['PETUNJUK PENGISIAN TEMPLATE PENILAIAN 31 INDIKATOR AKHLAKUL KARIMAH (SIAKHLAK)'],
    ['Versi Template Resmi', TEMPLATE_VERSION],
    [''],
    ['ATURAN PENGISIAN SKALA NILAI (WAJIB DIPATUHI):'],
    ['1', 'Belum Berkembang (Memerlukan bimbingan intensif)'],
    ['2', 'Mulai Berkembang (Menunjukkan pemahaman dengan pengingat guru)'],
    ['3', 'Berkembang Sesuai Harapan (Konsisten melaksanakan secara mandiri)'],
    ['4', 'Membudaya / Teladan (Menjadi pembiasaan kuat dan menginspirasi teman)'],
    ['Kosong (NULL)', 'Kosongkan sel jika indikator belum dinilai. JANGAN mengisi huruf atau 0.'],
    [''],
    ['KETENTUAN KEAMANAN & VALIDASI TEMPLATE:'],
    ['- Jangan mengubah nama sheet (PETUNJUK, IDENTITAS_PENILAIAN, PENILAIAN, REFERENSI_INDIKATOR).'],
    ['- Jangan mengubah struktur header kolom atau urutan P1 s.d. P31.'],
    ['- Satu file Excel berlaku untuk SATU siswa pada SATU kelas, jenjang resmi (TK/SD/SMP/SMA/SMK), dan periode.'],
    ['- Jenjang resmi Yayasan: TK, SD, SMP, SMA, SMK.'],
    ['- Kolom P1 s.d. P31 sengaja dikosongkan tanpa nilai default agar guru mengisi sesuai kondisi riil.'],
    ['- Siswa baru harus didaftarkan terlebih dahulu di SIAKHLAK sebelum import penilaian dilakukan.'],
  ];
  const wsPetunjuk = XLSX.utils.aoa_to_sheet(petunjukRows);
  wsPetunjuk['!cols'] = [{ wch: 24 }, { wch: 92 }];
  XLSX.utils.book_append_sheet(wb, wsPetunjuk, 'PETUNJUK');

  // Sheet 2: IDENTITAS_PENILAIAN
  const identitasRows: (string | number)[][] = [
    [...IDENTITAS_HEADERS],
    [
      TEMPLATE_VERSION,
      student.nis || '',
      student.nisn || '',
      student.full_name || student.name || '',
      level,
      EDUCATION_LEVEL_LABELS[level],
      resolvedCohort,
      schoolClass.id,
      schoolClass.className || schoolClass.name,
      period.year,
      period.semester,
      period.id,
      assessmentMonth,
      assessmentYear,
      teacherIdentifier,
    ],
  ];
  const wsIdentitas = XLSX.utils.aoa_to_sheet(identitasRows);
  wsIdentitas['!cols'] = IDENTITAS_HEADERS.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, wsIdentitas, 'IDENTITAS_PENILAIAN');

  // Sheet 3: PENILAIAN (EMPTY values for P1..P31 — NO default 4!)
  const penilaianRow: (string | null)[] = [
    student.nis || '',
    ...AKHLAK_31_INDICATORS.map(() => ''),
    '',
  ];
  const wsPenilaian = XLSX.utils.aoa_to_sheet([
    [...PENILAIAN_HEADERS],
    penilaianRow,
  ]);
  wsPenilaian['!cols'] = [
    { wch: 16 },
    ...AKHLAK_31_INDICATORS.map(() => ({ wch: 7 })),
    { wch: 36 },
  ];
  XLSX.utils.book_append_sheet(wb, wsPenilaian, 'PENILAIAN');

  // Sheet 4: REFERENSI_INDIKATOR (All 31 Official Indicators)
  const refRows: (string | number)[][] = [
    [...REFERENSI_HEADERS],
    ...AKHLAK_31_INDICATORS.map((ind) => [
      ind.excelCode,
      ind.number,
      ind.domain,
      ind.title,
      `${ind.description} (Skala 1-4 atau kosong/NULL)`,
    ]),
  ];
  const wsRef = XLSX.utils.aoa_to_sheet(refRows);
  wsRef['!cols'] = [
    { wch: 8 },
    { wch: 8 },
    { wch: 24 },
    { wch: 48 },
    { wch: 64 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRef, 'REFERENSI_INDIKATOR');

  return wb;
}

export function buildTemplateFilename(
  schoolClass: SchoolClass,
  student: Student,
  period: AcademicPeriod
): string {
  const clean = (s: string) =>
    s
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);
  const level = normalizeEducationLevel(schoolClass.educationLevel || schoolClass.unitCode);
  return `SIAKHLAK_${clean(level)}_${clean(schoolClass.className || schoolClass.name)}_${clean(student.nis)}_${clean(student.full_name || student.name)}_${clean(period.year)}_${clean(period.semester)}.xlsx`;
}

export function downloadAssessmentTemplate(params: AssessmentTemplateParams): void {
  const wb = buildAssessmentWorkbook(params);
  const filename = buildTemplateFilename(params.schoolClass, params.student, params.period);
  XLSX.writeFile(wb, filename);
}
