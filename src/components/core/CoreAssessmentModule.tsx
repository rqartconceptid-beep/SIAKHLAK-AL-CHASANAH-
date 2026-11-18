import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Printer,
  Upload,
} from 'lucide-react';
import {
  AKHLAK_31_INDICATORS,
  AcademicPeriod,
  ClassAssignment,
  ExcelImportLog,
  getScoreValue,
  InstrumentVersion,
  isFoundationOrSuperAdmin,
  matchesEducationLevel,
  normalizeRole,
  SchoolClass,
  Student,
  StudentAssessment,
  UserProfile,
  VerificationStatus,
} from '../../types/siakhlak';
import { isEmulatorMode } from '../../lib/firebase';
import {
  getSelectableCreationVersions,
  resolveAssessmentInstrument,
} from '../../utils/instrumentResolver';
import {
  commitExcelAssessmentImport,
  createAuditLog,
  ExcelImportCommitResult,
  formatTimestamp,
  saveStudentAssessment,
  toggleAssessmentPublishToParents,
} from '../../services/siakhlakService';
import {
  downloadAssessmentTemplate,
  downloadTeacherAssignmentAssessmentTemplate,
} from '../../utils/excelTemplate';
import {
  computeScaleAveragePct,
  generateErrorReportCsv,
  ImportValidationStatus,
  ParsedAssessmentPreview,
  validateAssessmentRevisionInput,
  validateWorkbookBuffer,
  validateBatchAssessmentWorkbookBuffer,
} from '../../utils/excelImportEngine';
import { EmptyState, Panel, RestrictedNotice, SectionHeader } from '../ui/Primitives';
import { FoundationReportHeader } from '../branding/FoundationBrand';

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function CoreAssessmentModule({
  profile,
  classes,
  students,
  periods,
  assessments,
  importLogs,
  activePeriodId,
  classAssignments = [],
  selectedTeacherClassId,
}: {
  profile: UserProfile;
  classes: SchoolClass[];
  students: Student[];
  periods: AcademicPeriod[];
  assessments: StudentAssessment[];
  importLogs: ExcelImportLog[];
  activePeriodId: string;
  classAssignments?: ClassAssignment[];
  selectedTeacherClassId?: string;
}) {
  const [activeTool, setActiveTool] = useState<'none' | 'template' | 'import' | 'manual'>('none');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canonicalRole = normalizeRole(profile.role);
  const isFoundationAdmin = isFoundationOrSuperAdmin(canonicalRole);
  const canVerifyAssessment =
    isFoundationAdmin || (profile.permissions || []).includes('assessment:verify');

  // Strict Teacher scope filtering: merges active class_assignments or users.assignedClassIds; empty => []
  const assignedClasses = useMemo(() => {
    if (isFoundationAdmin) return classes;
    const activeAssigns = classAssignments.filter(
      (ca) => ca.teacher_uid === profile.uid && ca.assignment_status === 'active'
    );
    const explicitClassIds = new Set<string>(
      activeAssigns.length > 0
        ? activeAssigns.map((ca) => ca.class_id)
        : profile.assignedClassIds || []
    );
    if (explicitClassIds.size === 0) return [];

    return classes.filter((c) => {
      const unitOk =
        profile.assignedUnits.length === 0 ||
        profile.assignedUnits.some((au) => matchesEducationLevel(c.unitCode, au));
      return unitOk && explicitClassIds.has(c.id);
    });
  }, [classes, profile, classAssignments, isFoundationAdmin]);

  const scopedAssessments = useMemo(() => {
    if (isFoundationAdmin) return assessments;
    return assessments.filter((a) =>
      assignedClasses.some(
        (c) =>
          c.id === a.classId ||
          (matchesEducationLevel(a.unitCode, c.unitCode) && a.className === c.name)
      )
    );
  }, [assessments, assignedClasses, isFoundationAdmin]);

  const allowedPeriods = useMemo(() => {
    if (isFoundationAdmin) return periods;
    return periods.filter((p) => p.isActive);
  }, [periods, isFoundationAdmin]);

  // Shared class & period selection for Template / Import
  const [selectedClassId, setSelectedClassId] = useState<string>(
    selectedTeacherClassId || assignedClasses[0]?.id || ''
  );
  useEffect(() => {
    if (
      selectedTeacherClassId &&
      assignedClasses.some((c) => c.id === selectedTeacherClassId)
    ) {
      setSelectedClassId(selectedTeacherClassId);
    }
  }, [selectedTeacherClassId, assignedClasses]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(
    activePeriodId || allowedPeriods[0]?.id || ''
  );

  // Template Generator state
  const [templateStudentId, setTemplateStudentId] = useState<string>('');
  const [assessmentMonth, setAssessmentMonth] = useState<string>(
    MONTHS[new Date().getMonth()]
  );
  const [assessmentYear, setAssessmentYear] = useState<string>(
    String(new Date().getFullYear())
  );

  // Excel Import state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previews, setPreviews] = useState<ParsedAssessmentPreview[]>([]);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importVerStatus, setImportVerStatus] =
    useState<VerificationStatus>('Menunggu Verifikasi');
  const [importPublishToParents, setImportPublishToParents] = useState(false);
  const [commitResult, setCommitResult] = useState<ExcelImportCommitResult | null>(null);

  // Manual input state (1-4 or NULL)
  const [manualStudentId, setManualStudentId] = useState<string>('');
  const [manualPeriodId, setManualPeriodId] = useState<string>(
    activePeriodId || allowedPeriods[0]?.id || ''
  );
  const [manualScores, setManualScores] = useState<Record<string, number | null>>(() => {
    const init: Record<string, number | null> = {};
    AKHLAK_31_INDICATORS.forEach((ind) => {
      init[ind.excelCode] = null;
    });
    return init;
  });
  const [manualVerStatus, setManualVerStatus] =
    useState<VerificationStatus>('Menunggu Verifikasi');
  const [manualPublish, setManualPublish] = useState(false);
  const [manualNotes, setManualNotes] = useState('');
  const [manualRevisionReason, setManualRevisionReason] = useState('');

  const isEmu = useMemo(() => isEmulatorMode(), []);
  const selectableVersions = useMemo(() => getSelectableCreationVersions({ isEmulator: isEmu }), [isEmu]);
  const [manualInstrumentVersion, setManualInstrumentVersion] = useState<InstrumentVersion>('v1.0-legacy');

  const activeManualPeriodId = manualPeriodId || allowedPeriods[0]?.id || '';
  const existingManualAssessment = useMemo(() => {
    if (!manualStudentId || !activeManualPeriodId) return undefined;
    return assessments.find(
      (a) => a.studentId === manualStudentId && a.periodId === activeManualPeriodId
    );
  }, [assessments, manualStudentId, activeManualPeriodId]);

  const activeFormResolution = useMemo(() => {
    const v = existingManualAssessment ? existingManualAssessment.instrumentVersion : manualInstrumentVersion;
    return resolveAssessmentInstrument(v, { isEmulator: isEmu, allowHistoricalFallback: true });
  }, [existingManualAssessment, manualInstrumentVersion, isEmu]);

  const activeFormIndicators = useMemo(() => {
    return activeFormResolution.instrument?.indicators || AKHLAK_31_INDICATORS;
  }, [activeFormResolution]);

  useEffect(() => {
    if (!manualStudentId) return;
    if (existingManualAssessment) {
      setManualInstrumentVersion(existingManualAssessment.instrumentVersion || 'v1.0-legacy');
      const loadedScores: Record<string, number | null> = {};
      activeFormIndicators.forEach((ind) => {
        loadedScores[ind.excelCode] = getScoreValue(existingManualAssessment.scores, ind);
      });
      setManualScores(loadedScores);
      setManualNotes(existingManualAssessment.teacherNotes || '');
      setManualPublish(Boolean(existingManualAssessment.isPublishedToParents));
      setManualVerStatus(
        !canVerifyAssessment && existingManualAssessment.verificationStatus === 'Terverifikasi'
          ? 'Menunggu Verifikasi'
          : existingManualAssessment.verificationStatus
      );
      setManualRevisionReason('');
    } else {
      const resetScores: Record<string, number | null> = {};
      activeFormIndicators.forEach((ind) => {
        resetScores[ind.excelCode] = null;
      });
      setManualScores(resetScores);
      setManualNotes('');
      setManualPublish(false);
      setManualVerStatus('Menunggu Verifikasi');
      setManualRevisionReason('');
    }
  }, [manualStudentId, activeManualPeriodId, existingManualAssessment?.id, canVerifyAssessment, activeFormIndicators]);

  if (
    canonicalRole === 'COMMITTEE_ADMIN' ||
    canonicalRole === 'STUDENT' ||
    canonicalRole === 'PARENT'
  ) {
    return (
      <RestrictedNotice
        title="Pengubahan Penilaian Siswa Dilarang"
        message="Hanya Guru / Wali Kelas berwenang dan Admin Yayasan yang dapat mengisi, mengunduh template, atau mengimpor penilaian 31 indikator."
      />
    );
  }

  const effectiveClass =
    assignedClasses.find((c) => c.id === selectedClassId) || assignedClasses[0] || null;
  const effectivePeriod =
    allowedPeriods.find((p) => p.id === selectedPeriodId) || allowedPeriods[0] || null;

  const classStudents = useMemo(() => {
    if (!effectiveClass) return [];
    return students.filter(
      (s) =>
        s.classId === effectiveClass.id &&
        matchesEducationLevel(s.unitCode, effectiveClass.unitCode)
    );
  }, [students, effectiveClass]);

  const handleDownloadSingleTemplate = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!effectiveClass || !effectivePeriod) {
      setErrorMsg('Pilih Kelas dan Periode Aktif terlebih dahulu.');
      return;
    }
    const targetStudent =
      classStudents.find((s) => s.id === templateStudentId) || classStudents[0];
    if (!targetStudent) {
      setErrorMsg('Belum ada siswa terdaftar di kelas ini.');
      return;
    }
    try {
      downloadAssessmentTemplate({
        student: targetStudent,
        schoolClass: effectiveClass,
        period: effectivePeriod,
        assessmentMonth,
        assessmentYear,
        teacherIdentifier: `${profile.displayName} (${profile.email})`,
      });
      setSuccessMsg(`Template Excel untuk siswa ${targetStudent.name} (${targetStudent.nis}) berhasil diunduh.`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setErrorMsg('Gagal mengunduh template: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDownloadAllClassTemplates = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!effectiveClass || !effectivePeriod) {
      setErrorMsg('Pilih Kelas dan Periode Aktif terlebih dahulu.');
      return;
    }
    if (classStudents.length === 0) {
      setErrorMsg('Belum ada siswa terdaftar di kelas ini.');
      return;
    }
    try {
      classStudents.forEach((stu) => {
        downloadAssessmentTemplate({
          student: stu,
          schoolClass: effectiveClass,
          period: effectivePeriod,
          assessmentMonth,
          assessmentYear,
          teacherIdentifier: `${profile.displayName} (${profile.email})`,
        });
      });
      setSuccessMsg(`Berhasil mengunduh template untuk seluruh ${classStudents.length} siswa kelas.`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setErrorMsg('Gagal mengunduh template kelas: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDownloadMasterAssessmentWorkbook = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      downloadTeacherAssignmentAssessmentTemplate(
        classStudents.length > 0 ? classStudents : undefined,
        effectiveClass || undefined,
        effectivePeriod || undefined
      );
      setSuccessMsg(
        'Template Master Guru, Wali Kelas & 31 Indikator (6 Sheet Lengkap dengan Rumus Otomatis) berhasil diunduh.'
      );
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setErrorMsg('Gagal mengunduh template master: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setCommitResult(null);
    if (!effectiveClass || !effectivePeriod) {
      setErrorMsg('Pilih Kelas dan Periode Penilaian yang diizinkan sebelum memilih file Excel.');
      return;
    }
    const fileArray = Array.from(files).filter((f) =>
      f.name.toLowerCase().endsWith('.xlsx')
    );
    if (fileArray.length === 0) {
      setErrorMsg('Pilih minimal satu file berformat .xlsx.');
      return;
    }

    const batchSeenKeys = new Set<string>();
    const results: ParsedAssessmentPreview[] = [];

    for (const file of fileArray) {
      const buffer = await file.arrayBuffer();

      // Check if file has PENILAIAN_31_INDIKATOR sheet for class batch import
      let isBatch = false;
      try {
        const testWb = XLSX.read(buffer, { type: 'array' });
        const hasBatchSheet = testWb.SheetNames.some(
          (s: string) => s.trim().toUpperCase() === 'PENILAIAN_31_INDIKATOR'
        );
        if (hasBatchSheet) {
          isBatch = true;
          const batchParsed = validateBatchAssessmentWorkbookBuffer(buffer, file.name, {
            selectedClass: effectiveClass,
            selectedPeriod: effectivePeriod,
            allStudents: students,
            existingAssessments: assessments,
            batchSeenKeys,
          });
          results.push(...batchParsed);
        }
      } catch {
        // Fall back to single-student workbook parser
      }

      if (!isBatch) {
        const parsed = validateWorkbookBuffer(buffer, file.name, {
          selectedClass: effectiveClass,
          selectedPeriod: effectivePeriod,
          allStudents: students,
          existingAssessments: assessments,
          batchSeenKeys,
        });
        results.push(parsed);
      }
    }

    setPreviews(results);
  };

  const handleConfirmImport = async () => {
    if (!effectiveClass || !effectivePeriod || previews.length === 0) return;
    const effectiveStatus: VerificationStatus =
      importVerStatus === 'Terverifikasi' && !canVerifyAssessment
        ? 'Menunggu Verifikasi'
        : importVerStatus;
    setSaving(true);
    setErrorMsg(null);
    setImportProgress({ done: 0, total: previews.length });
    try {
      const result = await commitExcelAssessmentImport({
        profile,
        selectedClass: effectiveClass,
        selectedPeriod: effectivePeriod,
        items: previews,
        verificationStatus: effectiveStatus,
        publishToParents: importPublishToParents,
        onProgress: (done, total) => setImportProgress({ done, total }),
      });
      setCommitResult(result);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengimpor file Excel.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadErrorCsv = () => {
    const csv = generateErrorReportCsv(previews);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-import-siakhlak.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const stu = students.find((s) => s.id === manualStudentId);
    const pId = activeManualPeriodId;
    if (!stu || !pId) {
      setErrorMsg('Pilih siswa dan periode aktif terlebih dahulu.');
      return;
    }
    const revValidation = validateAssessmentRevisionInput(
      existingManualAssessment,
      manualRevisionReason
    );
    if (!revValidation.valid) {
      setErrorMsg(
        revValidation.error ||
          'Alasan resmi revisi wajib diisi minimal 5 karakter untuk penilaian Terverifikasi.'
      );
      return;
    }
    const effectiveStatus: VerificationStatus =
      manualVerStatus === 'Terverifikasi' && !canVerifyAssessment
        ? 'Menunggu Verifikasi'
        : manualVerStatus;
    setSaving(true);
    setErrorMsg(null);
    try {
      const avgPct = computeScaleAveragePct(manualScores);
      const cleanRevisionReason = manualRevisionReason.trim();
      await saveStudentAssessment(
        {
          studentId: stu.id,
          nis: stu.nis,
          studentName: stu.name,
          unitCode: stu.unitCode,
          classId: stu.classId,
          periodId: pId,
          className: stu.className,
          scores: manualScores,
          averageScore: avgPct,
          verificationStatus: effectiveStatus,
          isPublishedToParents: manualPublish,
          verifiedBy:
            effectiveStatus === 'Terverifikasi' ? profile.displayName : undefined,
          teacherNotes: manualNotes,
          teacherIdentifier: `${profile.displayName} (${profile.email})`,
          importSource: 'manual',
          instrumentVersion: existingManualAssessment
            ? existingManualAssessment.instrumentVersion
            : manualInstrumentVersion,
          ...(existingManualAssessment && cleanRevisionReason
            ? { revisionReason: cleanRevisionReason }
            : {}),
        },
        existingManualAssessment?.id
      );
      await createAuditLog({
        actorName: profile.displayName,
        actorRole: profile.role,
        action: existingManualAssessment ? 'MANUAL_REVISE_ASSESSMENT' : 'MANUAL_SAVE_ASSESSMENT',
        targetCollection: 'studentAssessments',
        targetId: existingManualAssessment?.id || `${stu.id}_${pId}`,
        summary: existingManualAssessment
          ? `Revisi manual penilaian ${stu.name} (${stu.unitCode} ${stu.className}) · status ${effectiveStatus}${cleanRevisionReason ? ` · Alasan: ${cleanRevisionReason}` : ''}.`
          : `Input manual penilaian ${stu.name} (${stu.unitCode} ${stu.className}) · status ${effectiveStatus}.`,
      });
      setManualStudentId('');
      setManualNotes('');
      setManualRevisionReason('');
      setActiveTool('none');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan penilaian.');
    } finally {
      setSaving(false);
    }
  };

  const statusCounts = useMemo(() => {
    const counts: Record<ImportValidationStatus, number> = {
      VALID: 0,
      INVALID: 0,
      DUPLICATE: 0,
      'NEEDS STUDENT REGISTRATION': 0,
      'NEEDS REVIEW': 0,
    };
    previews.forEach((p) => {
      counts[p.status] += 1;
    });
    return counts;
  }, [previews]);

  const actionableCount = previews.filter(
    (p) =>
      p.status === 'VALID' ||
      p.status === 'NEEDS REVIEW' ||
      (p.status === 'DUPLICATE' && p.revisionEnabled && p.revisionReason.trim().length >= 5)
  ).length;

  const hasFailures = previews.some((p) => p.status !== 'VALID');

  return (
    <div className="space-y-6">
      <FoundationReportHeader
        reportTitle="LAPORAN PENILAIAN 31 INDIKATOR AKHLAKUL KARIMAH"
        subtitle="Daftar rekapitulasi penilaian 31 indikator Akhlakul Karimah siswa dan status verifikasi."
        periodLabel={effectivePeriod?.name || 'Semua Periode'}
        unitLabel={
          effectiveClass ? `${effectiveClass.unitCode} · ${effectiveClass.name}` : 'Semua Unit'
        }
      />
      <SectionHeader
        title="Penilaian & Verifikasi 31 Indikator Akhlakul Karimah"
        subtitle="Kelola penilaian 31 indikator skala 1–4 (atau kosong/NULL), unduh template Excel resmi per siswa, dan impor multi-file tervalidasi."
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              type="button"
              onClick={() =>
                setActiveTool(activeTool === 'template' ? 'none' : 'template')
              }
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-emerald-800 text-emerald-900 bg-white hover:bg-emerald-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>DOWNLOAD TEMPLATE EXCEL</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveTool(activeTool === 'import' ? 'none' : 'import')
              }
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-emerald-800 hover:bg-emerald-900 text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>IMPORT EXCEL</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveTool(activeTool === 'manual' ? 'none' : 'manual')
              }
              className="px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activeTool === 'manual' ? 'Tutup Input Manual' : 'Input Manual'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / Export PDF</span>
            </button>
          </div>
        }
      />

      {errorMsg && (
        <div className="p-3 border border-red-300 bg-red-50 rounded-md text-xs text-red-800">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-3 border border-emerald-300 bg-emerald-50 rounded-md text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* TOOL 1: DOWNLOAD TEMPLATE EXCEL */}
      {activeTool === 'template' && (
        <Panel
          title="Download Template Excel Resmi SIAKHLAK"
          meta="Tersedia Template Master 6 Sheet (Guru, Wali Kelas, 31 Indikator & Rekap Otomatis) serta Template Per-Siswa (4 Sheet)."
        >
          {assignedClasses.length === 0 || allowedPeriods.length === 0 ? (
            <EmptyState
              title="Kelas Penugasan atau Periode Aktif Belum Tersedia"
              description="Pastikan kelas, siswa, dan periode akademik aktif sudah ditetapkan oleh Admin Yayasan sebelum mengunduh template."
            />
          ) : (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Kelas Penugasan *
                  </label>
                  <select
                    value={effectiveClass?.id || ''}
                    onChange={(e) => {
                      setSelectedClassId(e.target.value);
                      setTemplateStudentId('');
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    {assignedClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.unitCode} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Periode Penilaian (Aktif) *
                  </label>
                  <select
                    value={effectivePeriod?.id || ''}
                    onChange={(e) => setSelectedPeriodId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    {allowedPeriods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Bulan &amp; Tahun Penilaian
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={assessmentMonth}
                      onChange={(e) => setAssessmentMonth(e.target.value)}
                      className="px-2.5 py-2 bg-white border border-slate-300 rounded-md"
                    >
                      {MONTHS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={assessmentYear}
                      onChange={(e) => setAssessmentYear(e.target.value)}
                      className="px-2.5 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Pilih Siswa ({classStudents.length} terdaftar)
                  </label>
                  <select
                    value={templateStudentId || classStudents[0]?.id || ''}
                    onChange={(e) => setTemplateStudentId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    {classStudents.length === 0 && (
                      <option value="">Tidak ada siswa di kelas ini</option>
                    )}
                    {classStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nis} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {classStudents.length === 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p>
                    <strong>Catatan:</strong> Belum ada siswa terhubung dengan kelas ini di database. Anda tetap dapat mengunduh <strong>Template Master 6 Sheet</strong> di bawah untuk memasukkan siswa secara manual.
                  </p>
                </div>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-slate-600 space-y-1">
                <p className="font-medium text-slate-800">
                  Pilihan Template Excel Resmi:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  <li>
                    <strong>Template Master (6 Sheet):</strong> PETUNJUK, DATA_GURU_WALI_KELAS, REFERENSI, MASTER_31_INDIKATOR, PENILAIAN_31_INDIKATOR (seluruh siswa kelas sekaligus, skala 1–4, kosong = belum dinilai), dan REKAP_PENILAIAN (otomatis dengan rumus COUNT, SUM, AVERAGE, IF).
                  </li>
                  <li>
                    <strong>Template Per-Siswa (4 Sheet):</strong> PETUNJUK, IDENTITAS_PENILAIAN, PENILAIAN (P01–P31 kosong tanpa default 4), REFERENSI_INDIKATOR.
                  </li>
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadMasterAssessmentWorkbook}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer shadow-sm text-xs"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                  <span>Unduh Template Master Guru, Wali Kelas & 31 Indikator (6 Sheet .xlsx)</span>
                </button>
                <button
                  type="button"
                  disabled={classStudents.length === 0}
                  onClick={handleDownloadSingleTemplate}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-medium disabled:opacity-50 cursor-pointer text-xs"
                >
                  <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                  <span>Unduh Template Per-Siswa Terpilih (4 Sheet .xlsx)</span>
                </button>
                <button
                  type="button"
                  disabled={classStudents.length === 0}
                  onClick={handleDownloadAllClassTemplates}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-medium disabled:opacity-50 cursor-pointer text-xs"
                >
                  <Download className="w-4 h-4 text-slate-500" />
                  <span>Unduh Template Seluruh Siswa Kelas ({classStudents.length} file)</span>
                </button>
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* TOOL 2: IMPORT EXCEL */}
      {activeTool === 'import' && (
        <Panel
          title="Import Penilaian Excel (Multi-File Tervalidasi)"
          meta="Unggah satu atau beberapa file .xlsx siswa sekaligus. Sistem memvalidasi identitas, kelas, periode, 31 indikator, dan konflik data."
        >
          {assignedClasses.length === 0 || allowedPeriods.length === 0 ? (
            <EmptyState
              title="Kelas Penugasan atau Periode Aktif Belum Tersedia"
              description="Hubungi Admin Yayasan untuk menetapkan kelas penugasan dan periode aktif."
            />
          ) : (
            <div className="space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    1. Pilih Kelas Penugasan *
                  </label>
                  <select
                    value={effectiveClass?.id || ''}
                    onChange={(e) => {
                      setSelectedClassId(e.target.value);
                      setPreviews([]);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    {assignedClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.unitCode} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    2. Pilih Periode Penilaian *
                  </label>
                  <select
                    value={effectivePeriod?.id || ''}
                    onChange={(e) => {
                      setSelectedPeriodId(e.target.value);
                      setPreviews([]);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    {allowedPeriods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Status Pengajuan / Verifikasi
                  </label>
                  <select
                    value={importVerStatus}
                    onChange={(e) =>
                      setImportVerStatus(e.target.value as VerificationStatus)
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Menunggu Verifikasi">Menunggu Verifikasi (Pengajuan)</option>
                    {canVerifyAssessment && (
                      <option value="Terverifikasi">Terverifikasi</option>
                    )}
                  </select>
                </div>

                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importPublishToParents}
                      onChange={(e) => setImportPublishToParents(e.target.checked)}
                    />
                    <span>Izinkan Tampil ke Siswa / Orang Tua</span>
                  </label>
                </div>
              </div>

              {/* Drag and drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.length) {
                    processFiles(e.dataTransfer.files);
                  }
                }}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging
                    ? 'border-emerald-700 bg-emerald-50/50'
                    : 'border-slate-300 bg-slate-50/50'
                }`}
              >
                <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                <p className="font-medium text-slate-900">
                  Seret &amp; lepaskan beberapa file Excel (.xlsx) di sini
                </p>
                <p className="text-slate-500 mt-1">
                  atau pilih file dari perangkat Anda (1 file = 1 siswa)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      processFiles(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 px-4 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-medium cursor-pointer"
                >
                  Pilih File Excel (.xlsx)
                </button>
              </div>

              {/* Validation Summary & Preview */}
              {previews.length > 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {(
                      [
                        ['VALID', statusCounts.VALID, 'text-emerald-800'],
                        ['INVALID', statusCounts.INVALID, 'text-red-700'],
                        ['DUPLICATE', statusCounts.DUPLICATE, 'text-amber-800'],
                        [
                          'NEEDS STUDENT REGISTRATION',
                          statusCounts['NEEDS STUDENT REGISTRATION'],
                          'text-red-800',
                        ],
                        ['NEEDS REVIEW', statusCounts['NEEDS REVIEW'], 'text-indigo-800'],
                      ] as const
                    ).map(([label, cnt, color]) => (
                      <div
                        key={label}
                        className="p-3 bg-white border border-slate-200 rounded-md"
                      >
                        <p className="text-slate-500 truncate">{label}</p>
                        <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${color}`}>
                          {cnt}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-md">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="py-2.5 px-3 font-medium">File</th>
                          <th className="py-2.5 px-3 font-medium">Siswa &amp; NIS</th>
                          <th className="py-2.5 px-3 font-medium text-right">Terisi / 31</th>
                          <th className="py-2.5 px-3 font-medium text-right">Capaian</th>
                          <th className="py-2.5 px-3 font-medium">Status</th>
                          <th className="py-2.5 px-3 font-medium">Detail Validasi / Revisi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previews.map((item, idx) => (
                          <tr key={`${item.fileName}-${idx}`} className="align-top">
                            <td className="py-2.5 px-3 font-mono text-slate-800 max-w-48 truncate">
                              {item.fileName}
                            </td>
                            <td className="py-2.5 px-3">
                              <p className="font-medium text-slate-900">
                                {item.student?.name || item.identitas?.studentName || '-'}
                              </p>
                              <p className="text-slate-500 font-mono">
                                NIS: {item.identitas?.nis || '-'}
                              </p>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              {item.filledCount} / 31
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium">
                              {item.averagePct !== null ? `${item.averagePct}%` : 'NULL'}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold whitespace-nowrap">
                              <span
                                className={
                                  item.status === 'VALID'
                                    ? 'text-emerald-700'
                                    : item.status === 'DUPLICATE'
                                    ? 'text-amber-700'
                                    : item.status === 'NEEDS REVIEW'
                                    ? 'text-indigo-700'
                                    : 'text-red-700'
                                }
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 space-y-1.5">
                              {item.errors.map((err, i) => (
                                <p key={i} className="text-red-700">
                                  • {err}
                                </p>
                              ))}
                              {item.warnings.map((w, i) => (
                                <p key={i} className="text-amber-800">
                                  • {w}
                                </p>
                              ))}
                              {item.status === 'VALID' && (
                                <p className="text-emerald-700">
                                  Siap disimpan ke Firestore.
                                </p>
                              )}

                              {item.status === 'DUPLICATE' && item.existingAssessmentId && (
                                <div className="pt-1 space-y-1.5">
                                  <label className="inline-flex items-center gap-1.5 font-medium text-slate-800 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={item.revisionEnabled}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setPreviews((prev) =>
                                          prev.map((p, i) =>
                                            i === idx ? { ...p, revisionEnabled: checked } : p
                                          )
                                        );
                                      }}
                                    />
                                    <span>Ajukan sebagai Revisi Penilaian</span>
                                  </label>
                                  {item.revisionEnabled && (
                                    <input
                                      type="text"
                                      value={item.revisionReason}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setPreviews((prev) =>
                                          prev.map((p, i) =>
                                            i === idx ? { ...p, revisionReason: val } : p
                                          )
                                        );
                                      }}
                                      placeholder="Wajib isi alasan resmi revisi (min. 5 karakter)..."
                                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                                    />
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {importProgress && saving && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-slate-600 font-mono tabular-nums">
                        <span>Mengimpor ke Firestore...</span>
                        <span>
                          {importProgress.done} / {importProgress.total}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-800 transition-all"
                          style={{
                            width: `${
                              importProgress.total > 0
                                ? (importProgress.done / importProgress.total) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={saving || actionableCount === 0}
                        onClick={handleConfirmImport}
                        className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium disabled:opacity-50 cursor-pointer"
                      >
                        {saving
                          ? 'Menyimpan...'
                          : `Konfirmasi Import (${actionableCount} file siap simpan)`}
                      </button>
                      {hasFailures && (
                        <button
                          type="button"
                          onClick={handleDownloadErrorCsv}
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-medium cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Unduh Laporan Error (.csv)</span>
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviews([]);
                        setCommitResult(null);
                      }}
                      className="text-slate-500 hover:text-slate-800 underline cursor-pointer"
                    >
                      Bersihkan Preview
                    </button>
                  </div>
                </div>
              )}

              {commitResult && (
                <div className="p-4 border border-slate-200 bg-slate-50 rounded-md space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    {commitResult.failedFiles.length === 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-700" />
                    )}
                    <span>
                      Hasil Import: {commitResult.succeededFiles.length} berhasil ·{' '}
                      {commitResult.failedFiles.length} gagal
                    </span>
                  </div>
                  {commitResult.failedFiles.length > 0 && (
                    <ul className="text-red-700 space-y-0.5 pl-5 list-disc">
                      {commitResult.failedFiles.map((f, i) => (
                        <li key={i}>
                          {f.fileName}: {f.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      {/* TOOL 3: MANUAL INPUT (SKALA 1-4 ATAU KOSONG / NULL) */}
      {activeTool === 'manual' && (
        <Panel
          title="Input Manual Penilaian 31 Indikator (Skala 1–4 atau Kosong)"
          meta="Kosongkan nilai jika indikator belum dinilai (disimpan sebagai NULL)."
        >
          {students.length === 0 || allowedPeriods.length === 0 ? (
            <EmptyState
              title="Siswa atau Periode Aktif Belum Tersedia"
              description="Tambahkan data siswa dan periode akademik aktif terlebih dahulu."
            />
          ) : (
            <form onSubmit={handleManualSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Siswa *</label>
                  <select
                    required
                    value={manualStudentId}
                    onChange={(e) => setManualStudentId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="">-- Pilih Siswa --</option>
                    {students
                      .filter((s) =>
                        assignedClasses.some((c) => c.id === s.classId)
                      )
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.unitCode} - {s.className})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Periode *</label>
                  <select
                    value={manualPeriodId || allowedPeriods[0]?.id}
                    onChange={(e) => setManualPeriodId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    {allowedPeriods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Status Verifikasi
                  </label>
                  <select
                    value={manualVerStatus}
                    onChange={(e) =>
                      setManualVerStatus(e.target.value as VerificationStatus)
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Menunggu Verifikasi">Menunggu Verifikasi (Pengajuan)</option>
                    {canVerifyAssessment && (
                      <option value="Terverifikasi">Terverifikasi</option>
                    )}
                  </select>
                </div>
              </div>

              {existingManualAssessment && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-md space-y-2 text-amber-950">
                  <p className="font-semibold">
                    Penilaian siswa pada periode ini sudah ada (Status: {existingManualAssessment.verificationStatus}).
                  </p>
                  <p className="text-amber-900">
                    Penyimpanan akan memperbarui dokumen penilaian yang ada tanpa membuat duplikat dan dicatat ke Audit Trail.
                    {existingManualAssessment.verificationStatus === 'Terverifikasi'
                      ? ' Karena status sudah Terverifikasi, wajib mengisi alasan resmi revisi minimal 5 karakter.'
                      : ''}
                  </p>
                  <div>
                    <label className="block font-medium text-amber-950 mb-1">
                      Alasan Resmi Revisi{' '}
                      {existingManualAssessment.verificationStatus === 'Terverifikasi'
                        ? '(Wajib, min. 5 karakter) *'
                        : '(Opsional)'}
                    </label>
                    <input
                      type="text"
                      required={existingManualAssessment.verificationStatus === 'Terverifikasi'}
                      minLength={
                        existingManualAssessment.verificationStatus === 'Terverifikasi' ? 5 : undefined
                      }
                      value={manualRevisionReason}
                      onChange={(e) => setManualRevisionReason(e.target.value)}
                      placeholder="Tuliskan alasan resmi perbaikan / revisi penilaian..."
                      className="w-full px-3 py-2 bg-white border border-amber-300 rounded-md text-slate-900"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded border border-slate-200">
                <span className="text-slate-600 font-medium">Instrumen Penilaian:</span>
                {!existingManualAssessment && isEmu && selectableVersions.length > 1 ? (
                  <select
                    value={manualInstrumentVersion}
                    onChange={(e) => setManualInstrumentVersion(e.target.value as InstrumentVersion)}
                    className="px-2 py-1 bg-white border border-purple-300 text-purple-900 rounded font-semibold text-xs"
                  >
                    <option value="v1.0-legacy">v1.0-legacy (Active Production)</option>
                    <option value="v2.0-canonical">v2.0-canonical (Resmi [S2] - EMULATOR ONLY)</option>
                  </select>
                ) : (
                  <span
                    className={`px-2 py-0.5 rounded font-semibold text-xs ${
                      activeFormResolution.version === 'v2.0-canonical'
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {activeFormResolution.version === 'v2.0-canonical'
                      ? 'v2.0-canonical (Resmi [S2])'
                      : 'v1.0-legacy (Production)'}
                  </span>
                )}
              </div>

              <div className="border border-slate-200 rounded-md max-h-72 overflow-y-auto divide-y divide-slate-100">
                {activeFormIndicators.map((ind) => (
                  <div
                    key={ind.code}
                    className="px-3 py-2 flex items-center justify-between gap-4"
                  >
                    <div>
                      <span className="font-mono text-slate-500 mr-2">
                        {ind.excelCode}.
                      </span>
                      <span className="font-medium text-slate-900">{ind.title}</span>
                      <span className="ml-2 text-slate-500">({ind.domain})</span>
                    </div>
                    <select
                      value={
                        manualScores[ind.excelCode] === null
                          ? ''
                          : String(manualScores[ind.excelCode])
                      }
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : Number(e.target.value);
                        setManualScores((prev) => ({
                          ...prev,
                          [ind.excelCode]: val,
                        }));
                      }}
                      className="w-28 px-2 py-1 bg-white border border-slate-300 rounded-md font-mono"
                    >
                      <option value="">Kosong</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <input
                  type="text"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Catatan Guru / Wali Kelas (opsional)..."
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
                <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualPublish}
                    onChange={(e) => setManualPublish(e.target.checked)}
                  />
                  <span>Izinkan Tampil ke Orang Tua</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan Penilaian Siswa'}
              </button>
            </form>
          )}
        </Panel>
      )}

      {/* Existing Assessments Monitoring & Publish Toggle */}
      <Panel
        title="Daftar Penilaian 31 Indikator Tersimpan"
        meta={`${scopedAssessments.length} dokumen penilaian aktual di Firestore`}
      >
        {scopedAssessments.length === 0 ? (
          <EmptyState
            title="Belum Ada Penilaian Tersimpan"
            description="Gunakan tombol Import Excel atau Input Manual di atas untuk menyimpan penilaian siswa."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Siswa</th>
                  <th className="py-2 px-3 font-medium">Unit &amp; Kelas</th>
                  <th className="py-2 px-3 font-medium text-right">Terisi</th>
                  <th className="py-2 px-3 font-medium text-right">Capaian</th>
                  <th className="py-2 px-3 font-medium">Sumber &amp; Verifikasi</th>
                  <th className="py-2 pl-3 font-medium text-right">Tampil ke Wali</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scopedAssessments.map((a) => {
                  const filled = AKHLAK_31_INDICATORS.filter(
                    (ind) => getScoreValue(a.scores, ind) !== null
                  ).length;
                  return (
                    <tr key={a.id}>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-slate-900">{a.studentName}</p>
                        {a.revisionReason && (
                          <p className="text-amber-800">Revisi: {a.revisionReason}</p>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {a.unitCode} · {a.className}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {filled} / 31
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium">
                        {a.averageScore !== null ? `${a.averageScore.toFixed(1)}%` : 'NULL'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {a.importSource === 'excel' ? 'Excel' : 'Manual'} · {a.verificationStatus}
                        <span className="block text-[11px] font-mono text-slate-500">
                          {a.instrumentVersion || 'v1.0-legacy'}
                        </span>
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            toggleAssessmentPublishToParents(
                              a.id,
                              !Boolean(a.isPublishedToParents)
                            )
                          }
                          className={`text-xs font-medium underline cursor-pointer ${
                            a.isPublishedToParents ? 'text-emerald-800' : 'text-slate-500'
                          }`}
                        >
                          {a.isPublishedToParents ? 'Diizinkan' : 'Belum Dirilis'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Riwayat Import Excel */}
      <Panel
        title="Riwayat Import Excel"
        meta={`${importLogs.length} catatan aktivitas import`}
      >
        {importLogs.length === 0 ? (
          <EmptyState
            title="Belum Ada Riwayat Import Excel"
            description="Setiap proses import Excel akan mencatat file, guru, kelas, periode, jumlah valid/gagal, serta pesan error."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Waktu Import</th>
                  <th className="py-2 px-3 font-medium">File</th>
                  <th className="py-2 px-3 font-medium">Guru</th>
                  <th className="py-2 px-3 font-medium">Kelas &amp; Periode</th>
                  <th className="py-2 px-3 font-medium text-right">Valid / Gagal</th>
                  <th className="py-2 pl-3 font-medium">Status &amp; Pesan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importLogs.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="py-2.5 pr-3 font-mono text-slate-600 whitespace-nowrap">
                      {formatTimestamp(log.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-900 max-w-48 truncate">
                      {log.fileName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{log.teacherName}</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {log.unitCode} · {log.className} ({log.periodName})
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <span className="text-emerald-800 font-semibold">{log.validCount}</span> /{' '}
                      <span className="text-red-700 font-semibold">{log.failedCount}</span>
                    </td>
                    <td className="py-2.5 pl-3">
                      <p className="font-medium text-slate-900">{log.status}</p>
                      {log.errorMessage && (
                        <p className="text-red-700 mt-0.5 max-w-xs">{log.errorMessage}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
