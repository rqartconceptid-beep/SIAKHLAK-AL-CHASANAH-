import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  AKHLAK_31_INDICATORS,
  AcademicPeriod,
  AcademicYearDoc,
  ActiveMenuKey,
  ClassAssignment,
  EDUCATION_UNITS,
  EducationUnit,
  ExcelImportLog,
  getScoreValue,
  isFoundationOrSuperAdmin,
  KomiteFinding,
  matchesEducationLevel,
  MutabaahLog,
  normalizeEducationLevel,
  normalizeRole,
  ReligiousProgram,
  SchoolClass,
  Student,
  StudentAssessment,
  UnitAggregate,
  UnitCode,
  UserProfile,
} from '../../types/siakhlak';
import { formatTimestamp, saveUnitAggregate } from '../../services/siakhlakService';
import { EmptyState, Panel, SectionHeader } from '../ui/Primitives';
import { FoundationBrand, FoundationReportHeader } from '../branding/FoundationBrand';

export function CoreDashboard({
  profile,
  units,
  periods,
  academicYears = [],
  classes = [],
  students,
  assessments,
  mutabaahLogs = [],
  importLogs = [],
  aggregates,
  programs,
  findings,
  activePeriodId,
  onNavigate,
  classAssignments = [],
  selectedTeacherClassId,
  onSelectTeacherClass,
}: {
  profile: UserProfile;
  units: EducationUnit[];
  periods: AcademicPeriod[];
  academicYears?: AcademicYearDoc[];
  classes?: SchoolClass[];
  students: Student[];
  assessments: StudentAssessment[];
  mutabaahLogs?: MutabaahLog[];
  importLogs?: ExcelImportLog[];
  aggregates: UnitAggregate[];
  programs: ReligiousProgram[];
  findings: KomiteFinding[];
  activePeriodId: string;
  onNavigate: (menu: ActiveMenuKey) => void;
  classAssignments?: ClassAssignment[];
  selectedTeacherClassId?: string;
  onSelectTeacherClass?: (classId: string) => void;
}) {
  const [showAggForm, setShowAggForm] = useState(false);
  const [unitCode, setUnitCode] = useState<UnitCode>(
    profile.assignedUnits?.[0] ? normalizeEducationLevel(profile.assignedUnits[0]) : 'SD'
  );
  const [periodId, setPeriodId] = useState<string>(activePeriodId || periods[0]?.id || '');
  const [assessedCount, setAssessedCount] = useState<number>(0);
  const [overallAkhlak, setOverallAkhlak] = useState<number>(0);
  const [monevPct, setMonevPct] = useState<number>(0);
  const [mutabaahPct, setMutabaahPct] = useState<number>(0);
  const [pembiasaanPct, setPembiasaanPct] = useState<number>(0);
  const [summaryText, setSummaryText] = useState('');
  const [constraintsText, setConstraintsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canonicalRole = normalizeRole(profile.role);
  const isGuru = canonicalRole === 'TEACHER' || canonicalRole === 'HOMEROOM_TEACHER';

  const scopedClasses = useMemo(() => {
    if (!isGuru) return classes;
    const activeAssigns = classAssignments.filter(
      (ca) => ca.teacher_uid === profile.uid && ca.assignment_status === 'active'
    );
    const explicitIds = new Set<string>(
      activeAssigns.length > 0
        ? activeAssigns.map((ca) => ca.class_id)
        : profile.assignedClassIds || []
    );
    if (explicitIds.size === 0) return [];
    return classes.filter((c) => {
      const unitOk =
        profile.assignedUnits.length === 0 ||
        profile.assignedUnits.some((au) => matchesEducationLevel(c.unitCode, au));
      return unitOk && explicitIds.has(c.id);
    });
  }, [isGuru, classes, profile.uid, profile.assignedUnits, profile.assignedClassIds, classAssignments]);

  const activeTeacherClass = useMemo(() => {
    if (!isGuru || scopedClasses.length === 0) return null;
    if (selectedTeacherClassId) {
      const found = scopedClasses.find((c) => c.id === selectedTeacherClassId);
      if (found) return found;
    }
    return scopedClasses[0] || null;
  }, [isGuru, scopedClasses, selectedTeacherClassId]);

  const scopedStudents = useMemo(() => {
    if (!isGuru) return students;
    const allowedIds = new Set(scopedClasses.map((c) => c.id));
    return students.filter((s) => allowedIds.has(s.classId));
  }, [isGuru, students, scopedClasses]);

  const activeClassStudents = useMemo(() => {
    if (!activeTeacherClass) return scopedStudents;
    return scopedStudents.filter((s) => s.classId === activeTeacherClass.id);
  }, [scopedStudents, activeTeacherClass]);

  const scopedAssessments = useMemo(() => {
    if (!isGuru) return assessments;
    const allowedClassIds = new Set(scopedClasses.map((c) => c.id));
    if (allowedClassIds.size === 0) return [];
    return assessments.filter((a) => {
      const unitOk =
        profile.assignedUnits.length === 0 ||
        profile.assignedUnits.some((au) => matchesEducationLevel(a.unitCode, au));
      const classOk = a.classId ? allowedClassIds.has(a.classId) : false;
      return unitOk && classOk;
    });
  }, [isGuru, assessments, profile.assignedUnits, scopedClasses]);

  const scopedFindings = useMemo(() => {
    if (!isGuru || profile.assignedUnits.length === 0) return findings;
    return findings.filter(
      (f) =>
        f.unitCode === 'Seluruh Unit' ||
        profile.assignedUnits.some((au) => matchesEducationLevel(f.unitCode, au))
    );
  }, [isGuru, findings, profile.assignedUnits]);

  const handleSaveAggregate = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenPeriod = periods.find((p) => p.id === (periodId || activePeriodId || periods[0]?.id));
    if (!chosenPeriod) {
      setErrorMsg('Buat dan pilih periode akademik terlebih dahulu di Data Master.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const unitAssessments = assessments.filter(
        (a) => matchesEducationLevel(a.unitCode, unitCode) && a.periodId === chosenPeriod.id
      );
      const indicatorScores: Record<string, number> = {};
      AKHLAK_31_INDICATORS.forEach((ind) => {
        if (unitAssessments.length > 0) {
          const vals = unitAssessments
            .map((a) => getScoreValue(a.scores, ind))
            .filter((v): v is number => typeof v === 'number')
            .map((v) => (v <= 4 ? Number(((v / 4) * 100).toFixed(1)) : v));
          indicatorScores[ind.code] =
            vals.length > 0
              ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
              : overallAkhlak;
        } else {
          indicatorScores[ind.code] = overallAkhlak;
        }
      });

      await saveUnitAggregate({
        unitCode,
        periodId: chosenPeriod.id,
        periodName: chosenPeriod.name,
        assessedStudentCount: assessedCount,
        overallAkhlakScore: overallAkhlak,
        indicatorScores,
        monevProgressPct: monevPct,
        mutabaahCompliancePct: mutabaahPct,
        pembiasaanExecutionPct: pembiasaanPct,
        religiousConditionSummary: summaryText,
        keyConstraints: constraintsText,
      });
      setShowAggForm(false);
      setSummaryText('');
      setConstraintsText('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan agregat unit.');
    } finally {
      setSaving(false);
    }
  };

  const activePeriodLabel =
    periods.find((p) => p.id === activePeriodId)?.name || 'Semua / Periode Aktif';

  return (
    <div className="space-y-6">
      <FoundationBrand
        variant="dashboardBanner"
        contextLabel={isGuru ? 'Portal Guru / Wali Kelas' : 'Portal Admin Yayasan'}
      />
      <FoundationReportHeader
        reportTitle={
          isGuru
            ? 'LAPORAN RINGKASAN GURU & WALI KELAS'
            : 'LAPORAN RINGKASAN OPERASIONAL YAYASAN'
        }
        subtitle="Rekapitulasi kelas penugasan, penilaian 31 indikator Akhlakul Karimah, dan laporan agregat unit pendidikan."
        periodLabel={activePeriodLabel}
        unitLabel={
          profile.assignedUnits.length > 0
            ? profile.assignedUnits.join(', ')
            : 'TK, SD, SMP, SMA, SMK'
        }
      />
      <SectionHeader
        title={isGuru ? 'Dashboard Guru / Wali Kelas' : 'Dashboard Operasional Yayasan SIAKHLAK'}
        subtitle={
          isGuru
            ? 'Ringkasan kelas penugasan, progres penilaian 31 indikator Akhlakul Karimah, import Excel, dan tindak lanjut rekomendasi unit.'
            : 'Pusat kendali data induk unit pendidikan, penilaian 31 indikator Akhlakul Karimah, program keagamaan, serta koordinasi tindak lanjut rekomendasi Komite.'
        }
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              type="button"
              onClick={() => onNavigate('core_penilaian_akhlak')}
              className="px-3.5 py-2 text-xs font-medium rounded-md bg-emerald-800 hover:bg-emerald-900 text-white cursor-pointer"
            >
              Penilaian 31 Indikator &amp; Excel
            </button>
            <button
              type="button"
              onClick={() => setShowAggForm((v) => !v)}
              className="px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer"
            >
              {showAggForm ? 'Tutup Form Agregat' : 'Input Laporan Agregat Unit'}
            </button>
            {isFoundationOrSuperAdmin(canonicalRole) && (
              <button
                type="button"
                onClick={() => onNavigate('komite_dashboard')}
                className="px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer"
              >
                Buka Dashboard Komite
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-emerald-800 bg-white hover:bg-emerald-50 text-emerald-900 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / PDF</span>
            </button>
          </div>
        }
      />

      {errorMsg && (
        <div className="p-3 border border-red-300 bg-red-50 rounded-md text-xs text-red-800">
          {errorMsg}
        </div>
      )}

      {isGuru && (
        <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-800 rounded-lg p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 flex-1 text-xs">
              <div>
                <p className="text-slate-500">Nama Guru / Wali Kelas</p>
                <p className="mt-0.5 font-semibold text-slate-900">{profile.displayName}</p>
                <p className="text-slate-500 font-mono truncate">{profile.email}</p>
              </div>
              <div>
                <p className="text-slate-500">Unit &amp; Jenjang Pendidikan</p>
                <p className="mt-0.5 font-semibold text-slate-900">
                  {activeTeacherClass
                    ? `${activeTeacherClass.educationUnitName || activeTeacherClass.educationUnitId || normalizeEducationLevel(activeTeacherClass.unitCode)} (${normalizeEducationLevel(activeTeacherClass.unitCode) === 'TK' ? 'KB/TK' : normalizeEducationLevel(activeTeacherClass.unitCode)})`
                    : profile.assignedUnits.join(', ') || 'Belum ditetapkan'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Tahun Ajaran</p>
                <p className="mt-0.5 font-semibold font-mono text-slate-900">
                  {activeTeacherClass?.academicYearId
                    ? academicYears.find((y) => y.id === activeTeacherClass.academicYearId)
                        ?.yearName || activeTeacherClass.academicYearId
                    : academicYears.find((y) => y.isActive)?.yearName || activePeriodLabel}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Kelas Aktif Terpilih</p>
                <p className="mt-0.5 font-semibold text-emerald-900">
                  {activeTeacherClass
                    ? `${activeTeacherClass.name} (Tingkat ${activeTeacherClass.level})`
                    : 'Belum ada kelas'}
                </p>
              </div>
              {scopedClasses.length > 1 && onSelectTeacherClass && (
                <div className="no-print">
                  <label
                    htmlFor="teacher-dashboard-class-switcher"
                    className="block text-slate-500 mb-1"
                  >
                    Pindah Kelas Penugasan
                  </label>
                  <select
                    id="teacher-dashboard-class-switcher"
                    value={activeTeacherClass?.id || ''}
                    onChange={(e) => onSelectTeacherClass(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-slate-900 text-xs"
                  >
                    {scopedClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {normalizeEducationLevel(c.unitCode)} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 no-print">
            <button
              type="button"
              onClick={() => onNavigate('core_penilaian_akhlak')}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 hover:bg-emerald-100 cursor-pointer"
            >
              Input Penilaian &amp; Import Excel Kelas Ini
            </button>
            <button
              type="button"
              onClick={() => onNavigate('core_program_keagamaan')}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer"
            >
              Catat Mutaba’ah &amp; Program Unit
            </button>
            <button
              type="button"
              onClick={() => onNavigate('core_tindak_lanjut_unit')}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer"
            >
              Tindak Lanjut Rekomendasi
            </button>
          </div>
        </div>
      )}

      {/* Operational KPIs from Actual DB */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">
            {isGuru ? 'Kelas Penugasan' : 'Unit Pendidikan Terdaftar'}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {isGuru ? scopedClasses.length : `${units.length} / ${EDUCATION_UNITS.length}`}
          </p>
          <p className="mt-1 text-xs text-slate-500 truncate">
            {isGuru
              ? scopedClasses.map((c) => `${normalizeEducationLevel(c.unitCode)} ${c.name}`).join(', ') || 'Belum ada kelas ditugaskan'
              : 'TK, SD, SMP, SMA, SMK'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Siswa &amp; Penilaian Akhlak</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {scopedStudents.length} / {scopedAssessments.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {scopedAssessments.filter((a) => a.verificationStatus === 'Terverifikasi').length} terverifikasi ·{' '}
            {scopedAssessments.filter((a) => a.verificationStatus === 'Menunggu Verifikasi').length} menunggu
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">
            {isGuru ? 'Riwayat Import Excel & Mutaba’ah' : 'Program Keagamaan Aktif'}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {isGuru ? `${importLogs.length} / ${mutabaahLogs.length}` : programs.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {isGuru
              ? 'Batch import Excel / entri Mutaba’ah'
              : 'Monev, Mutaba’ah & Pembiasaan'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">Rekomendasi Komite</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {scopedFindings.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {scopedFindings.filter((f) => f.followUpStatus === 'Baru').length} menunggu penerimaan unit
          </p>
        </div>
      </div>

      {showAggForm && (
        <Panel
          title="Input / Perbarui Laporan Agregat Unit Pendidikan"
          meta="Data aktual ini akan langsung tampil pada Dashboard Komite Pendidikan Agama."
        >
          {periods.length === 0 ? (
            <EmptyState
              title="Belum Ada Periode Akademik"
              description="Tambahkan periode akademik terlebih dahulu di menu Data Master Unit & Siswa."
              action={
                <button
                  type="button"
                  onClick={() => onNavigate('core_master_data')}
                  className="px-3.5 py-2 text-xs font-medium rounded-md bg-emerald-800 text-white cursor-pointer"
                >
                  Ke Data Master
                </button>
              }
            />
          ) : (
            <form onSubmit={handleSaveAggregate} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Unit *</label>
                  <select
                    value={unitCode}
                    onChange={(e) => setUnitCode(e.target.value as UnitCode)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    {(isGuru && profile.assignedUnits.length > 0
                      ? profile.assignedUnits
                      : EDUCATION_UNITS
                    ).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Periode Akademik *</label>
                  <select
                    value={periodId || periods[0]?.id}
                    onChange={(e) => setPeriodId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jumlah Siswa Ternilai</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={assessedCount}
                    onChange={(e) => setAssessedCount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Capaian 31 Indikator (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    required
                    value={overallAkhlak}
                    onChange={(e) => setOverallAkhlak(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Monev Agama (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    required
                    value={monevPct}
                    onChange={(e) => setMonevPct(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Mutaba’ah (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    required
                    value={mutabaahPct}
                    onChange={(e) => setMutabaahPct(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Pembiasaan (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    required
                    value={pembiasaanPct}
                    onChange={(e) => setPembiasaanPct(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Ringkasan Kondisi Pendidikan Agama Unit *
                </label>
                <textarea
                  rows={2}
                  required
                  value={summaryText}
                  onChange={(e) => setSummaryText(e.target.value)}
                  placeholder="Ringkasan capaian aktual, pelaksanaan sholat berjamaah, tahfidz, dan adab siswa..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Kendala Lapangan (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={constraintsText}
                  onChange={(e) => setConstraintsText(e.target.value)}
                  placeholder="Kendala yang perlu menjadi perhatian Komite Pendidikan Agama..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan Agregat Unit'}
              </button>
            </form>
          )}
        </Panel>
      )}

      {isGuru && (
        <Panel
          title={
            activeTeacherClass
              ? `Daftar Siswa & Progres Penilaian Kelas ${activeTeacherClass.name}`
              : 'Daftar Siswa Kelas Penugasan'
          }
          meta={`${activeClassStudents.length} siswa pada kelas terpilih`}
        >
          {!activeTeacherClass ? (
            <EmptyState
              title="Belum Ada Kelas Penugasan"
              description="Hubungi Admin Yayasan untuk menetapkan unit & kelas penugasan pada akun Guru Anda."
            />
          ) : activeClassStudents.length === 0 ? (
            <EmptyState
              title="Belum Ada Siswa Terdaftar di Kelas Ini"
              description="Tambahkan atau tempatkan siswa ke kelas ini melalui Data Master Admin Yayasan."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">NIS</th>
                    <th className="py-2 px-3 font-medium">Nama Siswa</th>
                    <th className="py-2 px-3 font-medium text-right">Capaian Akhlak</th>
                    <th className="py-2 px-3 font-medium">Status Verifikasi</th>
                    <th className="py-2 pl-3 font-medium text-right">Mutaba’ah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeClassStudents.map((stu) => {
                    const stuAss = scopedAssessments.find(
                      (a) =>
                        a.studentId === stu.id &&
                        (!activePeriodId || a.periodId === activePeriodId)
                    );
                    const stuMutCount = mutabaahLogs.filter(
                      (m) => m.studentId === stu.id
                    ).length;
                    return (
                      <tr key={stu.id}>
                        <td className="py-2.5 pr-3 font-mono text-slate-600">{stu.nis}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">{stu.name}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                          {stuAss && stuAss.averageScore !== null
                            ? `${stuAss.averageScore}%`
                            : 'Belum dinilai'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          {stuAss ? stuAss.verificationStatus : 'Belum ada input'}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-slate-700">
                          {stuMutCount} entri
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {isGuru && (
        <Panel
          title="Monitoring Progres Penilaian Kelas Penugasan"
          meta={`${scopedClasses.length} kelas penugasan`}
        >
          {scopedClasses.length === 0 ? (
            <EmptyState
              title="Belum Ada Kelas Penugasan"
              description="Hubungi Admin Yayasan untuk menetapkan unit & kelas penugasan pada akun Guru Anda, atau buat kelas di Data Master."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Unit &amp; Kelas</th>
                    <th className="py-2 px-3 font-medium">Wali Kelas</th>
                    <th className="py-2 px-3 font-medium text-right">Siswa Terdaftar</th>
                    <th className="py-2 px-3 font-medium text-right">Penilaian Tersimpan</th>
                    <th className="py-2 pl-3 font-medium text-right">Terverifikasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scopedClasses.map((c) => {
                    const clsStudents = scopedStudents.filter((s) => s.classId === c.id);
                    const clsAssessments = scopedAssessments.filter(
                      (a) =>
                        (a.classId === c.id || (matchesEducationLevel(a.unitCode, c.unitCode) && a.className === c.name)) &&
                        (!activePeriodId || a.periodId === activePeriodId)
                    );
                    const verified = clsAssessments.filter(
                      (a) => a.verificationStatus === 'Terverifikasi'
                    ).length;
                    return (
                      <tr
                        key={c.id}
                        className={activeTeacherClass?.id === c.id ? 'bg-emerald-50/50' : ''}
                      >
                        <td className="py-2.5 pr-3 font-medium text-slate-900">
                          {c.unitCode} · {c.name}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{c.homeroomTeacherName || '-'}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {clsStudents.length}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {clsAssessments.length}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-emerald-800 font-medium">
                          {verified}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {isGuru && importLogs.length > 0 && (
        <Panel
          title="Import Excel Terbaru"
          meta={`${importLogs.length} riwayat batch guru`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Waktu</th>
                  <th className="py-2 px-3 font-medium">Kelas / Periode</th>
                  <th className="py-2 px-3 font-medium text-right">Berhasil</th>
                  <th className="py-2 px-3 font-medium text-right">Gagal</th>
                  <th className="py-2 pl-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importLogs.slice(0, 5).map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">
                      {formatTimestamp(log.createdAt)}
                    </td>
                    <td className="py-2 px-3 text-slate-900 font-medium">
                      {log.unitCode} · {log.className} ({log.periodName})
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-800">
                      {log.validCount}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-red-700">
                      {log.failedCount}
                    </td>
                    <td className="py-2 pl-3 text-slate-700">{log.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel
        title="Laporan Agregat Unit Tersimpan"
        meta={`${aggregates.length} laporan agregat unit & periode`}
      >
        {aggregates.length === 0 ? (
          <EmptyState
            title="Belum Ada Laporan Agregat Unit"
            description="Gunakan tombol Input Laporan Agregat Unit di atas atau hitung otomatis dari menu Penilaian 31 Indikator."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Unit</th>
                  <th className="py-2 px-3 font-medium">Periode</th>
                  <th className="py-2 px-3 font-medium text-right">Siswa</th>
                  <th className="py-2 px-3 font-medium text-right">Akhlak</th>
                  <th className="py-2 px-3 font-medium text-right">Monev</th>
                  <th className="py-2 px-3 font-medium text-right">Mutaba’ah</th>
                  <th className="py-2 pl-3 font-medium text-right">Pembiasaan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {aggregates.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">{a.unitCode}</td>
                    <td className="py-2.5 px-3 text-slate-600">{a.periodName}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{a.assessedStudentCount}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium">{a.overallAkhlakScore}%</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{a.monevProgressPct}%</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{a.mutabaahCompliancePct}%</td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums">{a.pembiasaanExecutionPct}%</td>
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
