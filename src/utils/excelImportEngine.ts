import * as XLSX from 'xlsx';
import {
  AKHLAK_31_INDICATORS,
  AcademicPeriod,
  isEducationLevelValue,
  normalizeEducationLevel,
  SchoolClass,
  Student,
  StudentAssessment,
} from '../types/siakhlak';
import {
  IDENTITAS_HEADERS,
  PENILAIAN_HEADERS,
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
  };
  student?: Student;
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
  const numericValues = Object.values(scores).filter(
    (v): v is number => typeof v === 'number' && !Number.isNaN(v)
  );
  if (numericValues.length === 0) return null;
  const avgScale =
    numericValues.reduce((sum, v) => sum + v, 0) / numericValues.length;
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
    idHeaderRow.length >= IDENTITAS_HEADERS.length &&
    IDENTITAS_HEADERS.every((h, idx) => idHeaderRow[idx] === h);
  const isV2Header =
    !isV3Header &&
    idHeaderRow.length >= LEGACY_V2_IDENTITAS_HEADERS.length &&
    LEGACY_V2_IDENTITAS_HEADERS.every((h, idx) => idHeaderRow[idx] === h);

  if (!isV3Header && !isV2Header) {
    errors.push('Header sheet IDENTITAS_PENILAIAN tidak sesuai dengan template resmi SIAKHLAK.');
  }
  const idData = idRows[1] || [];
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
  if (
    penHeaderRow.length < PENILAIAN_HEADERS.length ||
    !PENILAIAN_HEADERS.every((h, idx) => penHeaderRow[idx] === h)
  ) {
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
    if (trimmed === '') {
      parsedScores[ind.excelCode] = null;
      emptyCount += 1;
      return;
    }
    const num = Number(trimmed);
    if (!Number.isInteger(num) || num < 1 || num > 4) {
      errors.push(
        `Nilai indikator ${ind.excelCode} ("${trimmed}") tidak valid. Harus angka bulat 1–4 atau dikosongkan.`
      );
      parsedScores[ind.excelCode] = null;
      emptyCount += 1;
      return;
    }
    parsedScores[ind.excelCode] = num;
    filledCount += 1;
  });

  const teacherNotes = String(scoreRow[32] ?? '').trim().slice(0, 1000);
  const averagePct = computeScaleAveragePct(parsedScores);

  if (errors.length > 0) {
    return {
      fileName,
      status: 'INVALID',
      errors,
      warnings,
      identitas,
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
