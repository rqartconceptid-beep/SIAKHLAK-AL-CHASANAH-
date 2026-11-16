import React, { useMemo, useState } from 'react';
import { Plus, Printer, Trash2 } from 'lucide-react';
import {
  AcademicPeriod,
  FindingAspect,
  FindingPriority,
  isFoundationOrSuperAdmin,
  KomiteFinding,
  matchesEducationLevel,
  normalizeRole,
  UnitCode,
  UnitScope,
  UserProfile,
} from '../../types/siakhlak';
import {
  createKomiteFinding,
  deleteMasterDoc,
  formatTimestamp,
  updateKomiteFindingByKomite,
} from '../../services/siakhlakService';
import { EmptyState, FollowUpStatusText, Panel, SectionHeader } from '../ui/Primitives';
import { FoundationReportHeader } from '../branding/FoundationBrand';

const ASPECTS: FindingAspect[] = [
  'Pendidikan Agama',
  'Akhlakul Karimah',
  'Monev',
  'Mutabaah',
  'Pembiasaan Keagamaan',
];

const PRIORITIES: FindingPriority[] = ['Rendah', 'Sedang', 'Tinggi', 'Kritis'];

export function TemuanRekomendasi({
  profile,
  authorizedUnits,
  periods,
  findings,
  activePeriodId,
}: {
  profile: UserProfile;
  authorizedUnits: UnitCode[];
  periods: AcademicPeriod[];
  findings: KomiteFinding[];
  activePeriodId: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [unitCode, setUnitCode] = useState<UnitScope>('Seluruh Unit');
  const [periodId, setPeriodId] = useState(activePeriodId || periods[0]?.id || 'PERIODE_AKTIF');
  const [aspect, setAspect] = useState<FindingAspect>('Pendidikan Agama');
  const [findingDetail, setFindingDetail] = useState('');
  const [problemAnalysis, setProblemAnalysis] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [priority, setPriority] = useState<FindingPriority>('Sedang');
  const [picName, setPicName] = useState('');
  const [picUnit, setPicUnit] = useState('Kepala Unit');
  const [dueDate, setDueDate] = useState('');

  const canonicalRole = normalizeRole(profile.role);
  const canManage = canonicalRole === 'COMMITTEE_ADMIN' || isFoundationOrSuperAdmin(canonicalRole);

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      const unitOk =
        f.unitCode === 'Seluruh Unit' ||
        authorizedUnits.some((au) => matchesEducationLevel(f.unitCode, au));
      const matchUnit = unitFilter === 'ALL' || matchesEducationLevel(f.unitCode, unitFilter);
      const matchPriority = priorityFilter === 'ALL' || f.priority === priorityFilter;
      return unitOk && matchUnit && matchPriority;
    });
  }, [findings, authorizedUnits, unitFilter, priorityFilter]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setUnitCode('Seluruh Unit');
    setPeriodId(activePeriodId || periods[0]?.id || 'PERIODE_AKTIF');
    setAspect('Pendidikan Agama');
    setFindingDetail('');
    setProblemAnalysis('');
    setRecommendation('');
    setPriority('Sedang');
    setPicName('');
    setPicUnit('Kepala Unit');
    setDueDate('');
    setShowForm(false);
  };

  const handleEdit = (item: KomiteFinding) => {
    setEditingId(item.id);
    setTitle(item.title);
    setUnitCode(item.unitCode);
    setPeriodId(item.periodId);
    setAspect(item.aspect);
    setFindingDetail(item.findingDetail);
    setProblemAnalysis(item.problemAnalysis);
    setRecommendation(item.recommendation);
    setPriority(item.priority);
    setPicName(item.picName);
    setPicUnit(item.picUnit);
    setDueDate(item.dueDate);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      if (editingId) {
        await updateKomiteFindingByKomite(editingId, {
          title,
          unitCode,
          aspect,
          findingDetail,
          problemAnalysis,
          recommendation,
          priority,
          picName,
          picUnit,
          dueDate,
        });
      } else {
        await createKomiteFinding({
          title,
          unitCode,
          periodId: periodId || 'PERIODE_AKTIF',
          aspect,
          findingDetail,
          problemAnalysis,
          recommendation,
          priority,
          picName,
          picUnit,
          dueDate,
          createdByName: profile.displayName,
        });
      }
      resetForm();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan temuan.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setErrorMsg(null);
    try {
      await deleteMasterDoc('komiteFindings', id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus temuan.');
    }
  };

  return (
    <div className="space-y-6">
      <FoundationReportHeader
        reportTitle="LAPORAN TEMUAN & REKOMENDASI KOMITE PENDIDIKAN AGAMA"
        subtitle="Daftar temuan hasil monitoring, analisis permasalahan, dan rekomendasi perbaikan per unit."
        unitLabel={unitFilter === 'ALL' ? authorizedUnits.join(', ') : unitFilter}
      />
      <SectionHeader
        title="Temuan dan Rekomendasi"
        subtitle="Pencatatan temuan hasil monitoring, analisis akar permasalahan, rekomendasi perbaikan, prioritas, serta penentuan unit/PIC tindak lanjut."
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  if (showForm) resetForm();
                  else setShowForm(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-emerald-800 hover:bg-emerald-900 text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showForm ? 'Tutup Formulir' : 'Catat Temuan & Rekomendasi'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-emerald-800 bg-white hover:bg-emerald-50 text-emerald-900 cursor-pointer"
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

      {showForm && canManage && (
        <Panel
          title={editingId ? 'Ubah Temuan & Rekomendasi' : 'Formulir Temuan & Rekomendasi Komite'}
          meta="Data akan tersimpan di database dan langsung dapat dipantau unit penanggung jawab."
        >
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Judul Temuan *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Konsistensi pencatatan Mutaba’ah harian kelas VII"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Unit Sasaran *
                  </label>
                  <select
                    value={unitCode}
                    onChange={(e) => setUnitCode(e.target.value as UnitScope)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="Seluruh Unit">Seluruh Unit</option>
                    {authorizedUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Aspek Monitoring *
                  </label>
                  <select
                    value={aspect}
                    onChange={(e) => setAspect(e.target.value as FindingAspect)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    {ASPECTS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Prioritas Rekomendasi *
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as FindingPriority)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Penanggung Jawab Tindak Lanjut (PIC) *
                </label>
                <input
                  type="text"
                  required
                  value={picName}
                  onChange={(e) => setPicName(e.target.value)}
                  placeholder="Nama pejabat / koordinator unit"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Jabatan / Bagian *
                  </label>
                  <input
                    type="text"
                    required
                    value={picUnit}
                    onChange={(e) => setPicUnit(e.target.value)}
                    placeholder="Wakakur / Guru PAI"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Tenggat Waktu
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Uraian Temuan Hasil Monitoring *
              </label>
              <textarea
                rows={3}
                required
                value={findingDetail}
                onChange={(e) => setFindingDetail(e.target.value)}
                placeholder="Deskripsikan fakta hasil monitoring di lapangan secara objektif..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Analisis Permasalahan
              </label>
              <textarea
                rows={2}
                value={problemAnalysis}
                onChange={(e) => setProblemAnalysis(e.target.value)}
                placeholder="Faktor penyebab utama kendala atau ketidaksesuaian..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Rekomendasi Perbaikan *
              </label>
              <textarea
                rows={3}
                required
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
                placeholder="Langkah perbaikan konkret dan terukur yang direkomendasikan Komite..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-medium rounded-md bg-emerald-800 hover:bg-emerald-900 text-white disabled:opacity-50 cursor-pointer"
              >
                {saving
                  ? 'Menyimpan...'
                  : editingId
                  ? 'Perbarui Temuan'
                  : 'Simpan Temuan & Rekomendasi'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
            </div>
          </form>
        </Panel>
      )}

      {/* Filter & List */}
      <Panel
        title="Daftar Temuan dan Rekomendasi Komite"
        meta={`${filteredFindings.length} catatan tersimpan`}
        action={
          <div className="flex items-center gap-2">
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
            >
              <option value="ALL">Semua Unit</option>
              <option value="Seluruh Unit">Seluruh Unit</option>
              {authorizedUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
            >
              <option value="ALL">Semua Prioritas</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {filteredFindings.length === 0 ? (
          <EmptyState
            title="Belum Ada Temuan & Rekomendasi"
            description="Catat temuan monitoring, analisis permasalahan, dan rekomendasi perbaikan melalui tombol di atas."
            action={
              canManage && !showForm ? (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="px-3.5 py-2 text-xs font-medium rounded-md bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer"
                >
                  Catat Temuan Pertama
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredFindings.map((item) => (
              <div key={item.id} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      {item.unitCode} · {item.aspect} · Prioritas {item.priority} · PIC: {item.picName} ({item.picUnit}) · Tenggat: {item.dueDate || '-'} · Dibuat: {formatTimestamp(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <FollowUpStatusText status={item.followUpStatus} />
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                          className="text-xs font-medium text-slate-700 hover:text-slate-900 underline cursor-pointer"
                        >
                          Ubah
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          title="Hapus Temuan"
                          className="p-1 text-slate-400 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-md p-3">
                  <div>
                    <p className="font-medium text-slate-800">Temuan Monitoring</p>
                    <p className="mt-1 text-slate-600 leading-relaxed">{item.findingDetail}</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">Analisis Permasalahan</p>
                    <p className="mt-1 text-slate-600 leading-relaxed">
                      {item.problemAnalysis || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">Rekomendasi Perbaikan</p>
                    <p className="mt-1 text-slate-600 leading-relaxed">{item.recommendation}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
