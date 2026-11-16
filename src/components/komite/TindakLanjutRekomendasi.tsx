import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  FOLLOW_UP_STATUSES,
  FollowUpStatus,
  isFoundationOrSuperAdmin,
  KomiteFinding,
  matchesEducationLevel,
  normalizeRole,
  UnitCode,
  UserProfile,
} from '../../types/siakhlak';
import { updateKomiteFindingByKomite } from '../../services/siakhlakService';
import { EmptyState, FollowUpStatusText, Panel, SectionHeader } from '../ui/Primitives';
import { FoundationReportHeader } from '../branding/FoundationBrand';

export function TindakLanjutRekomendasi({
  profile,
  authorizedUnits,
  findings,
}: {
  profile: UserProfile;
  authorizedUnits: UnitCode[];
  findings: KomiteFinding[];
}) {
  const [statusFilter, setStatusFilter] = useState<'ALL' | FollowUpStatus>('ALL');
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<FollowUpStatus>('Selesai');
  const [evalNote, setEvalNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canonicalRole = normalizeRole(profile.role);
  const isKomite = canonicalRole === 'COMMITTEE_ADMIN' || isFoundationOrSuperAdmin(canonicalRole);

  const authorizedFindings = useMemo(() => {
    return findings.filter(
      (f) =>
        f.unitCode === 'Seluruh Unit' ||
        authorizedUnits.some((au) => matchesEducationLevel(f.unitCode, au))
    );
  }, [findings, authorizedUnits]);

  const filtered = useMemo(() => {
    return authorizedFindings.filter(
      (f) =>
        (statusFilter === 'ALL' || f.followUpStatus === statusFilter) &&
        (unitFilter === 'ALL' || matchesEducationLevel(f.unitCode, unitFilter))
    );
  }, [authorizedFindings, statusFilter, unitFilter]);

  const handleSaveEvaluation = async (findingId: string) => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await updateKomiteFindingByKomite(findingId, {
        followUpStatus: nextStatus,
        komiteEvaluationNote: evalNote,
      });
      setEvaluatingId(null);
      setEvalNote('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui evaluasi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <FoundationReportHeader
        reportTitle="LAPORAN TINDAK LANJUT REKOMENDASI KOMITE"
        subtitle="Pemantauan progres penyelesaian rekomendasi perbaikan oleh unit dan evaluasi Komite."
        unitLabel={unitFilter === 'ALL' ? authorizedUnits.join(', ') : unitFilter}
      />
      <SectionHeader
        title="Tindak Lanjut Rekomendasi"
        subtitle="Pemantauan progres penyelesaian rekomendasi perbaikan oleh unit dan pencatatan evaluasi verifikasi Komite."
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900"
            >
              <option value="ALL">Seluruh Unit</option>
              <option value="Seluruh Unit">Lintas Unit</option>
              {authorizedUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
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

      {/* Segmented interactive status filter */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200 w-fit">
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            statusFilter === 'ALL'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Semua ({authorizedFindings.length})
        </button>
        {FOLLOW_UP_STATUSES.map((st) => {
          const count = authorizedFindings.filter((f) => f.followUpStatus === st).length;
          return (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st} ({count})
            </button>
          );
        })}
      </div>

      {errorMsg && (
        <div className="p-3 border border-red-300 bg-red-50 rounded-md text-xs text-red-800">
          {errorMsg}
        </div>
      )}

      <Panel
        title="Daftar Status Tindak Lanjut Rekomendasi"
        meta={`${filtered.length} rekomendasi ditampilkan`}
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="Tidak Ada Rekomendasi pada Status Ini"
            description="Belum ada temuan dan rekomendasi pada status tindak lanjut yang dipilih."
          />
        ) : (
          <div className="divide-y divide-slate-200">
            {filtered.map((item) => {
              const isEvaluating = evaluatingId === item.id;
              return (
                <div key={item.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        {item.unitCode} · Prioritas {item.priority} · PIC: {item.picName} ({item.picUnit}) · Tenggat: {item.dueDate || '-'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <FollowUpStatusText status={item.followUpStatus} />
                      {isKomite && !isEvaluating && (
                        <button
                          type="button"
                          onClick={() => {
                            setEvaluatingId(item.id);
                            setNextStatus(item.followUpStatus);
                            setEvalNote(item.komiteEvaluationNote || '');
                          }}
                          className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 hover:bg-slate-50 text-slate-800 cursor-pointer"
                        >
                          Evaluasi / Ubah Status
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-md p-3">
                    <div>
                      <p className="font-medium text-slate-800">Rekomendasi Komite</p>
                      <p className="mt-1 text-slate-600">{item.recommendation}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">Tindak Lanjut Unit / PIC</p>
                      <p className="mt-1 text-slate-600">
                        {item.followUpResponse || 'Belum ada laporan tindak lanjut dari unit.'}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">Catatan Evaluasi Komite</p>
                      <p className="mt-1 text-slate-600">
                        {item.komiteEvaluationNote || 'Belum dievaluasi oleh Komite.'}
                      </p>
                    </div>
                  </div>

                  {isEvaluating && isKomite && (
                    <div className="p-4 border border-emerald-200 bg-emerald-50/40 rounded-md space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            Tetapkan Status Tindak Lanjut
                          </label>
                          <select
                            value={nextStatus}
                            onChange={(e) =>
                              setNextStatus(e.target.value as FollowUpStatus)
                            }
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                          >
                            {FOLLOW_UP_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          Catatan Evaluasi Penyelesaian Rekomendasi
                        </label>
                        <textarea
                          rows={2}
                          value={evalNote}
                          onChange={(e) => setEvalNote(e.target.value)}
                          placeholder="Berikan catatan verifikasi apakah rekomendasi telah terselesaikan atau perlu perbaikan..."
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleSaveEvaluation(item.id)}
                          className="px-3.5 py-1.5 text-xs font-medium rounded-md bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer"
                        >
                          {saving ? 'Menyimpan...' : 'Simpan Evaluasi Komite'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEvaluatingId(null)}
                          className="px-3.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 text-slate-700 cursor-pointer"
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
