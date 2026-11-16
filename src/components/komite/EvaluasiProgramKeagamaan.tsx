import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  AcademicPeriod,
  ActiveMenuKey,
  matchesEducationLevel,
  ReligiousProgram,
  UnitCode,
} from '../../types/siakhlak';
import { updateKomiteProgramEvaluationNote } from '../../services/siakhlakService';
import { EmptyState, Panel, SectionHeader } from '../ui/Primitives';
import { FoundationReportHeader } from '../branding/FoundationBrand';

export function EvaluasiProgramKeagamaan({
  authorizedUnits,
  periods,
  programs,
  activePeriodId,
  canAddNote,
  onNavigate,
}: {
  authorizedUnits: UnitCode[];
  periods: AcademicPeriod[];
  programs: ReligiousProgram[];
  activePeriodId: string;
  canAddNote: boolean;
  onNavigate: (menu: ActiveMenuKey) => void;
}) {
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [periodFilter, setPeriodFilter] = useState<string>(
    activePeriodId || periods[0]?.id || ''
  );
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'pembiasaan' | 'monev'>('ALL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return programs.filter(
      (p) =>
        (p.category === 'pembiasaan' || p.category === 'monev') &&
        authorizedUnits.some((au) => matchesEducationLevel(p.unitCode, au)) &&
        matchesEducationLevel(p.unitCode, unitFilter) &&
        (categoryFilter === 'ALL' || p.category === categoryFilter) &&
        (!periodFilter || p.periodId === periodFilter)
    );
  }, [programs, authorizedUnits, unitFilter, categoryFilter, periodFilter]);

  const handleSaveNote = async (programId: string) => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await updateKomiteProgramEvaluationNote(programId, noteText);
      setEditingId(null);
      setNoteText('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan catatan evaluasi.');
    } finally {
      setSaving(false);
    }
  };

  const selectedPeriodName =
    periods.find((p) => p.id === periodFilter)?.name || 'Semua Periode';

  return (
    <div className="space-y-6">
      <FoundationReportHeader
        reportTitle="LAPORAN EVALUASI PROGRAM KEAGAMAAN & MONEV"
        subtitle="Tinjauan efektivitas program pembiasaan keagamaan dan Monev Pendidikan Agama."
        periodLabel={selectedPeriodName}
        unitLabel={unitFilter === 'ALL' ? authorizedUnits.join(', ') : unitFilter}
      />
      <SectionHeader
        title="Evaluasi Program Keagamaan"
        subtitle="Tinjauan efektivitas program pembiasaan keagamaan dan Monev Pendidikan Agama. Komite dapat memberikan catatan evaluasi tanpa mengubah data capaian unit."
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | 'pembiasaan' | 'monev')}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900"
            >
              <option value="ALL">Pembiasaan &amp; Monev</option>
              <option value="pembiasaan">Pembiasaan Keagamaan</option>
              <option value="monev">Monev Pendidikan Agama</option>
            </select>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900"
            >
              <option value="ALL">Seluruh Unit</option>
              {authorizedUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900"
            >
              <option value="">Semua Periode</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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

      <Panel
        title="Daftar Program Pembiasaan & Monev untuk Dievaluasi"
        meta={`${filtered.length} program ditemukan`}
        action={
          <button
            type="button"
            onClick={() => onNavigate('komite_temuan_rekomendasi')}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 hover:bg-slate-50 text-slate-800 cursor-pointer"
          >
            Buat Rekomendasi Resmi
          </button>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="Belum Ada Program Keagamaan untuk Dievaluasi"
            description="Data program pembiasaan keagamaan dan Monev akan muncul di sini setelah unit pendidikan menginput pelaksanaannya di modul SIAKHLAK."
          />
        ) : (
          <div className="divide-y divide-slate-200">
            {filtered.map((prog) => {
              const isEditing = editingId === prog.id;
              return (
                <div key={prog.id} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {prog.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        {prog.unitCode} · {prog.category === 'pembiasaan' ? 'Pembiasaan Keagamaan' : 'Monev Agama'} · Jadwal: {prog.schedule} · PIC: {prog.picName}
                      </p>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                        {prog.completionPct}%
                      </span>
                      <span className="block text-xs text-slate-500 tabular-nums">
                        {prog.actualParticipants} / {prog.targetParticipants} peserta · {prog.status}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {prog.description}
                  </p>

                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-800">
                        Catatan Evaluasi Komite Pendidikan Agama
                      </p>
                      {canAddNote && !isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(prog.id);
                            setNoteText(prog.komiteEvaluationNote || '');
                          }}
                          className="text-xs font-medium text-emerald-800 hover:underline cursor-pointer"
                        >
                          {prog.komiteEvaluationNote ? 'Ubah Catatan' : 'Tambah Catatan Evaluasi'}
                        </button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          rows={3}
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Tuliskan catatan evaluasi efektivitas program dan masukan perbaikan..."
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-2 focus:outline-emerald-800"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleSaveNote(prog.id)}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-800 text-white hover:bg-emerald-900 disabled:opacity-50 cursor-pointer"
                          >
                            {saving ? 'Menyimpan...' : 'Simpan Catatan'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-white cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-slate-600">
                        {prog.komiteEvaluationNote || 'Belum ada catatan evaluasi dari Komite.'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
