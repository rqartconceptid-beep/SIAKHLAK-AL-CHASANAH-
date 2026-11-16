import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  AcademicPeriod,
  matchesEducationLevel,
  ReligiousProgram,
  UnitAggregate,
  UnitCode,
} from '../../types/siakhlak';
import { updateKomiteProgramEvaluationNote } from '../../services/siakhlakService';
import { EmptyState, Panel, SectionHeader } from '../ui/Primitives';
import { FoundationReportHeader } from '../branding/FoundationBrand';

export function MonitoringMutabaah({
  authorizedUnits,
  periods,
  aggregates,
  programs,
  activePeriodId,
  canAddNote,
}: {
  authorizedUnits: UnitCode[];
  periods: AcademicPeriod[];
  aggregates: UnitAggregate[];
  programs: ReligiousProgram[];
  activePeriodId: string;
  canAddNote: boolean;
}) {
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [periodFilter, setPeriodFilter] = useState<string>(
    activePeriodId || periods[0]?.id || ''
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  const mutabaahPrograms = useMemo(() => {
    return programs.filter(
      (p) =>
        p.category === 'mutabaah' &&
        authorizedUnits.some((au) => matchesEducationLevel(p.unitCode, au)) &&
        matchesEducationLevel(p.unitCode, unitFilter) &&
        (!periodFilter || p.periodId === periodFilter)
    );
  }, [programs, authorizedUnits, unitFilter, periodFilter]);

  const unitMutabaahSummary = useMemo(() => {
    return authorizedUnits
      .filter((u) => matchesEducationLevel(u, unitFilter))
      .map((u) => {
        const agg = aggregates.find(
          (a) =>
            matchesEducationLevel(a.unitCode, u) &&
            (!periodFilter || a.periodId === periodFilter)
        );
        const unitProgs = mutabaahPrograms.filter((p) =>
          matchesEducationLevel(p.unitCode, u)
        );
        return {
          unitCode: u,
          compliancePct: agg ? agg.mutabaahCompliancePct : null,
          programCount: unitProgs.length,
          summary: agg?.religiousConditionSummary || '',
        };
      });
  }, [authorizedUnits, unitFilter, aggregates, periodFilter, mutabaahPrograms]);

  const handleSaveNote = async (id: string) => {
    setSaving(true);
    try {
      await updateKomiteProgramEvaluationNote(id, noteText);
      setEditingId(null);
      setNoteText('');
    } finally {
      setSaving(false);
    }
  };

  const selectedPeriodName =
    periods.find((p) => p.id === periodFilter)?.name || 'Semua Periode';

  return (
    <div className="space-y-6">
      <FoundationReportHeader
        reportTitle="LAPORAN MONITORING MUTABA’AH"
        subtitle="Pemantauan pelaksanaan kegiatan Mutaba’ah yaumiyah di seluruh unit pendidikan."
        periodLabel={selectedPeriodName}
        unitLabel={unitFilter === 'ALL' ? authorizedUnits.join(', ') : unitFilter}
      />
      <SectionHeader
        title="Monitoring Mutaba’ah"
        subtitle="Pemantauan pelaksanaan kegiatan Mutaba’ah yaumiyah (ibadah harian, tilawah, dzikir, dan adab) di seluruh unit pendidikan."
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {unitMutabaahSummary.map((u) => (
          <div key={u.unitCode} className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500">{u.unitCode}</p>
            <p className="mt-1.5 font-mono text-xl font-semibold text-slate-900 tabular-nums">
              {u.compliancePct !== null ? `${u.compliancePct}%` : 'Belum ada data'}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {u.programCount} kegiatan Mutaba’ah
            </p>
          </div>
        ))}
      </div>

      <Panel
        title="Daftar Kegiatan Mutaba’ah Per Unit"
        meta={`${mutabaahPrograms.length} kegiatan Mutaba’ah tercatat di database`}
      >
        {mutabaahPrograms.length === 0 ? (
          <EmptyState
            title="Belum Ada Data Kegiatan Mutaba’ah"
            description="Belum ada laporan kegiatan Mutaba’ah yang tercatat pada database untuk unit dan periode yang dipilih."
          />
        ) : (
          <div className="divide-y divide-slate-200">
            {mutabaahPrograms.map((item) => {
              const isEditing = editingId === item.id;
              return (
                <div key={item.id} className="py-4 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        {item.unitCode} · Jadwal: {item.schedule} · PIC: {item.picName} · Status: {item.status}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <span className="font-mono text-sm font-semibold text-emerald-800 tabular-nums">
                        {item.completionPct}% keterlaksanaan
                      </span>
                      <span className="block text-xs text-slate-500 tabular-nums">
                        {item.actualParticipants} / {item.targetParticipants} peserta
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600">{item.description}</p>

                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-800">
                        Catatan Komite atas Pelaksanaan Mutaba’ah
                      </span>
                      {canAddNote && !isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(item.id);
                            setNoteText(item.komiteEvaluationNote || '');
                          }}
                          className="text-xs font-medium text-emerald-800 hover:underline cursor-pointer"
                        >
                          {item.komiteEvaluationNote ? 'Ubah Catatan' : 'Beri Catatan'}
                        </button>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          rows={2}
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
                          placeholder="Tuliskan catatan pengawasan Mutaba'ah..."
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleSaveNote(item.id)}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer"
                          >
                            {saving ? 'Menyimpan...' : 'Simpan'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 text-slate-700 cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-slate-600">
                        {item.komiteEvaluationNote || 'Belum ada catatan Komite.'}
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
