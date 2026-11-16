import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  DecisionExecutionStatus,
  FollowUpStatus,
  KomiteDecision,
  KomiteFinding,
  matchesEducationLevel,
  UnitCode,
} from '../../types/siakhlak';
import {
  updateFindingFollowUpByUnit,
  updateKomiteDecisionStatus,
} from '../../services/siakhlakService';
import { EmptyState, FollowUpStatusText, Panel, SectionHeader } from '../ui/Primitives';
import { FoundationReportHeader } from '../branding/FoundationBrand';

const UNIT_ALLOWED_STATUSES: FollowUpStatus[] = [
  'Diterima',
  'Dalam Proses',
  'Menunggu Verifikasi',
];

export function CoreUnitFollowUp({
  findings,
  decisions,
  authorizedUnits,
}: {
  findings: KomiteFinding[];
  decisions: KomiteDecision[];
  authorizedUnits?: UnitCode[];
}) {
  const scopedFindings = useMemo(() => {
    if (!authorizedUnits || authorizedUnits.length === 0) return findings;
    return findings.filter(
      (f) =>
        f.unitCode === 'Seluruh Unit' ||
        authorizedUnits.some((au) => matchesEducationLevel(f.unitCode, au))
    );
  }, [findings, authorizedUnits]);

  const scopedDecisions = useMemo(() => {
    if (!authorizedUnits || authorizedUnits.length === 0) return decisions;
    return decisions.filter(
      (d) =>
        d.unitCode === 'Seluruh Unit' ||
        authorizedUnits.some((au) => matchesEducationLevel(d.unitCode, au))
    );
  }, [decisions, authorizedUnits]);
  const [editingFindingId, setEditingFindingId] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<FollowUpStatus>('Diterima');
  const [responseText, setResponseText] = useState('');

  const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);
  const [decStatus, setDecStatus] = useState<DecisionExecutionStatus>('Berjalan');
  const [decNote, setDecNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSaveFindingResponse = async (findingId: string) => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await updateFindingFollowUpByUnit(findingId, nextStatus, responseText);
      setEditingFindingId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui tindak lanjut.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDecision = async (decisionId: string) => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await updateKomiteDecisionStatus(decisionId, decStatus, decNote);
      setEditingDecisionId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui progres keputusan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <FoundationReportHeader
        reportTitle="LAPORAN TINDAK LANJUT REKOMENDASI & KEPUTUSAN KOMITE"
        subtitle="Pelaporan tindak lanjut unit terhadap rekomendasi dan keputusan Komite Pendidikan Agama."
        unitLabel="Unit Pendidikan"
      />
      <SectionHeader
        title="Tindak Lanjut Rekomendasi & Keputusan Komite"
        subtitle="Panel bagi Kepala Unit, Guru PAI, dan Pengurus Yayasan untuk menerima, menindaklanjuti, dan melaporkan penyelesaian rekomendasi Komite Pendidikan Agama."
        action={
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-emerald-800 bg-white hover:bg-emerald-50 text-emerald-900 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak / PDF</span>
          </button>
        }
      />

      {errorMsg && (
        <div className="p-3 border border-red-300 bg-red-50 rounded-md text-xs text-red-800">
          {errorMsg}
        </div>
      )}

      <Panel
        title="Rekomendasi Komite yang Perlu Ditindaklanjuti"
        meta={`${scopedFindings.length} rekomendasi`}
      >
        {scopedFindings.length === 0 ? (
          <EmptyState
            title="Belum Ada Rekomendasi dari Komite"
            description="Rekomendasi yang diterbitkan Komite Pendidikan Agama akan muncul di sini untuk ditindaklanjuti unit."
          />
        ) : (
          <div className="divide-y divide-slate-200">
            {scopedFindings.map((f) => {
              const isEditing = editingFindingId === f.id;
              return (
                <div key={f.id} className="py-4 first:pt-0 last:pb-0 space-y-2.5 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{f.title}</p>
                      <p className="text-slate-500 mt-0.5 tabular-nums">
                        {f.unitCode} · Prioritas {f.priority} · PIC: {f.picName} · Tenggat: {f.dueDate || '-'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <FollowUpStatusText status={f.followUpStatus} />
                      {!isEditing && f.followUpStatus !== 'Selesai' && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFindingId(f.id);
                            setNextStatus(
                              UNIT_ALLOWED_STATUSES.includes(f.followUpStatus)
                                ? f.followUpStatus
                                : 'Diterima'
                            );
                            setResponseText(f.followUpResponse || '');
                          }}
                          className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 font-medium text-slate-800 cursor-pointer"
                        >
                          Laporkan Tindak Lanjut
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-slate-700">Rekomendasi: {f.recommendation}</p>
                  {f.followUpResponse && (
                    <p className="text-slate-600">Laporan Unit: {f.followUpResponse}</p>
                  )}
                  {f.komiteEvaluationNote && (
                    <p className="text-amber-900 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                      Catatan Evaluasi Komite: {f.komiteEvaluationNote}
                    </p>
                  )}

                  {isEditing && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2.5">
                      <div className="max-w-xs">
                        <label className="block font-medium text-slate-700 mb-1">
                          Status Pelaksanaan Unit
                        </label>
                        <select
                          value={nextStatus}
                          onChange={(e) => setNextStatus(e.target.value as FollowUpStatus)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                        >
                          {UNIT_ALLOWED_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          Laporan Tindak Lanjut &amp; Bukti Pelaksanaan
                        </label>
                        <textarea
                          rows={2}
                          required
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          placeholder="Jelaskan langkah perbaikan yang sudah dilaksanakan..."
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleSaveFindingResponse(f.id)}
                          className="px-3.5 py-1.5 rounded-md bg-emerald-800 text-white font-medium cursor-pointer"
                        >
                          {saving ? 'Menyimpan...' : 'Kirim Laporan Unit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingFindingId(null)}
                          className="px-3.5 py-1.5 rounded-md border border-slate-300 text-slate-700 cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Pelaksanaan Keputusan Rapat Komite" meta={`${scopedDecisions.length} keputusan`}>
        {scopedDecisions.length === 0 ? (
          <EmptyState
            title="Belum Ada Keputusan Rapat Komite"
            description="Keputusan rapat Komite yang membutuhkan pelaksanaan oleh unit akan tampil di sini."
          />
        ) : (
          <div className="divide-y divide-slate-200 text-xs">
            {scopedDecisions.map((d) => {
              const isEditing = editingDecisionId === d.id;
              return (
                <div key={d.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{d.decisionText}</p>
                      <p className="text-slate-500 tabular-nums">
                        {d.unitCode} · PIC: {d.picName} · Tenggat: {d.deadline} · Status: {d.executionStatus}
                      </p>
                    </div>
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDecisionId(d.id);
                          setDecStatus(d.executionStatus);
                          setDecNote(d.progressNote || '');
                        }}
                        className="text-emerald-800 font-medium hover:underline cursor-pointer"
                      >
                        Perbarui Progres
                      </button>
                    )}
                  </div>
                  {isEditing && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                      <select
                        value={decStatus}
                        onChange={(e) => setDecStatus(e.target.value as DecisionExecutionStatus)}
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                      >
                        <option value="Belum Dimulai">Belum Dimulai</option>
                        <option value="Berjalan">Berjalan</option>
                        <option value="Selesai">Selesai</option>
                      </select>
                      <textarea
                        rows={2}
                        value={decNote}
                        onChange={(e) => setDecNote(e.target.value)}
                        placeholder="Catatan pelaksanaan..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleSaveDecision(d.id)}
                          className="px-3 py-1 rounded-md bg-emerald-800 text-white cursor-pointer"
                        >
                          Simpan
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDecisionId(null)}
                          className="px-3 py-1 rounded-md border border-slate-300 cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
