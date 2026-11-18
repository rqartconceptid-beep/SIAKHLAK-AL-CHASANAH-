import * as XLSX from 'xlsx';
import {
  AKHLAK_31_INDICATORS,
  AcademicPeriod,
  EDUCATION_LEVEL_LABELS,
  InstrumentVersion,
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
  'instrument_version',
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

export const STUDENT_PARENT_HEADERS = [
  'NIS',
  'NAMA_SISWA',
  'JENIS_KELAMIN',
  'TEMPAT_LAHIR',
  'TANGGAL_LAHIR',
  'JENJANG',
  'UNIT_SEKOLAH',
  'TAHUN_AJARAN',
  'KODE_KELAS',
  'STATUS_SISWA',
  'EMAIL_SISWA',
  'NAMA_ORANG_TUA',
  'HUBUNGAN',
  'EMAIL_ORANG_TUA',
  'NO_HP_ORANG_TUA',
  'ALAMAT',
] as const;

export const TEACHER_ASSIGNMENT_HEADERS = [
  'KODE_GURU',
  'NAMA_GURU',
  'EMAIL_GURU',
  'NO_HP',
  'JENJANG',
  'UNIT_SEKOLAH',
  'TAHUN_AJARAN',
  'KODE_KELAS',
  'NAMA_KELAS',
  'JENIS_PENUGASAN',
  'MATA_PELAJARAN',
  'STATUS_PENUGASAN',
] as const;

export const BATCH_PENILAIAN_HEADERS = [
  'NIS',
  'NAMA_SISWA',
  'JENJANG',
  'UNIT_SEKOLAH',
  'TAHUN_AJARAN',
  'SEMESTER',
  'KODE_KELAS',
  'PERIODE_PENILAIAN',
  'NAMA_WALI_KELAS',
  'EMAIL_PENILAI',
  ...AKHLAK_31_INDICATORS.map((i) => i.excelCode),
  'CATATAN_PEMBINAAN',
  'BUKTI_OBSERVASI',
  'TANGGAL_PENILAIAN',
  'STATUS_PENILAIAN',
] as const;

export const REKAP_PENILAIAN_HEADERS = [
  'NO',
  'NIS',
  'NAMA_SISWA',
  'KODE_KELAS',
  'TOTAL_INDIKATOR',
  'INDIKATOR_DINILAI',
  'INDIKATOR_BELUM_DINILAI',
  'TOTAL_SKOR',
  'RATA_RATA_SKOR',
  'STATUS_PENILAIAN',
  'PREDIKAT',
  'CATATAN_PEMBINAAN',
] as const;

export interface AssessmentTemplateParams {
  student: Student;
  schoolClass: SchoolClass;
  period: AcademicPeriod;
  assessmentMonth: string;
  assessmentYear: string;
  teacherIdentifier: string;
  cohortName?: string;
  instrumentVersion?: InstrumentVersion;
}

/**
 * Universal browser-safe file download trigger.
 * Uses standard Blob and ObjectURL in browser contexts,
 * with graceful fallback to XLSX.writeFile in NodeJS/Bun test environments.
 */
export function triggerFileDownload(wb: XLSX.WorkBook, filename: string): void {
  try {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 250);
      return;
    }
  } catch (err) {
    console.warn('triggerFileDownload fallback to XLSX.writeFile', err);
  }
  XLSX.writeFile(wb, filename);
}

// -------------------------------------------------------------
// TEMPLATE 1: DATA SISWA DAN ORANG TUA
// -------------------------------------------------------------

export function buildStudentParentTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Sheet 1: PETUNJUK
  const petunjukRows: (string | number)[][] = [
    ['PETUNJUK PENGISIAN TEMPLATE DATA MASTER SISWA DAN ORANG TUA / WALI'],
    ['YAYASAN PENDIDIKAN AL CHASANAH (SIAKHLAK)'],
    ['Versi Dokumen', 'SIAKHLAK-MASTER-SISWA-V1.0'],
    [''],
    ['KETENTUAN PENGISIAN DATA SISWA & ORANG TUA (WAJIB DIBACA):'],
    ['1. Relasi Baris', 'Setiap baris mewakili 1 hubungan antara 1 Siswa dengan 1 Orang Tua/Wali.'],
    ['2. Multi-Wali', 'Jika 1 siswa memiliki ayah dan ibu (atau wali), tuliskan dalam 2 baris terpisah dengan NIS dan Data Siswa yang sama, namun kolom data orang tua berbeda.'],
    ['3. Multi-Anak', 'Jika 1 orang tua memiliki lebih dari 1 anak yang bersekolah di Al-Chasanah, tuliskan data anak di baris masing-masing dengan data Orang Tua yang sama.'],
    ['4. Keunikan NIS', 'Nomor Induk Siswa (NIS) adalah identitas utama unik. Siswa tidak boleh diduplikasi dengan NIS berbeda.'],
    ['5. Kebijakan Akun & Email', 'Email siswa dan email orang tua WAJIB BERBEDA untuk menjaga keamanan login portal terpisah.'],
    ['6. Format Tanggal', 'Format tanggal lahir: YYYY-MM-DD (Contoh: 2012-08-17).'],
    ['7. Jenjang & Unit Resmi', 'Jenjang: KB/TK, SD, SMP, SMA, SMK. Lihat sheet REFERENSI untuk kode lengkap.'],
    ['8. Status Siswa', 'Gunakan "ACTIVE" untuk siswa aktif dan "INACTIVE" untuk nonaktif.'],
    ['9. Baris Berawalan [CONTOH]', 'Hapus atau biarkan baris contoh bertanda [CONTOH]. Sistem akan secara otomatis mengabaikan baris contoh saat import.'],
    [''],
    ['DAFTAR SHEET PADA FILE INI:'],
    ['1. PETUNJUK', 'Berisi panduan dan ketentuan pengisian.'],
    ['2. DATA_SISWA_ORANG_TUA', 'Sheet utama pengisian data siswa dan orang tua / wali.'],
    ['3. REFERENSI', 'Daftar pilihan valid untuk jenjang, unit sekolah, hubungan, dan status.'],
    ['4. MASTER_31_INDIKATOR', 'Tabel lengkap 31 Indikator Akhlakul Karimah sebagai referensi kompetensi.'],
  ];
  const wsPetunjuk = XLSX.utils.aoa_to_sheet(petunjukRows);
  wsPetunjuk['!cols'] = [{ wch: 28 }, { wch: 95 }];
  XLSX.utils.book_append_sheet(wb, wsPetunjuk, 'PETUNJUK');

  // Sheet 2: DATA_SISWA_ORANG_TUA
  const sampleRows: (string | number)[][] = [
    [
      '[CONTOH] 20260001',
      'Ahmad Fadhil Prasetya',
      'L',
      'Jakarta',
      '2012-05-14',
      'SMP',
      'SMP Al-Chasanah',
      '2025/2026',
      '7A',
      'ACTIVE',
      'ahmad.fadhil@siswa.alchasanah.sch.id',
      'Bambang Prasetyo',
      'ayah',
      'bambang.prasetyo@gmail.com',
      '081234567890',
      'Jl. Tanjung Duren Barat No. 12, Grogol Petamburan, Jakarta Barat',
    ],
    [
      '[CONTOH] 20260001',
      'Ahmad Fadhil Prasetya',
      'L',
      'Jakarta',
      '2012-05-14',
      'SMP',
      'SMP Al-Chasanah',
      '2025/2026',
      '7A',
      'ACTIVE',
      'ahmad.fadhil@siswa.alchasanah.sch.id',
      'Siti Nurhaliza',
      'ibu',
      'siti.nurhaliza@gmail.com',
      '081298765432',
      'Jl. Tanjung Duren Barat No. 12, Grogol Petamburan, Jakarta Barat',
    ],
    [
      '[CONTOH] 20260002',
      'Aisyah Putri Azzahra',
      'P',
      'Jakarta',
      '2015-10-22',
      'SD',
      'SD Al-Chasanah',
      '2025/2026',
      '4B',
      'ACTIVE',
      'aisyah.azzahra@siswa.alchasanah.sch.id',
      'Hendro Gunawan',
      'ayah',
      'hendro.gunawan@yahoo.com',
      '081311223344',
      'Jl. Tubagus Angke No. 45, Jakarta Barat',
    ],
    // Empty blank entry rows
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ];

  const wsData = XLSX.utils.aoa_to_sheet([
    [...STUDENT_PARENT_HEADERS],
    ...sampleRows,
  ]);
  wsData['!cols'] = [
    { wch: 18 }, // NIS
    { wch: 28 }, // NAMA_SISWA
    { wch: 14 }, // JENIS_KELAMIN
    { wch: 16 }, // TEMPAT_LAHIR
    { wch: 15 }, // TANGGAL_LAHIR
    { wch: 10 }, // JENJANG
    { wch: 20 }, // UNIT_SEKOLAH
    { wch: 15 }, // TAHUN_AJARAN
    { wch: 14 }, // KODE_KELAS
    { wch: 14 }, // STATUS_SISWA
    { wch: 32 }, // EMAIL_SISWA
    { wch: 26 }, // NAMA_ORANG_TUA
    { wch: 12 }, // HUBUNGAN
    { wch: 30 }, // EMAIL_ORANG_TUA
    { wch: 18 }, // NO_HP_ORANG_TUA
    { wch: 55 }, // ALAMAT
  ];
  XLSX.utils.book_append_sheet(wb, wsData, 'DATA_SISWA_ORANG_TUA');

  // Sheet 3: REFERENSI
  const refRows: (string | number)[][] = [
    ['KATEGORI', 'KODE / NILAI', 'KETERANGAN'],
    ['JENJANG', 'KB/TK', 'Pendidikan Anak Usia Dini / Taman Kanak-Kanak'],
    ['JENJANG', 'SD', 'Sekolah Dasar Islam Al-Chasanah'],
    ['JENJANG', 'SMP', 'Sekolah Menengah Pertama Islam Al-Chasanah'],
    ['JENJANG', 'SMA', 'Sekolah Menengah Atas Islam Al-Chasanah'],
    ['JENJANG', 'SMK', 'Sekolah Menengah Kejuruan Al-Chasanah'],
    ['JENIS_KELAMIN', 'L', 'Laki-laki'],
    ['JENIS_KELAMIN', 'P', 'Perempuan'],
    ['HUBUNGAN', 'ayah', 'Ayah Kandung / Ayah Angkat Resmi'],
    ['HUBUNGAN', 'ibu', 'Ibu Kandung / Ibu Angkat Resmi'],
    ['HUBUNGAN', 'wali', 'Wali Sah Siswa'],
    ['STATUS_SISWA', 'ACTIVE', 'Siswa aktif terdaftar'],
    ['STATUS_SISWA', 'INACTIVE', 'Siswa non-aktif / mutasi / lulus'],
    ['UNIT_SEKOLAH', 'KB Al-Chasanah', 'Kelompok Bermain Al-Chasanah'],
    ['UNIT_SEKOLAH', 'TK Al-Chasanah', 'Taman Kanak-Kanak Al-Chasanah'],
    ['UNIT_SEKOLAH', 'SD Al-Chasanah', 'SD Al-Chasanah'],
    ['UNIT_SEKOLAH', 'SMP Al-Chasanah', 'SMP Al-Chasanah'],
    ['UNIT_SEKOLAH', 'SMA Al-Chasanah', 'SMA Al-Chasanah'],
    ['UNIT_SEKOLAH', 'SMK Al-Chasanah', 'SMK Al-Chasanah'],
  ];
  const wsRef = XLSX.utils.aoa_to_sheet(refRows);
  wsRef['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsRef, 'REFERENSI');

  // Sheet 4: MASTER_31_INDIKATOR
  const master31Rows: (string | number)[][] = [
    ['KODE', 'NOMOR', 'RANAH', 'INDIKATOR', 'DESKRIPSI', 'SKALA_PENILAIAN'],
    ...AKHLAK_31_INDICATORS.map((ind) => [
      ind.excelCode,
      ind.number,
      ind.domain,
      ind.title,
      ind.description,
      '1: Kurang / Belum Berkembang | 2: Cukup / Mulai Berkembang | 3: Baik / Berkembang Sesuai Harapan | 4: Sangat Baik / Membudaya | Kosong: Belum Dinilai',
    ]),
  ];
  const wsMaster31 = XLSX.utils.aoa_to_sheet(master31Rows);
  wsMaster31['!cols'] = [
    { wch: 8 },
    { wch: 8 },
    { wch: 32 },
    { wch: 45 },
    { wch: 60 },
    { wch: 45 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMaster31, 'MASTER_31_INDIKATOR');

  return wb;
}

// -------------------------------------------------------------
// TEMPLATE 2: DATA GURU, WALI KELAS, & PENILAIAN 31 INDIKATOR
// -------------------------------------------------------------

export function buildTeacherAssignmentAssessmentWorkbook(
  prefilledStudents?: Student[],
  prefilledClass?: SchoolClass,
  prefilledPeriod?: AcademicPeriod
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Sheet 1: PETUNJUK
  const petunjukRows: (string | number)[][] = [
    ['PETUNJUK TEMPLATE EXCEL GURU, WALI KELAS, DAN PENILAIAN 31 INDIKATOR AKHLAKUL KARIMAH'],
    ['YAYASAN PENDIDIKAN AL CHASANAH (SIAKHLAK)'],
    ['Versi Dokumen', 'SIAKHLAK-TEACHER-ASSESSMENT-V1.0'],
    [''],
    ['ATURAN PENGISIAN PENILAIAN 31 INDIKATOR (SANGAT PENTING):'],
    ['1. Skala Nilai Resmi', 'Hanya gunakan angka bulat 1, 2, 3, atau 4.'],
    ['   Skala 1', 'Kurang / Belum Berkembang (Memerlukan pembinaan khusus & bimbingan intensif).'],
    ['   Skala 2', 'Cukup / Mulai Berkembang (Mulai memahami dan mempraktikkan dengan pengingat berkala).'],
    ['   Skala 3', 'Baik / Berkembang Sesuai Harapan (Konsisten dan mandiri dalam perilaku terpuji).'],
    ['   Skala 4', 'Sangat Baik / Membudaya (Konsisten membiasakan diri serta menjadi teladan bagi rekan sebaya).'],
    ['2. Sel Kosong (NULL)', 'KOSONGKAN sel jika indikator belum diobservasi/dinilai. Sel kosong diartikan "BELUM DINILAI".'],
    ['   PERINGATAN KERAS', 'JANGAN PERNAH mengasumsikan nilai default 4! Penilaian harus riil mencerminkan observasi akhlak.'],
    ['3. Rekapitulasi Otomatis', 'Sheet REKAP_PENILAIAN secara otomatis menghitung Jumlah Dinilai, Belum Dinilai, Total Skor, Rata-rata, Status Kelengkapan, dan Predikat Akhir.'],
    ['4. Kriteria Predikat', 'Ambang predikat kelulusan akhlak (SB, B, C, K) menunggu pengesahan resmi kebijakan Yayasan. Apabila seluruh 31 indikator telah dinilai LENGKAP, status predikat ditandai "MENUNGGU KEBIJAKAN PREDIKAT YAYASAN". Penilaian belum lengkap tidak menghasilkan predikat akhir.'],
    ['5. Baris Berawalan [CONTOH]', 'Baris contoh demonstrasi bertanda [CONTOH] diabaikan otomatis saat sinkronisasi data.'],
  ];
  const wsPetunjuk = XLSX.utils.aoa_to_sheet(petunjukRows);
  wsPetunjuk['!cols'] = [{ wch: 28 }, { wch: 95 }];
  XLSX.utils.book_append_sheet(wb, wsPetunjuk, 'PETUNJUK');

  // Sheet 2: DATA_GURU_WALI_KELAS
  const teacherRows: (string | number)[][] = [
    [
      '[CONTOH] G-SMP-001',
      'Ustadz Abdullah Syafi\'i, S.Pd.I',
      'abdullah.syafii@alchasanah.sch.id',
      '081234567891',
      'SMP',
      'SMP Al-Chasanah',
      '2025/2026',
      '7A',
      'Kelas 7A',
      'WALI_KELAS',
      'Pendidikan Agama Islam',
      'ACTIVE',
    ],
    [
      '[CONTOH] G-SD-002',
      'Ustadzah Fatimah Azzahra, S.Pd',
      'fatimah.azzahra@alchasanah.sch.id',
      '081398765432',
      'SD',
      'SD Al-Chasanah',
      '2025/2026',
      '4B',
      'Kelas 4B',
      'GURU_MAPEL',
      'Bahasa Arab & Akhlak',
      'ACTIVE',
    ],
    // Blank rows for input
    ['', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', ''],
  ];
  const wsTeacher = XLSX.utils.aoa_to_sheet([
    [...TEACHER_ASSIGNMENT_HEADERS],
    ...teacherRows,
  ]);
  wsTeacher['!cols'] = [
    { wch: 18 }, // KODE_GURU
    { wch: 32 }, // NAMA_GURU
    { wch: 32 }, // EMAIL_GURU
    { wch: 16 }, // NO_HP
    { wch: 10 }, // JENJANG
    { wch: 20 }, // UNIT_SEKOLAH
    { wch: 15 }, // TAHUN_AJARAN
    { wch: 14 }, // KODE_KELAS
    { wch: 18 }, // NAMA_KELAS
    { wch: 18 }, // JENIS_PENUGASAN
    { wch: 25 }, // MATA_PELAJARAN
    { wch: 18 }, // STATUS_PENUGASAN
  ];
  XLSX.utils.book_append_sheet(wb, wsTeacher, 'DATA_GURU_WALI_KELAS');

  // Sheet 3: REFERENSI
  const refRows: (string | number)[][] = [
    ['KATEGORI', 'NILAI_VALID', 'DESKRIPSI_KETERANGAN'],
    ['JENJANG', 'KB/TK', 'Jenjang KB dan Taman Kanak-Kanak'],
    ['JENJANG', 'SD', 'Sekolah Dasar Islam Al-Chasanah'],
    ['JENJANG', 'SMP', 'Sekolah Menengah Pertama Islam Al-Chasanah'],
    ['JENJANG', 'SMA', 'Sekolah Menengah Atas Islam Al-Chasanah'],
    ['JENJANG', 'SMK', 'Sekolah Menengah Kejuruan Al-Chasanah'],
    ['JENIS_PENUGASAN', 'WALI_KELAS', 'Wali Kelas (Berwenang Mengisi & Merekap Nilai Akhlak)'],
    ['JENIS_PENUGASAN', 'GURU_MAPEL', 'Guru Mata Pelajaran'],
    ['STATUS_PENUGASAN', 'ACTIVE', 'Penugasan aktif berjalan'],
    ['STATUS_PENUGASAN', 'INACTIVE', 'Penugasan berakhir / diganti'],
    ['SKALA_PENILAIAN', '1', 'Kurang / Belum Berkembang (K)'],
    ['SKALA_PENILAIAN', '2', 'Cukup / Mulai Berkembang (C)'],
    ['SKALA_PENILAIAN', '3', 'Baik / Berkembang Sesuai Harapan (B)'],
    ['SKALA_PENILAIAN', '4', 'Sangat Baik / Membudaya (SB)'],
    ['SKALA_PENILAIAN', 'Kosong (NULL)', 'Belum Dinilai (TIDAK BOLEH DEFAULT KE 4)'],
  ];
  const wsRef = XLSX.utils.aoa_to_sheet(refRows);
  wsRef['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(wb, wsRef, 'REFERENSI');

  // Sheet 4: MASTER_31_INDIKATOR
  const master31Rows: (string | number)[][] = [
    ['KODE', 'NOMOR', 'RANAH', 'INDIKATOR', 'DESKRIPSI', 'SKALA_PENILAIAN'],
    ...AKHLAK_31_INDICATORS.map((ind) => [
      ind.excelCode,
      ind.number,
      ind.domain,
      ind.title,
      ind.description,
      '1: Kurang | 2: Cukup | 3: Baik | 4: Sangat Baik | Kosong: Belum Dinilai',
    ]),
  ];
  const wsMaster31 = XLSX.utils.aoa_to_sheet(master31Rows);
  wsMaster31['!cols'] = [
    { wch: 8 },
    { wch: 8 },
    { wch: 32 },
    { wch: 45 },
    { wch: 60 },
    { wch: 45 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMaster31, 'MASTER_31_INDIKATOR');

  // Sheet 5: PENILAIAN_31_INDIKATOR
  // Build rows: if prefilledStudents provided, use them; otherwise use sample rows + empty rows.
  const assessmentDataRows: (string | number | null)[][] = [];

  if (prefilledStudents && prefilledStudents.length > 0) {
    const clsName = prefilledClass?.className || prefilledClass?.name || '';
    const clsId = prefilledClass?.id || '';
    const level = normalizeEducationLevel(prefilledClass?.educationLevel || prefilledClass?.unitCode || 'SD');
    const unitName = EDUCATION_LEVEL_LABELS[level] || 'Al-Chasanah';
    const ay = prefilledPeriod?.year || '2025/2026';
    const sem = prefilledPeriod?.semester || 'GANJIL';
    const periodName = prefilledPeriod?.name || `${ay} ${sem}`;

    prefilledStudents.forEach((stu) => {
      assessmentDataRows.push([
        stu.nis || '',
        stu.full_name || stu.name || '',
        level,
        unitName,
        ay,
        sem,
        clsName || clsId,
        periodName,
        '', // NAMA_WALI_KELAS
        '', // EMAIL_PENILAI
        ...AKHLAK_31_INDICATORS.map(() => ''), // P01..P31 all EMPTY (NO DEFAULT 4!)
        '', // CATATAN_PEMBINAAN
        '', // BUKTI_OBSERVASI
        '', // TANGGAL_PENILAIAN
        'DRAFT', // STATUS_PENILAIAN
      ]);
    });
  } else {
    // Sample row 1: partial scoring for demonstration
    const sample1Scores = AKHLAK_31_INDICATORS.map((_, idx) => (idx < 5 ? 4 : ''));
    assessmentDataRows.push([
      '[CONTOH] 20260001',
      'Ahmad Fadhil Prasetya',
      'SMP',
      'SMP Al-Chasanah',
      '2025/2026',
      'GANJIL',
      '7A',
      'Semester Ganjil 2025/2026',
      'Ustadz Abdullah Syafi\'i, S.Pd.I',
      'abdullah.syafii@alchasanah.sch.id',
      ...sample1Scores,
      'Sangat disiplin dan istiqomah dalam shalat dhuha.',
      'Buku Mutabaah & Rekaman Shalat Berjamaah',
      '2026-03-15',
      'DRAFT',
    ]);

    // Sample row 2: completely blank scores (all NULL)
    assessmentDataRows.push([
      '[CONTOH] 20260002',
      'Aisyah Putri Azzahra',
      'SD',
      'SD Al-Chasanah',
      '2025/2026',
      'GANJIL',
      '4B',
      'Semester Ganjil 2025/2026',
      'Ustadzah Fatimah Azzahra, S.Pd',
      'fatimah.azzahra@alchasanah.sch.id',
      ...AKHLAK_31_INDICATORS.map(() => ''),
      '',
      '',
      '',
      'DRAFT',
    ]);

    // 5 empty blank rows
    for (let i = 0; i < 5; i++) {
      assessmentDataRows.push([
        '', '', '', '', '', '', '', '', '', '',
        ...AKHLAK_31_INDICATORS.map(() => ''),
        '', '', '', '',
      ]);
    }
  }

  const wsPenilaian = XLSX.utils.aoa_to_sheet([
    [...BATCH_PENILAIAN_HEADERS],
    ...assessmentDataRows,
  ]);

  wsPenilaian['!cols'] = [
    { wch: 18 }, // NIS
    { wch: 28 }, // NAMA_SISWA
    { wch: 10 }, // JENJANG
    { wch: 20 }, // UNIT_SEKOLAH
    { wch: 15 }, // TAHUN_AJARAN
    { wch: 12 }, // SEMESTER
    { wch: 14 }, // KODE_KELAS
    { wch: 25 }, // PERIODE_PENILAIAN
    { wch: 30 }, // NAMA_WALI_KELAS
    { wch: 30 }, // EMAIL_PENILAI
    ...AKHLAK_31_INDICATORS.map(() => ({ wch: 7 })), // P01..P31
    { wch: 40 }, // CATATAN_PEMBINAAN
    { wch: 35 }, // BUKTI_OBSERVASI
    { wch: 18 }, // TANGGAL_PENILAIAN
    { wch: 18 }, // STATUS_PENILAIAN
  ];
  XLSX.utils.book_append_sheet(wb, wsPenilaian, 'PENILAIAN_31_INDIKATOR');

  // Sheet 6: REKAP_PENILAIAN
  // Generates automatic formulas referencing Sheet 5
  // Columns in Sheet 5:
  // A=NIS, B=NAMA_SISWA, G=KODE_KELAS, K=P01, AO=P31, AP=CATATAN_PEMBINAAN
  const rekapRows: unknown[][] = [[...REKAP_PENILAIAN_HEADERS]];
  const rowCount = assessmentDataRows.length;

  for (let idx = 0; idx < rowCount; idx++) {
    const rowNum = idx + 2; // Excel row index (1-based, header is 1)
    rekapRows.push([
      idx + 1, // NO
      { f: `PENILAIAN_31_INDIKATOR!A${rowNum}` }, // NIS
      { f: `PENILAIAN_31_INDIKATOR!B${rowNum}` }, // NAMA_SISWA
      { f: `PENILAIAN_31_INDIKATOR!G${rowNum}` }, // KODE_KELAS
      31, // TOTAL_INDIKATOR
      { f: `COUNT(PENILAIAN_31_INDIKATOR!K${rowNum}:AO${rowNum})` }, // INDIKATOR_DINILAI
      { f: `31-COUNT(PENILAIAN_31_INDIKATOR!K${rowNum}:AO${rowNum})` }, // INDIKATOR_BELUM_DINILAI
      { f: `SUM(PENILAIAN_31_INDIKATOR!K${rowNum}:AO${rowNum})` }, // TOTAL_SKOR
      {
        f: `IF(COUNT(PENILAIAN_31_INDIKATOR!K${rowNum}:AO${rowNum})>0,ROUND(AVERAGE(PENILAIAN_31_INDIKATOR!K${rowNum}:AO${rowNum}),2),"")`,
      }, // RATA_RATA_SKOR
      {
        f: `IF(COUNT(PENILAIAN_31_INDIKATOR!K${rowNum}:AO${rowNum})=31,"LENGKAP",IF(COUNT(PENILAIAN_31_INDIKATOR!K${rowNum}:AO${rowNum})=0,"BELUM DINILAI","BELUM LENGKAP"))`,
      }, // STATUS_PENILAIAN
      {
        f: `IF(COUNT(PENILAIAN_31_INDIKATOR!K${rowNum}:AO${rowNum})=31,"MENUNGGU KEBIJAKAN PREDIKAT YAYASAN",IF(COUNT(PENILAIAN_31_INDIKATOR!K${rowNum}:AO${rowNum})=0,"BELUM DINILAI","BELUM LENGKAP"))`,
      }, // PREDIKAT
      { f: `PENILAIAN_31_INDIKATOR!AP${rowNum}` }, // CATATAN_PEMBINAAN
    ]);
  }

  const wsRekap = XLSX.utils.aoa_to_sheet(rekapRows);
  wsRekap['!cols'] = [
    { wch: 6 },  // NO
    { wch: 18 }, // NIS
    { wch: 28 }, // NAMA_SISWA
    { wch: 14 }, // KODE_KELAS
    { wch: 16 }, // TOTAL_INDIKATOR
    { wch: 18 }, // INDIKATOR_DINILAI
    { wch: 24 }, // INDIKATOR_BELUM_DINILAI
    { wch: 14 }, // TOTAL_SKOR
    { wch: 16 }, // RATA_RATA_SKOR
    { wch: 18 }, // STATUS_PENILAIAN
    { wch: 24 }, // PREDIKAT
    { wch: 40 }, // CATATAN_PEMBINAAN
  ];
  XLSX.utils.book_append_sheet(wb, wsRekap, 'REKAP_PENILAIAN');

  return wb;
}

// -------------------------------------------------------------
// LEGACY SINGLE-STUDENT TEMPLATE (PRESERVED FOR BACKWARD COMPATIBILITY)
// -------------------------------------------------------------

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
  const resolvedCohort =
    cohortName || schoolClass.cohortName || schoolClass.cohortId || student.cohort_id || '-';

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
    ['- Jangan mengubah struktur header kolom atau urutan P01 s.d. P31.'],
    ['- Satu file Excel berlaku untuk SATU siswa pada SATU kelas, jenjang resmi (TK/SD/SMP/SMA/SMK), dan periode.'],
    ['- Jenjang resmi Yayasan: TK, SD, SMP, SMA, SMK.'],
    ['- Kolom P01 s.d. P31 sengaja dikosongkan tanpa nilai default agar guru mengisi sesuai kondisi riil.'],
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
      params.instrumentVersion || 'v1.0-legacy',
    ],
  ];
  const wsIdentitas = XLSX.utils.aoa_to_sheet(identitasRows);
  wsIdentitas['!cols'] = IDENTITAS_HEADERS.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, wsIdentitas, 'IDENTITAS_PENILAIAN');

  // Sheet 3: PENILAIAN (EMPTY values for P01..P31 — NO default 4!)
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

// -------------------------------------------------------------
// DOWNLOAD TRIGGERS
// -------------------------------------------------------------

export function downloadAssessmentTemplate(params: AssessmentTemplateParams): void {
  const wb = buildAssessmentWorkbook(params);
  const filename = buildTemplateFilename(params.schoolClass, params.student, params.period);
  triggerFileDownload(wb, filename);
}

export function downloadStudentParentTemplate(): void {
  const wb = buildStudentParentTemplateWorkbook();
  const filename = 'TEMPLATE_DATA_SISWA_DAN_ORANG_TUA.xlsx';
  triggerFileDownload(wb, filename);
}

export function downloadTeacherAssignmentAssessmentTemplate(
  students?: Student[],
  schoolClass?: SchoolClass,
  period?: AcademicPeriod
): void {
  const wb = buildTeacherAssignmentAssessmentWorkbook(students, schoolClass, period);
  const filename = 'TEMPLATE_DATA_GURU_DAN_WALI_KELAS.xlsx';
  triggerFileDownload(wb, filename);
}
