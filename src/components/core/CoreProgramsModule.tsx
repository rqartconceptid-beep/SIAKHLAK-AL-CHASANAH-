import React, { useMemo, useState } from 'react';
import { Printer, Trash2 } from 'lucide-react';
import {
  AcademicPeriod,
  ClassAssignment,
  EDUCATION_UNITS,
  isFoundationOrSuperAdmin,
  matchesEducationLevel,
  MutabaahLog,
  normalizeEducationLevel,
  normalizeRole,
  ProgramCategory,
  ProgramStatus,
  ReligiousProgram,
  Student,
  UnitCode,
  UserProfile,
} from '../../types/siakhlak';
import {
  createMutabaahLog,
  createReligiousProgram,
  deleteMasterDoc,
} from '../../services/siakhlakService';
import { EmptyState, Panel, RestrictedNotice, SectionHeader } from '../ui/Primitives';
import { FoundationReportHeader } from '../branding/FoundationBrand';

export function CoreProgramsModule({
  profile,
  periods,
  programs,
  students = [],
  mutabaahLogs = [],
  activePeriodId,
  classAssignments = [],
}: {
  profile: UserProfile;
  periods: AcademicPeriod[];
  programs: ReligiousProgram[];
  students?: Student[];
  mutabaahLogs?: MutabaahLog[];
  activePeriodId: string;
  classAssignments?: ClassAssignment[];
}) {
  const [activeTab, setActiveTab] = useState<'programs' | 'mutabaah'>('programs');

  // Program form state
  const [category, setCategory] = useState<ProgramCategory>('monev');
  const [unitCode, setUnitCode] = useState<UnitCode>(
    profile.assignedUnits?.[0] ? normalizeEducationLevel(profile.assignedUnits[0]) : 'SD'
  );
  const [periodId, setPeriodId] = useState<string>(activePeriodId || periods[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetParticipants, setTargetParticipants] = useState(0);
  const [actualParticipants, setActualParticipants] = useState(0);
  const [completionPct, setCompletionPct] = useState(0);
  const [schedule, setSchedule] = useState('');
  const [picName, setPicName] = useState('');
  const [status, setStatus] = useState<ProgramStatus>('Berjalan');

  // Student Mutaba'ah log form state
  const [mStudentId, setMStudentId] = useState('');
  const [mPeriodId, setMPeriodId] = useState(activePeriodId || periods[0]?.id || '');
  const [mDate, setMDate] = useState(new Date().toISOString().slice(0, 10));
  const [sholatWajibCount, setSholatWajibCount] = useState(5);
  const [tilawahPages, setTilawahPages] = useState(2);
  const [dzikirCompleted, setDzikirCompleted] = useState(true);
  const [infaqDone, setInfaqDone] = useState(false);
  const [adabNotes, setAdabNotes] = useState('');
  const [isPublishedToParents, setIsPublishedToParents] = useState(true);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canonicalRole = normalizeRole(profile.role);
  const isTeacher = canonicalRole === 'TEACHER' || canonicalRole === 'HOMEROOM_TEACHER';

  const authorizedTeacherClassIds = useMemo(() => {
    const activeAssigns = classAssignments.filter(
      (ca) => ca.teacher_uid === profile.uid && ca.assignment_status === 'active'
    );
    return new Set<string>(
      activeAssigns.length > 0
        ? activeAssigns.map((ca) => ca.class_id)
        : profile.assignedClassIds || []
    );
  }, [classAssignments, profile.uid, profile.assignedClassIds]);

  const authorizedStudents = useMemo(() => {
    if (!isTeacher) return students;
    if (authorizedTeacherClassIds.size === 0) return [];
    return students.filter((s) => {
      const unitOk =
        profile.assignedUnits.length === 0 ||
        profile.assignedUnits.some((au) => matchesEducationLevel(s.unitCode, au));
      return unitOk && authorizedTeacherClassIds.has(s.classId);
    });
  }, [students, isTeacher, profile.assignedUnits, authorizedTeacherClassIds]);

  const scopedPrograms = useMemo(() => {
    if (!isTeacher || profile.assignedUnits.length === 0) return programs;
    return programs.filter((p) =>
      profile.assignedUnits.some((au) => matchesEducationLevel(p.unitCode, au))
    );
  }, [programs, isTeacher, profile.assignedUnits]);

  const scopedMutabaahLogs = useMemo(() => {
    if (!isTeacher) return mutabaahLogs;
    if (authorizedTeacherClassIds.size === 0) return [];
    return mutabaahLogs.filter((m) => {
      const unitOk =
        profile.assignedUnits.length === 0 ||
        profile.assignedUnits.some((au) => matchesEducationLevel(m.unitCode, au));
      return unitOk && authorizedTeacherClassIds.has(m.classId);
    });
  }, [mutabaahLogs, isTeacher, profile.assignedUnits, authorizedTeacherClassIds]);

  if (
    canonicalRole === 'COMMITTEE_ADMIN' ||
    canonicalRole === 'STUDENT' ||
    canonicalRole === 'PARENT'
  ) {
    return (
      <RestrictedNotice
        title="Pengubahan Program Unit Dibatasi"
        message="Komite Pendidikan Agama, Siswa, dan Orang Tua tidak berwenang mengubah program keagamaan unit atau menginput Mutaba'ah."
      />
    );
  }

  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenPeriod = periodId || activePeriodId || periods[0]?.id;
    if (!chosenPeriod) {
      setErrorMsg('Tambahkan periode akademik terlebih dahulu di Data Master.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await createReligiousProgram({
        category,
        unitCode,
        periodId: chosenPeriod,
        title,
        description,
        targetParticipants,
        actualParticipants,
        completionPct,
        schedule,
        picName,
        status,
      });
      setTitle('');
      setDescription('');
      setSchedule('');
      setPicName('');
      setSuccessMsg('Program keagamaan berhasil disimpan.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan program.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateMutabaah = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenStudent = authorizedStudents.find((s) => s.id === mStudentId);
    const chosenPeriod = mPeriodId || activePeriodId || periods[0]?.id;
    if (!chosenStudent || !chosenPeriod) {
      setErrorMsg('Pilih siswa terdaftar dan periode akademik terlebih dahulu.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await createMutabaahLog({
        studentId: chosenStudent.id,
        studentName: chosenStudent.name,
        unitCode: chosenStudent.unitCode,
        classId: chosenStudent.classId,
        periodId: chosenPeriod,
        logDate: mDate,
        sholatWajibCount,
        tilawahPages,
        dzikirCompleted,
        infaqDone,
        adabNotes,
        isPublishedToParents,
      });
      setAdabNotes('');
      setSuccessMsg(`Catatan Mutaba’ah untuk ${chosenStudent.name} berhasil disimpan.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan catatan Mutaba’ah.');
    } finally {
      setSaving(false);
    }
  };

  const activePeriodLabel =
    periods.find((p) => p.id === (periodId || activePeriodId))?.name || 'Semua Periode';

  return (
    <div className="space-y-6">
      <FoundationReportHeader
        reportTitle={
          activeTab === 'mutabaah'
            ? 'LAPORAN CATATAN MUTABA’AH SISWA'
            : 'LAPORAN PROGRAM MONEV, MUTABA’AH & PEMBIASAAN KEAGAMAAN'
        }
        subtitle="Dokumentasi resmi pelaksanaan program keagamaan unit dan catatan Mutaba’ah siswa."
        periodLabel={activePeriodLabel}
        unitLabel={
          profile.assignedUnits.length > 0
            ? profile.assignedUnits.join(', ')
            : 'TK, SD, SMP, SMA, SMK'
        }
      />
      <SectionHeader
        title="Program Monev, Mutaba’ah & Pembiasaan Keagamaan"
        subtitle="Pengelolaan pelaksanaan program keagamaan unit dan pencatatan Mutaba’ah individual siswa."
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              type="button"
              onClick={() => {
                setActiveTab('programs');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`px-3.5 py-2 text-xs font-medium rounded-md border cursor-pointer ${
                activeTab === 'programs'
                  ? 'bg-emerald-800 text-white border-emerald-800'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Program Unit Keagamaan
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('mutabaah');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`px-3.5 py-2 text-xs font-medium rounded-md border cursor-pointer ${
                activeTab === 'mutabaah'
                  ? 'bg-emerald-800 text-white border-emerald-800'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Catatan Mutaba’ah Siswa ({scopedMutabaahLogs.length})
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-emerald-800 bg-white hover:bg-emerald-50 text-emerald-900 cursor-pointer"
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
        <div className="p-3 border border-emerald-300 bg-emerald-50 rounded-md text-xs text-emerald-900">
          {successMsg}
        </div>
      )}

      {activeTab === 'programs' ? (
        <>
          <Panel title="Input Program Keagamaan Baru">
            {periods.length === 0 ? (
              <EmptyState
                title="Belum Ada Periode Akademik"
                description="Tambahkan periode akademik di menu Data Master Unit & Siswa terlebih dahulu."
              />
            ) : (
              <form onSubmit={handleCreateProgram} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Kategori *</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ProgramCategory)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    >
                      <option value="monev">Monev Pendidikan Agama</option>
                      <option value="mutabaah">Kegiatan Mutaba’ah</option>
                      <option value="pembiasaan">Pembiasaan Keagamaan</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Unit *</label>
                    <select
                      value={unitCode}
                      onChange={(e) => setUnitCode(e.target.value as UnitCode)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    >
                      {(isTeacher && profile.assignedUnits.length > 0
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
                    <label className="block font-medium text-slate-700 mb-1">Periode *</label>
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
                    <label className="block font-medium text-slate-700 mb-1">Status *</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ProgramStatus)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    >
                      <option value="Direncanakan">Direncanakan</option>
                      <option value="Berjalan">Berjalan</option>
                      <option value="Selesai">Selesai</option>
                      <option value="Terkendala">Terkendala</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Nama Program *</label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Contoh: Sholat Dhuha & Dzikir Pagi"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Jadwal *</label>
                    <input
                      type="text"
                      required
                      value={schedule}
                      onChange={(e) => setSchedule(e.target.value)}
                      placeholder="Setiap hari pukul 07.00"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Penanggung Jawab *</label>
                    <input
                      type="text"
                      required
                      value={picName}
                      onChange={(e) => setPicName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Target Peserta</label>
                    <input
                      type="number"
                      min={0}
                      value={targetParticipants}
                      onChange={(e) => setTargetParticipants(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Peserta Aktual</label>
                    <input
                      type="number"
                      min={0}
                      value={actualParticipants}
                      onChange={(e) => setActualParticipants(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Capaian (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={completionPct}
                      onChange={(e) => setCompletionPct(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Deskripsi Pelaksanaan *</label>
                  <textarea
                    rows={2}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Program'}
                </button>
              </form>
            )}
          </Panel>

          <Panel title="Daftar Program Keagamaan Tersimpan" meta={`${scopedPrograms.length} program`}>
            {scopedPrograms.length === 0 ? (
              <EmptyState title="Belum Ada Program" description="Program yang diinput akan dipantau langsung oleh Komite Pendidikan Agama." />
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {scopedPrograms.map((p) => (
                  <div key={p.id} className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-900">{p.title}</p>
                      <p className="text-slate-500 mt-0.5 tabular-nums">
                        {p.unitCode} · {p.category.toUpperCase()} · {p.completionPct}% · {p.status} · PIC: {p.picName}
                      </p>
                      {p.komiteEvaluationNote && (
                        <p className="mt-1 text-emerald-900 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1">
                          Evaluasi Komite: {p.komiteEvaluationNote}
                        </p>
                      )}
                    </div>
                    {isFoundationOrSuperAdmin(canonicalRole) && (
                      <button
                        type="button"
                        onClick={() => deleteMasterDoc('religiousPrograms', p.id)}
                        className="text-slate-400 hover:text-red-700 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      ) : (
        <>
          <Panel
            title="Catat Mutaba’ah Harian / Periodik Siswa"
            meta="Catatan yang diizinkan tampil akan muncul di Portal Siswa & Orang Tua Murid"
          >
            {authorizedStudents.length === 0 || periods.length === 0 ? (
              <EmptyState
                title="Data Siswa atau Periode Belum Tersedia"
                description="Pastikan siswa terdaftar pada kelas penugasan Anda dan periode akademik sudah tersedia."
              />
            ) : (
              <form onSubmit={handleCreateMutabaah} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Siswa *</label>
                    <select
                      required
                      value={mStudentId}
                      onChange={(e) => setMStudentId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                    >
                      <option value="">-- Pilih Siswa --</option>
                      {authorizedStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.nis} · {s.unitCode} {s.className})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Periode *</label>
                    <select
                      value={mPeriodId || periods[0]?.id}
                      onChange={(e) => setMPeriodId(e.target.value)}
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
                    <label className="block font-medium text-slate-700 mb-1">Tanggal *</label>
                    <input
                      type="date"
                      required
                      value={mDate}
                      onChange={(e) => setMDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Sholat Wajib (0–5)</label>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={sholatWajibCount}
                      onChange={(e) => setSholatWajibCount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Tilawah (Halaman)</label>
                    <input
                      type="number"
                      min={0}
                      max={604}
                      value={tilawahPages}
                      onChange={(e) => setTilawahPages(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                    />
                  </div>
                  <label className="flex items-center gap-2 pt-5 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dzikirCompleted}
                      onChange={(e) => setDzikirCompleted(e.target.checked)}
                    />
                    <span>Dzikir Pagi/Petang</span>
                  </label>
                  <label className="flex items-center gap-2 pt-5 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={infaqDone}
                      onChange={(e) => setInfaqDone(e.target.checked)}
                    />
                    <span>Berinfaq</span>
                  </label>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Catatan Adab & Pembinaan (Opsional)</label>
                  <input
                    type="text"
                    value={adabNotes}
                    onChange={(e) => setAdabNotes(e.target.value)}
                    placeholder="Contoh: Disiplin sholat berjamaah dan membaca Al-Qur'an tartil"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>

                <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPublishedToParents}
                    onChange={(e) => setIsPublishedToParents(e.target.checked)}
                  />
                  <span>Izinkan tampil di Portal Siswa &amp; Orang Tua Murid</span>
                </label>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Catatan Mutaba’ah'}
                </button>
              </form>
            )}
          </Panel>

          <Panel title="Riwayat Catatan Mutaba’ah Siswa" meta={`${scopedMutabaahLogs.length} entri`}>
            {scopedMutabaahLogs.length === 0 ? (
              <EmptyState
                title="Belum Ada Catatan Mutaba’ah"
                description="Entri Mutaba’ah harian/mingguan siswa akan tampil di sini."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3 font-medium">Tanggal</th>
                      <th className="py-2 px-3 font-medium">Siswa</th>
                      <th className="py-2 px-3 font-medium text-right">Sholat</th>
                      <th className="py-2 px-3 font-medium text-right">Tilawah</th>
                      <th className="py-2 px-3 font-medium">Rilis Ortu</th>
                      <th className="py-2 pl-3 font-medium">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scopedMutabaahLogs.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2 pr-3 font-mono text-slate-600">{m.logDate}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">
                          {m.studentName} ({m.unitCode})
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">{m.sholatWajibCount}/5</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">{m.tilawahPages} hal</td>
                        <td className="py-2 px-3 text-slate-700">
                          {m.isPublishedToParents ? 'Diizinkan' : 'Internal'}
                        </td>
                        <td className="py-2 pl-3 text-slate-600">{m.adabNotes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
