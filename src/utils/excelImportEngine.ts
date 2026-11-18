import * as XLSX from 'xlsx';
import {
  AKHLAK_31_INDICATORS,
  AcademicPeriod,
  InstrumentVersion,
  isEducationLevelValue,
  normalizeEducationLevel,
  SchoolClass,
  Student,
  StudentAssessment,
} from '../types/siakhlak';
import { isEmulatorMode } from '../lib/firebase';
import { resolveIndicatorScore } from './scoreValidation';
import {
  IDENTITAS_HEADERS,
  PENILAIAN_HEADERS,
  STUDENT_PARENT_HEADERS,
  TEACHER_ASSIGNMENT_HEADERS,
  BATCH_PENILAIAN_HEADERS,
  TEMPLATE_VERSION,
} from './excelTemplate';

export type ImportValidationStatus =
  | 'VALID'
  | 'INVALID'
  | 'DUPLICATE'
  | 'NEEDS STUDENT REGISTRATION'
  | 'NEEDS REVIEW';

export interface ParsedAssessmentPreview {
  fileName: string;
  status: ImportValidationStatus;
  errors: string[];
  warnings: string[];
  identitas?: {
    templateVersion: string;
    nis: string;
    nisn: string;
    studentName: string;
    educationLevel: string;
    educationUnit: string;
    cohortName: string;
    classId: string;
    className: string;
    academicYear: string;
    semester: string;
    periodId: string;
    assessmentMonth: string;
    assessmentYear: string;
    teacherIdentifier: string;
    instrumentVersion?: string;
  };
  student?: Student;
  instrumentVersion?: InstrumentVersion;
  scores: Record<string, number | null>;
  filledCount: number;
  emptyCount: number;
  averagePct: number | null;
  teacherNotes: string;
  existingAssessmentId?: string;
  revisionEnabled: boolean;
  revisionReason: string;
}

export interface ImportValidationContext {
  selectedClass: SchoolClass;
  selectedPeriod: AcademicPeriod;
  allStudents: Student[];
  existingAssessments: StudentAssessment[];
  batchSeenKeys: Set<string>;
}

const REQUIRED_SHEETS = [
  'PETUNJUK',
  'IDENTITAS_PENILAIAN',
  'PENILAIAN',
  'REFERENSI_INDIKATOR',
] as const;

const LEGACY_V2_IDENTITAS_HEADERS = [
  'template_version',
  'student_nis',
  'student_nisn',
  'student_name',
  'education_unit',
  'class_id',
  'class_name',
  'academic_year',
  'semester',
  'period_id',
  'assessment_month',
  'assessment_year',
  'teacher_identifier',
] as const;

export function computeScaleAveragePct(scores: Record<string, number | null>): number | null {
  const values: number[] = [];
  for (let i = 1; i <= 31; i += 1) {
    const res = resolveIndicatorScore(scores, i);
    if (res.status === 'VALID' && res.value !== null) {
      values.push(res.value);
    }
  }
  if (values.length === 0) return null;
  const avgScale = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Number(((avgScale / 4) * 100).toFixed(1));
}

export function validateAssessmentRevisionInput(
  existingAssessment: Pick<StudentAssessment, 'verificationStatus'> | undefined | null,
  revisionReason: string
): { valid: boolean; requiresReason: boolean; error?: string } {
  if (!existingAssessment || existingAssessment.verificationStatus !== 'Terverifikasi') {
    return { valid: true, requiresReason: false };
  }
  if (revisionReason.trim().length < 5) {
    return {
      valid: false,
      requiresReason: true,
      error:
        'Penilaian sudah berstatus Terverifikasi. Wajib mengisi alasan resmi revisi minimal 5 karakter.',
    };
  }
  return { valid: true, requiresReason: true };
}

export function validateWorkbookBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string,
  ctx: ImportValidationContext
): ParsedAssessmentPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const emptyScores: Record<string, number | null> = {};
  AKHLAK_31_INDICATORS.forEach((ind) => {
    emptyScores[ind.excelCode] = null;
    emptyScores[`P${ind.number}`] = null;
  });

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array' });
  } catch {
    return {
      fileName,
      status: 'INVALID',
      errors: ['File Excel tidak dapat dibaca atau rusak (bukan .xlsx valid).'],
      warnings,
      scores: emptyScores,
      filledCount: 0,
      emptyCount: 31,
      averagePct: null,
      teacherNotes: '',
      revisionEnabled: false,
      revisionReason: '',
    };
  }

  for (const sheetName of REQUIRED_SHEETS) {
    if (!wb.SheetNames.includes(sheetName)) {
      errors.push(`Sheet wajib "${sheetName}" tidak ditemukan dalam workbook.`);
    }
  }
  if (errors.length > 0) {
    return {
      fileName,
      status: 'INVALID',
      errors,
      warnings,
      scores: emptyScores,
      filledCount: 0,
      emptyCount: 31,
      averagePct: null,
      teacherNotes: '',
      revisionEnabled: false,
      revisionReason: '',
    };
  }

  // Validate IDENTITAS_PENILAIAN
  const idRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['IDENTITAS_PENILAIAN'], {
    header: 1,
    defval: '',
  });
  const idHeaderRow = (idRows[0] || []).map((c) => String(c).trim());
  const isV3Header =
    idHeaderRow.length >= 15 &&
    IDENTITAS_HEADERS.slice(0, 15).every((h, idx) => idHeaderRow[idx] === h);
  const isV2Header =
    !isV3Header &&
    idHeaderRow.length >= LEGACY_V2_IDENTITAS_HEADERS.length &&
    LEGACY_V2_IDENTITAS_HEADERS.every((h, idx) => idHeaderRow[idx] === h);

  if (!isV3Header && !isV2Header) {
    errors.push('Header sheet IDENTITAS_PENILAIAN tidak sesuai dengan template resmi SIAKHLAK.');
  }
  const idData = idRows[1] || [];
  const rawInstrumentVersion = isV3Header ? String(idData[15] ?? '').trim() : '';
  let resolvedInstrumentVersion: InstrumentVersion = 'v1.0-legacy';
  if (rawInstrumentVersion) {
    if (rawInstrumentVersion === 'v1.0-legacy' || rawInstrumentVersion === 'v2.0-canonical') {
      resolvedInstrumentVersion = rawInstrumentVersion;
    } else {
      errors.push(`Versi instrumen tidak dikenal pada template Excel: "${rawInstrumentVersion}".`);
    }
  }
  if (resolvedInstrumentVersion === 'v2.0-canonical' && !isEmulatorMode()) {
    errors.push(
      'SECURITY GATE: Template Excel dengan instrumen v2.0-canonical DITOLAK di lingkungan Production (EMULATOR TESTING ONLY).'
    );
  }

  const identitas = isV3Header
    ? {
        templateVersion: String(idData[0] ?? '').trim(),
        nis: String(idData[1] ?? '').trim(),
        nisn: String(idData[2] ?? '').trim(),
        studentName: String(idData[3] ?? '').trim(),
        educationLevel: String(idData[4] ?? '').trim(),
        educationUnit: String(idData[5] ?? '').trim(),
        cohortName: String(idData[6] ?? '').trim(),
        classId: String(idData[7] ?? '').trim(),
        className: String(idData[8] ?? '').trim(),
        academicYear: String(idData[9] ?? '').trim(),
        semester: String(idData[10] ?? '').trim(),
        periodId: String(idData[11] ?? '').trim(),
        assessmentMonth: String(idData[12] ?? '').trim(),
        assessmentYear: String(idData[13] ?? '').trim(),
        teacherIdentifier: String(idData[14] ?? '').trim(),
        instrumentVersion: resolvedInstrumentVersion,
      }
    : {
        templateVersion: String(idData[0] ?? '').trim(),
        nis: String(idData[1] ?? '').trim(),
        nisn: String(idData[2] ?? '').trim(),
        studentName: String(idData[3] ?? '').trim(),
        educationLevel: normalizeEducationLevel(String(idData[4] ?? '')),
        educationUnit: String(idData[4] ?? '').trim(),
        cohortName: '',
        classId: String(idData[5] ?? '').trim(),
        className: String(idData[6] ?? '').trim(),
        academicYear: String(idData[7] ?? '').trim(),
        semester: String(idData[8] ?? '').trim(),
        periodId: String(idData[9] ?? '').trim(),
        assessmentMonth: String(idData[10] ?? '').trim(),
        assessmentYear: String(idData[11] ?? '').trim(),
        teacherIdentifier: String(idData[12] ?? '').trim(),
        instrumentVersion: resolvedInstrumentVersion,
      };

  if (
    identitas.templateVersion !== TEMPLATE_VERSION &&
    identitas.templateVersion !== 'SIAKHLAK-31-V2.0'
  ) {
    errors.push(
      `Versi template tidak valid (${identitas.templateVersion || 'kosong'}). Unduh ulang template resmi SIAKHLAK.`
    );
  }

  // Validate PENILAIAN sheet headers & rows
  const penRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['PENILAIAN'], {
    header: 1,
    defval: '',
  });
  const penHeaderRow = (penRows[0] || []).map((c) => String(c).trim());
  const isPenHeaderValid =
    penHeaderRow.length >= PENILAIAN_HEADERS.length &&
    PENILAIAN_HEADERS.every((h, idx) => {
      const actual = penHeaderRow[idx];
      return (
        actual === h ||
        actual.replace(/^P0/, 'P') === h.replace(/^P0/, 'P')
      );
    });
  if (!isPenHeaderValid) {
    errors.push('Header sheet PENILAIAN tidak sesuai struktur resmi (student_nis, P1..P31, catatan_guru).');
  }
  const nonEmptyDataRows = penRows.slice(1).filter((r) =>
    r.some((cell) => String(cell ?? '').trim() !== '')
  );
  if (nonEmptyDataRows.length === 0) {
    errors.push('Sheet PENILAIAN tidak memiliki baris data siswa.');
  } else if (nonEmptyDataRows.length > 1) {
    errors.push('Sheet PENILAIAN harus berisi tepat satu baris data siswa sesuai ketentuan per siswa.');
  }

  const scoreRow = nonEmptyDataRows[0] || [];
  const penNis = String(scoreRow[0] ?? '').trim();
  const targetNis = penNis || identitas.nis;

  if (!targetNis) {
    errors.push('NIS siswa kosong pada sheet IDENTITAS_PENILAIAN / PENILAIAN.');
  }
  if (penNis && identitas.nis && penNis !== identitas.nis) {
    errors.push(`NIS pada IDENTITAS_PENILAIAN (${identitas.nis}) tidak sama dengan PENILAIAN (${penNis}).`);
  }

  const expectedLevel = normalizeEducationLevel(
    ctx.selectedClass.educationLevel || ctx.selectedClass.unitCode
  );
  if (identitas.educationLevel) {
    if (!isEducationLevelValue(identitas.educationLevel)) {
      errors.push(`Jenjang pendidikan (${identitas.educationLevel}) tidak valid. Gunakan TK/SD/SMP/SMA/SMK.`);
    } else if (normalizeEducationLevel(identitas.educationLevel) !== expectedLevel) {
      errors.push(
        `Jenjang pendidikan file (${normalizeEducationLevel(identitas.educationLevel)}) tidak sesuai dengan kelas terpilih (${expectedLevel}).`
      );
    }
  } else if (identitas.educationUnit && isEducationLevelValue(identitas.educationUnit)) {
    if (normalizeEducationLevel(identitas.educationUnit) !== expectedLevel) {
      errors.push(
        `Unit pendidikan file (${identitas.educationUnit}) tidak sesuai dengan kelas terpilih (${expectedLevel}).`
      );
    }
  }

  if (identitas.classId && identitas.classId !== ctx.selectedClass.id) {
    errors.push(`Kelas pada file (${identitas.className || identitas.classId}) tidak sesuai kelas terpilih (${ctx.selectedClass.name}).`);
  }
  if (identitas.periodId && identitas.periodId !== ctx.selectedPeriod.id) {
    errors.push(`Periode pada file (${identitas.academicYear} ${identitas.semester}) tidak sesuai periode terpilih (${ctx.selectedPeriod.name}).`);
  }

  // Match existing registered student (no auto-creation allowed)
  const matchedStudent = ctx.allStudents.find(
    (s) =>
      s.nis.trim().toLowerCase() === targetNis.toLowerCase() ||
      (identitas.nisn && s.nisn && s.nisn.trim().toLowerCase() === identitas.nisn.toLowerCase())
  );

  // Parse P1..P31 strictly as integer 1-4 or null (empty)
  const parsedScores: Record<string, number | null> = { ...emptyScores };
  let filledCount = 0;
  let emptyCount = 0;

  AKHLAK_31_INDICATORS.forEach((ind, index) => {
    const rawCell = scoreRow[index + 1];
    const trimmed = String(rawCell ?? '').trim();
    const shortCode = `P${ind.number}`;
    if (trimmed === '') {
      parsedScores[ind.excelCode] = null;
      parsedScores[shortCode] = null;
      emptyCount += 1;
      return;
    }
    const num = Number(trimmed);
    if (!Number.isInteger(num) || num < 1 || num > 4) {
      errors.push(
        `Nilai indikator ${ind.excelCode} ("${trimmed}") tidak valid. Harus angka bulat 1–4 atau dikosongkan.`
      );
      parsedScores[ind.excelCode] = null;
      parsedScores[shortCode] = null;
      emptyCount += 1;
      return;
    }
    parsedScores[ind.excelCode] = num;
    parsedScores[shortCode] = num;
    filledCount += 1;
  });

  for (let i = 1; i <= 31; i += 1) {
    const aliasCheck = resolveIndicatorScore(parsedScores, i);
    if (aliasCheck.status === 'CONFLICT_ALIAS') {
      errors.push(`Konflik alias nilai terdeteksi pada indikator ${i < 10 ? `P0${i}` : `P${i}`}.`);
    }
  }

  const teacherNotes = String(scoreRow[32] ?? '').trim().slice(0, 1000);
  const averagePct = computeScaleAveragePct(parsedScores);

  if (errors.length > 0) {
    return {
      fileName,
      status: 'INVALID',
      errors,
      warnings,
      identitas,
      instrumentVersion: resolvedInstrumentVersion,
      student: matchedStudent,
      scores: parsedScores,
      filledCount,
      emptyCount,
      averagePct,
      teacherNotes,
      revisionEnabled: false,
      revisionReason: '',
    };
  }

  // Must match an existing registered student in the selected unit & class
  if (!matchedStudent) {
    return {
      fileName,
      status: 'NEEDS STUDENT REGISTRATION',
      errors: [
        `Siswa dengan NIS "${targetNis}" belum terdaftar di SIAKHLAK. Daftarkan siswa terlebih dahulu sebelum import.`,
      ],
      warnings,
      identitas,
      instrumentVersion: resolvedInstrumentVersion,
      scores: parsedScores,
      filledCount,
      emptyCount,
      averagePct,
      teacherNotes,
      revisionEnabled: false,
      revisionReason: '',
    };
  }

  const matchedStudentLevel = normalizeEducationLevel(
    matchedStudent.education_level || matchedStudent.unitCode
  );
  if (
    matchedStudent.classId !== ctx.selectedClass.id ||
    matchedStudentLevel !== expectedLevel
  ) {
    return {
      fileName,
      status: 'INVALID',
      errors: [
        `Siswa ${matchedStudent.name} (${matchedStudent.nis}) tercatat di ${matchedStudentLevel} ${matchedStudent.className}, bukan di ${expectedLevel} ${ctx.selectedClass.name}.`,
      ],
      warnings,
      identitas,
      instrumentVersion: resolvedInstrumentVersion,
      student: matchedStudent,
      scores: parsedScores,
      filledCount,
      emptyCount,
      averagePct,
      teacherNotes,
      revisionEnabled: false,
      revisionReason: '',
    };
  }

  // Check duplicate in current upload batch
  const batchKey = `${matchedStudent.id}_${ctx.selectedPeriod.id}`;
  if (ctx.batchSeenKeys.has(batchKey)) {
    return {
      fileName,
      status: 'DUPLICATE',
      errors: [
        `Duplikasi file dalam satu unggahan batch untuk siswa ${matchedStudent.name} (${matchedStudent.nis}).`,
      ],
      warnings,
      identitas,
      instrumentVersion: resolvedInstrumentVersion,
      student: matchedStudent,
      scores: parsedScores,
      filledCount,
      emptyCount,
      averagePct,
      teacherNotes,
      revisionEnabled: false,
      revisionReason: '',
    };
  }
  ctx.batchSeenKeys.add(batchKey);

  // Check duplicate in existing Firestore assessments
  const existing = ctx.existingAssessments.find(
    (a) => a.studentId === matchedStudent.id && a.periodId === ctx.selectedPeriod.id
  );
  if (existing) {
    warnings.push(
      `Penilaian siswa ${matchedStudent.name} untuk periode ${ctx.selectedPeriod.name} sudah ada (${existing.verificationStatus}). Centang "Ajukan sebagai Revisi" dan isi alasan resmi minimal 5 karakter jika ingin memperbarui.`
    );
    return {
      fileName,
      status: 'DUPLICATE',
      errors,
      warnings,
      identitas,
      instrumentVersion: resolvedInstrumentVersion,
      student: matchedStudent,
      scores: parsedScores,
      filledCount,
      emptyCount,
      averagePct,
      teacherNotes,
      existingAssessmentId: existing.id,
      revisionEnabled: false,
      revisionReason: '',
    };
  }

  // Partial / all empty check -> flagged NEEDS REVIEW (still can be committed with NULL indicators)
  if (filledCount === 0) {
    warnings.push('Seluruh 31 indikator masih kosong (NULL). Penilaian perlu dilengkapi sebelum dipublikasikan.');
    return {
      fileName,
      status: 'NEEDS REVIEW',
      errors,
      warnings,
      identitas,
      instrumentVersion: resolvedInstrumentVersion,
      student: matchedStudent,
      scores: parsedScores,
      filledCount,
      emptyCount,
      averagePct,
      teacherNotes,
      revisionEnabled: false,
      revisionReason: '',
    };
  }

  if (emptyCount > 0) {
    warnings.push(`${emptyCount} indikator kosong akan disimpan sebagai NULL (Belum Dinilai).`);
  }

  return {
    fileName,
    status: 'VALID',
    errors,
    warnings,
    identitas,
    instrumentVersion: resolvedInstrumentVersion,
    student: matchedStudent,
    scores: parsedScores,
    filledCount,
    emptyCount,
    averagePct,
    teacherNotes,
    revisionEnabled: false,
    revisionReason: '',
  };
}

export function generateErrorReportCsv(previews: ParsedAssessmentPreview[]): string {
  const rows = [
    ['file_name', 'status', 'nis', 'student_name', 'errors', 'warnings'].join(','),
    ...previews
      .filter((p) => p.status !== 'VALID')
      .map((p) =>
        [
          `"${p.fileName.replace(/"/g, '""')}"`,
          `"${p.status}"`,
          `"${(p.identitas?.nis || '').replace(/"/g, '""')}"`,
          `"${(p.student?.name || p.identitas?.studentName || '').replace(/"/g, '""')}"`,
          `"${p.errors.join('; ').replace(/"/g, '""')}"`,
          `"${p.warnings.join('; ').replace(/"/g, '""')}"`,
        ].join(',')
      ),
  ];
  return rows.join('\n');
}

// -------------------------------------------------------------
// MASTER DATA PARSERS & VALIDATORS (STUDENTS & GUARDIANS)
// -------------------------------------------------------------

export interface ParsedStudentParentRow {
  rowNumber: number;
  nis: string;
  namaSiswa: string;
  jenisKelamin: 'L' | 'P';
  tempatLahir: string;
  tanggalLahir: string;
  jenjang: string;
  unitSekolah: string;
  tahunAjaran: string;
  kodeKelas: string;
  statusSiswa: 'ACTIVE' | 'INACTIVE';
  emailSiswa: string;
  namaOrangTua: string;
  hubungan: 'ayah' | 'ibu' | 'wali';
  emailOrangTua: string;
  noHpOrangTua: string;
  alamat: string;
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

export interface StudentParentImportResult {
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  uniqueStudentsCount: number;
  rows: ParsedStudentParentRow[];
  globalErrors: string[];
  globalWarnings: string[];
}

export function validateStudentParentWorkbookBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string
): StudentParentImportResult {
  const globalErrors: string[] = [];
  const globalWarnings: string[] = [];
  const parsedRows: ParsedStudentParentRow[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array' });
  } catch {
    return {
      fileName,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      uniqueStudentsCount: 0,
      rows: [],
      globalErrors: ['File Excel tidak dapat dibaca atau rusak (bukan file .xlsx valid).'],
      globalWarnings: [],
    };
  }

  const targetSheetName =
    wb.SheetNames.find((s) => s.trim().toUpperCase() === 'DATA_SISWA_ORANG_TUA') ||
    wb.SheetNames[0];

  if (!targetSheetName || !wb.Sheets[targetSheetName]) {
    return {
      fileName,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      uniqueStudentsCount: 0,
      rows: [],
      globalErrors: ['Sheet DATA_SISWA_ORANG_TUA tidak ditemukan di dalam file Excel.'],
      globalWarnings: [],
    };
  }

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[targetSheetName], {
    header: 1,
    defval: '',
  });

  if (rawRows.length < 2) {
    return {
      fileName,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      uniqueStudentsCount: 0,
      rows: [],
      globalErrors: ['Sheet DATA_SISWA_ORANG_TUA kosong atau tidak memiliki baris data.'],
      globalWarnings: [],
    };
  }

  const headerRow = (rawRows[0] || []).map((c) => String(c).trim().toUpperCase());
  const expectedHeaderPrefix = [...STUDENT_PARENT_HEADERS].map((h) => h.toUpperCase());
  const isHeaderValid = expectedHeaderPrefix.every(
    (h, idx) => headerRow[idx] === h || headerRow[idx]?.includes(h)
  );

  if (!isHeaderValid) {
    globalWarnings.push(
      'Header kolom tidak persis sama dengan urutan template resmi DATA_SISWA_ORANG_TUA. Kolom dibaca berdasarkan posisi urutan standar.'
    );
  }

  const uniqueNisSet = new Set<string>();

  for (let i = 1; i < rawRows.length; i++) {
    const r = rawRows[i] || [];
    const rowNum = i + 1;

    // Check if entire row is empty
    const isBlank = r.every((cell) => String(cell ?? '').trim() === '');
    if (isBlank) continue;

    const rawNis = String(r[0] ?? '').trim();
    // Skip example demonstration rows
    if (rawNis.startsWith('[CONTOH]') || rawNis.toLowerCase().includes('contoh')) {
      continue;
    }

    const rowErrors: string[] = [];
    const rowWarnings: string[] = [];

    const nis = rawNis;
    const namaSiswa = String(r[1] ?? '').trim();
    const rawJk = String(r[2] ?? '').trim().toUpperCase();
    const jenisKelamin: 'L' | 'P' = rawJk === 'P' || rawJk.startsWith('P') ? 'P' : 'L';
    const tempatLahir = String(r[3] ?? '').trim();
    const tanggalLahir = String(r[4] ?? '').trim();
    const rawJenjang = String(r[5] ?? '').trim();
    const jenjang = normalizeEducationLevel(rawJenjang || 'SD');
    const unitSekolah = String(r[6] ?? '').trim();
    const tahunAjaran = String(r[7] ?? '').trim();
    const kodeKelas = String(r[8] ?? '').trim();
    const rawStatus = String(r[9] ?? '').trim().toUpperCase();
    const statusSiswa: 'ACTIVE' | 'INACTIVE' = rawStatus === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const emailSiswa = String(r[10] ?? '').trim();
    const namaOrangTua = String(r[11] ?? '').trim();
    const rawHubungan = String(r[12] ?? '').trim().toLowerCase();
    let hubungan: 'ayah' | 'ibu' | 'wali' = 'wali';
    if (rawHubungan.includes('ayah') || rawHubungan.includes('bapak')) {
      hubungan = 'ayah';
    } else if (rawHubungan.includes('ibu') || rawHubungan.includes('mama')) {
      hubungan = 'ibu';
    }

    const emailOrangTua = String(r[13] ?? '').trim();
    const noHpOrangTua = String(r[14] ?? '').trim();
    const alamat = String(r[15] ?? '').trim();

    // Validation rules
    if (!nis) rowErrors.push('NIS wajib diisi.');
    if (!namaSiswa) rowErrors.push('Nama Siswa wajib diisi.');
    if (!rawJk || (rawJk !== 'L' && rawJk !== 'P')) {
      rowWarnings.push(`Format jenis kelamin "${rawJk}" dinormalisasi menjadi "${jenisKelamin}".`);
    }
    if (!rawJenjang || !isEducationLevelValue(jenjang)) {
      rowErrors.push(`Jenjang pendidikan "${rawJenjang}" tidak valid. Pilihan: KB/TK, SD, SMP, SMA, SMK.`);
    }
    if (!namaOrangTua) rowErrors.push('Nama Orang Tua / Wali wajib diisi.');
    if (
      emailSiswa &&
      emailOrangTua &&
      emailSiswa.toLowerCase() === emailOrangTua.toLowerCase()
    ) {
      rowErrors.push(
        'Email Siswa dan Email Orang Tua tidak boleh sama untuk menjaga integritas login portal terpisah.'
      );
    }

    if (nis) {
      uniqueNisSet.add(nis);
    }

    parsedRows.push({
      rowNumber: rowNum,
      nis,
      namaSiswa,
      jenisKelamin,
      tempatLahir,
      tanggalLahir,
      jenjang,
      unitSekolah,
      tahunAjaran,
      kodeKelas,
      statusSiswa,
      emailSiswa,
      namaOrangTua,
      hubungan,
      emailOrangTua,
      noHpOrangTua,
      alamat,
      errors: rowErrors,
      warnings: rowWarnings,
      isValid: rowErrors.length === 0,
    });
  }

  const validRows = parsedRows.filter((r) => r.isValid).length;
  const invalidRows = parsedRows.filter((r) => !r.isValid).length;

  return {
    fileName,
    totalRows: parsedRows.length,
    validRows,
    invalidRows,
    uniqueStudentsCount: uniqueNisSet.size,
    rows: parsedRows,
    globalErrors,
    globalWarnings,
  };
}

// -------------------------------------------------------------
// TEACHER & ASSIGNMENT PARSER & VALIDATOR
// -------------------------------------------------------------

export interface ParsedTeacherAssignmentRow {
  rowNumber: number;
  kodeGuru: string;
  namaGuru: string;
  emailGuru: string;
  noHp: string;
  jenjang: string;
  unitSekolah: string;
  tahunAjaran: string;
  kodeKelas: string;
  namaKelas: string;
  jenisPenugasan: 'WALI_KELAS' | 'GURU_MAPEL';
  mataPelajaran: string;
  statusPenugasan: 'ACTIVE' | 'INACTIVE';
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

export interface TeacherAssignmentImportResult {
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: ParsedTeacherAssignmentRow[];
  globalErrors: string[];
  globalWarnings: string[];
}

export function validateTeacherAssignmentWorkbookBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string
): TeacherAssignmentImportResult {
  const globalErrors: string[] = [];
  const globalWarnings: string[] = [];
  const parsedRows: ParsedTeacherAssignmentRow[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array' });
  } catch {
    return {
      fileName,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      rows: [],
      globalErrors: ['File Excel tidak dapat dibaca atau rusak (bukan file .xlsx valid).'],
      globalWarnings: [],
    };
  }

  const targetSheetName =
    wb.SheetNames.find((s) => s.trim().toUpperCase() === 'DATA_GURU_WALI_KELAS') ||
    wb.SheetNames[0];

  if (!targetSheetName || !wb.Sheets[targetSheetName]) {
    return {
      fileName,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      rows: [],
      globalErrors: ['Sheet DATA_GURU_WALI_KELAS tidak ditemukan di dalam file Excel.'],
      globalWarnings: [],
    };
  }

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[targetSheetName], {
    header: 1,
    defval: '',
  });

  if (rawRows.length < 2) {
    return {
      fileName,
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      rows: [],
      globalErrors: ['Sheet DATA_GURU_WALI_KELAS kosong atau tidak memiliki baris data.'],
      globalWarnings: [],
    };
  }

  for (let i = 1; i < rawRows.length; i++) {
    const r = rawRows[i] || [];
    const rowNum = i + 1;

    const isBlank = r.every((cell) => String(cell ?? '').trim() === '');
    if (isBlank) continue;

    const rawKode = String(r[0] ?? '').trim();
    if (rawKode.startsWith('[CONTOH]') || rawKode.toLowerCase().includes('contoh')) {
      continue;
    }

    const rowErrors: string[] = [];
    const rowWarnings: string[] = [];

    const kodeGuru = rawKode;
    const namaGuru = String(r[1] ?? '').trim();
    const emailGuru = String(r[2] ?? '').trim();
    const noHp = String(r[3] ?? '').trim();
    const rawJenjang = String(r[4] ?? '').trim();
    const jenjang = normalizeEducationLevel(rawJenjang || 'SD');
    const unitSekolah = String(r[5] ?? '').trim();
    const tahunAjaran = String(r[6] ?? '').trim();
    const kodeKelas = String(r[7] ?? '').trim();
    const namaKelas = String(r[8] ?? '').trim();
    const rawPenugasan = String(r[9] ?? '').trim().toUpperCase();
    const jenisPenugasan: 'WALI_KELAS' | 'GURU_MAPEL' =
      rawPenugasan === 'WALI_KELAS' || rawPenugasan.includes('WALI')
        ? 'WALI_KELAS'
        : 'GURU_MAPEL';
    const mataPelajaran = String(r[10] ?? '').trim();
    const rawStatus = String(r[11] ?? '').trim().toUpperCase();
    const statusPenugasan: 'ACTIVE' | 'INACTIVE' =
      rawStatus === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

    if (!namaGuru) rowErrors.push('Nama Guru wajib diisi.');
    if (!emailGuru) rowErrors.push('Email Guru wajib diisi.');
    if (!rawJenjang || !isEducationLevelValue(jenjang)) {
      rowErrors.push(`Jenjang "${rawJenjang}" tidak valid. Pilihan: KB/TK, SD, SMP, SMA, SMK.`);
    }

    parsedRows.push({
      rowNumber: rowNum,
      kodeGuru,
      namaGuru,
      emailGuru,
      noHp,
      jenjang,
      unitSekolah,
      tahunAjaran,
      kodeKelas,
      namaKelas,
      jenisPenugasan,
      mataPelajaran,
      statusPenugasan,
      errors: rowErrors,
      warnings: rowWarnings,
      isValid: rowErrors.length === 0,
    });
  }

  return {
    fileName,
    totalRows: parsedRows.length,
    validRows: parsedRows.filter((r) => r.isValid).length,
    invalidRows: parsedRows.filter((r) => !r.isValid).length,
    rows: parsedRows,
    globalErrors,
    globalWarnings,
  };
}

// -------------------------------------------------------------
// BATCH 31-INDICATOR ASSESSMENT WORKBOOK VALIDATOR
// -------------------------------------------------------------

export function validateBatchAssessmentWorkbookBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string,
  ctx: ImportValidationContext
): ParsedAssessmentPreview[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array' });
  } catch {
    return [
      {
        fileName,
        status: 'INVALID',
        errors: ['File Excel tidak dapat dibaca atau rusak.'],
        warnings: [],
        scores: {},
        filledCount: 0,
        emptyCount: 31,
        averagePct: null,
        teacherNotes: '',
        revisionEnabled: false,
        revisionReason: '',
      },
    ];
  }

  const targetSheetName =
    wb.SheetNames.find((s) => s.trim().toUpperCase() === 'PENILAIAN_31_INDIKATOR') ||
    wb.SheetNames.find((s) => s.trim().toUpperCase() === 'PENILAIAN');

  if (!targetSheetName || !wb.Sheets[targetSheetName]) {
    // Fall back to single-student workbook parser
    return [validateWorkbookBuffer(buffer, fileName, ctx)];
  }

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[targetSheetName], {
    header: 1,
    defval: '',
  });

  if (rawRows.length < 2) {
    return [
      {
        fileName,
        status: 'INVALID',
        errors: ['Sheet PENILAIAN_31_INDIKATOR tidak memiliki baris data penilaian.'],
        warnings: [],
        scores: {},
        filledCount: 0,
        emptyCount: 31,
        averagePct: null,
        teacherNotes: '',
        revisionEnabled: false,
        revisionReason: '',
      },
    ];
  }

  const previews: ParsedAssessmentPreview[] = [];
  const emptyScoresBase: Record<string, number | null> = {};
  AKHLAK_31_INDICATORS.forEach((ind) => {
    emptyScoresBase[ind.excelCode] = null;
    emptyScoresBase[`P${ind.number}`] = null;
  });

  for (let i = 1; i < rawRows.length; i++) {
    const r = rawRows[i] || [];
    const isBlank = r.every((cell) => String(cell ?? '').trim() === '');
    if (isBlank) continue;

    const rawNis = String(r[0] ?? '').trim();
    if (rawNis.startsWith('[CONTOH]') || rawNis.toLowerCase().includes('contoh')) {
      continue;
    }

    const rowErrors: string[] = [];
    const rowWarnings: string[] = [];

    const nis = rawNis;
    const studentName = String(r[1] ?? '').trim();
    const educationLevel = normalizeEducationLevel(String(r[2] ?? '').trim() || 'SD');
    const educationUnit = String(r[3] ?? '').trim();
    const academicYear = String(r[4] ?? '').trim();
    const semester = String(r[5] ?? '').trim();
    const className = String(r[6] ?? '').trim();
    const periodName = String(r[7] ?? '').trim();
    const teacherName = String(r[8] ?? '').trim();
    const teacherEmail = String(r[9] ?? '').trim();

    // Look up student
    const matchedStudent = ctx.allStudents.find(
      (s) => s.nis.trim().toLowerCase() === nis.toLowerCase()
    );

    if (!matchedStudent) {
      rowErrors.push(
        `Siswa dengan NIS "${nis}" (${studentName}) belum terdaftar di SIAKHLAK. Daftarkan siswa terlebih dahulu di Data Master.`
      );
    }

    // Parse scores: indices 10 to 40 correspond to P01..P31
    const scores: Record<string, number | null> = { ...emptyScoresBase };
    let filledCount = 0;
    let emptyCount = 0;

    AKHLAK_31_INDICATORS.forEach((ind, idx) => {
      const cellVal = String(r[10 + idx] ?? '').trim();
      const shortCode = `P${ind.number}`;
      if (cellVal === '') {
        scores[ind.excelCode] = null;
        scores[shortCode] = null;
        emptyCount += 1;
        return;
      }
      const num = Number(cellVal);
      if (!Number.isInteger(num) || num < 1 || num > 4) {
        rowErrors.push(
          `Nilai ${ind.excelCode} ("${cellVal}") tidak valid. Harus angka bulat 1–4 atau dikosongkan.`
        );
        scores[ind.excelCode] = null;
        scores[shortCode] = null;
        emptyCount += 1;
        return;
      }
      scores[ind.excelCode] = num;
      scores[shortCode] = num;
      filledCount += 1;
    });

    const teacherNotes = String(r[41] ?? '').trim().slice(0, 1000);
    const averagePct = computeScaleAveragePct(scores);

    let status: ImportValidationStatus = 'VALID';
    if (rowErrors.length > 0) {
      status = matchedStudent ? 'INVALID' : 'NEEDS STUDENT REGISTRATION';
    } else if (filledCount === 0) {
      status = 'NEEDS REVIEW';
      rowWarnings.push('Seluruh 31 indikator masih kosong (NULL).');
    } else if (emptyCount > 0) {
      rowWarnings.push(`${emptyCount} indikator kosong akan disimpan sebagai NULL (Belum Dinilai).`);
    }

    // Check duplicates
    if (matchedStudent) {
      const batchKey = `${matchedStudent.id}_${ctx.selectedPeriod.id}`;
      if (ctx.batchSeenKeys.has(batchKey)) {
        status = 'DUPLICATE';
        rowErrors.push(`Duplikasi data baris untuk siswa ${matchedStudent.name} (${matchedStudent.nis}).`);
      } else {
        ctx.batchSeenKeys.add(batchKey);
      }

      const existing = ctx.existingAssessments.find(
        (a) => a.studentId === matchedStudent.id && a.periodId === ctx.selectedPeriod.id
      );
      if (existing) {
        status = 'DUPLICATE';
        rowWarnings.push(
          `Penilaian siswa ${matchedStudent.name} untuk periode ini sudah ada (${existing.verificationStatus}).`
        );
      }
    }

    previews.push({
      fileName: `${fileName} (Baris ${i + 1})`,
      status,
      errors: rowErrors,
      warnings: rowWarnings,
      identitas: {
        templateVersion: TEMPLATE_VERSION,
        nis,
        nisn: matchedStudent?.nisn || '',
        studentName: matchedStudent?.name || studentName,
        educationLevel,
        educationUnit,
        cohortName: matchedStudent?.cohort_id || '',
        classId: ctx.selectedClass.id,
        className: className || ctx.selectedClass.name,
        academicYear: academicYear || ctx.selectedPeriod.year,
        semester: semester || ctx.selectedPeriod.semester,
        periodId: ctx.selectedPeriod.id,
        assessmentMonth: periodName || 'Aktif',
        assessmentYear: academicYear || ctx.selectedPeriod.year,
        teacherIdentifier: teacherEmail || teacherName || 'Wali Kelas',
      },
      student: matchedStudent,
      instrumentVersion: 'v1.0-legacy',
      scores,
      filledCount,
      emptyCount,
      averagePct,
      teacherNotes,
      revisionEnabled: false,
      revisionReason: '',
    });
  }

  return previews;
}

