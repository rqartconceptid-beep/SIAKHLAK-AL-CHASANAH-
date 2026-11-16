import React, { useMemo, useState } from 'react';
import { Download, Printer, Save } from 'lucide-react';
import {
  AcademicPeriod,
  isFoundationOrSuperAdmin,
  KomiteDecision,
  KomiteFinding,
  KomiteReport,
  matchesEducationLevel,
  normalizeRole,
  ReligiousProgram,
  UnitAggregate,
  UnitCode,
  UserProfile,
} from '../../types/siakhlak';
import { createKomiteReport, formatTimestamp } from '../../services/siakhlakService';
import { EmptyState, Panel, SectionHeader } from '../ui/Primitives';
import { FOUNDATION_BRAND, FoundationReportHeader } from '../branding/FoundationBrand';

export function LaporanKomite({
  profile,
  foundationName,
  authorizedUnits,
  periods,
  aggregates,
  programs,
  findings,
  decisions,
  reports,
  activePeriodId,
}: {
  profile: UserProfile;
  foundationName: string;
  authorizedUnits: UnitCode[];
  periods: AcademicPeriod[];
  aggregates: UnitAggregate[];
  programs: ReligiousProgram[];
  findings: KomiteFinding[];
  decisions: KomiteDecision[];
  reports: KomiteReport[];
  activePeriodId: string;
}) {
  const [periodFilter, setPeriodFilter] = useState<string>(
    activePeriodId || periods[0]?.id || ''
  );
  const [reportTitle, setReportTitle] = useState('');
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedPeriodName =
    periods.find((p) => p.id === periodFilter)?.name || 'Semua Periode';

  const scopedAggregates = useMemo(
    () =>
      aggregates.filter(
        (a) =>
          authorizedUnits.some((au) => matchesEducationLevel(a.unitCode, au)) &&
          (!periodFilter || a.periodId === periodFilter)
      ),
    [aggregates, authorizedUnits, periodFilter]
  );

  const scopedPrograms = useMemo(
    () =>
      programs.filter(
        (p) =>
          authorizedUnits.some((au) => matchesEducationLevel(p.unitCode, au)) &&
          (!periodFilter || p.periodId === periodFilter)
      ),
    [programs, authorizedUnits, periodFilter]
  );

  const scopedFindings = useMemo(
    () =>
      findings.filter(
        (f) =>
          f.unitCode === 'Seluruh Unit' ||
          authorizedUnits.some((au) => matchesEducationLevel(f.unitCode, au))
      ),
    [findings, authorizedUnits]
  );

  const hasAnyActualData =
    scopedAggregates.length > 0 ||
    scopedPrograms.length > 0 ||
    scopedFindings.length > 0 ||
    decisions.length > 0;

  const handleSaveArchive = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      await createKomiteReport({
        title: reportTitle,
        periodId: periodFilter || 'ALL',
        periodName: selectedPeriodName,
        unitScope: authorizedUnits.join(', '),
        executiveSummary,
        findingsCount: scopedFindings.length,
        completedFollowUpsCount: scopedFindings.filter(
          (f) => f.followUpStatus === 'Selesai'
        ).length,
        decisionsCount: decisions.length,
        createdByName: profile.displayName,
      });
      setReportTitle('');
      setExecutiveSummary('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan arsip laporan.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    const rows: string[] = [
      'Jenis,Unit,Judul/Periode,Capaian/Status,Keterangan',
      ...scopedAggregates.map(
        (a) =>
          `Agregat Unit,"${a.unitCode}","${a.periodName}","Akhlak ${a.overallAkhlakScore}% | Monev ${a.monevProgressPct}% | Mutabaah ${a.mutabaahCompliancePct}%","${a.religiousConditionSummary.replace(/"/g, '""')}"`
      ),
      ...scopedFindings.map(
        (f) =>
          `Temuan,"${f.unitCode}","${f.title.replace(/"/g, '""')}","${f.followUpStatus}","${f.recommendation.replace(/"/g, '""')}"`
      ),
      ...decisions.map(
        (d) =>
          `Keputusan,"${d.unitCode}","${d.decisionText.replace(/"/g, '""')}","${d.executionStatus}","PIC: ${d.picName} | Tenggat: ${d.deadline}"`
      ),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan-komite-pendidikan-agama.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Laporan Komite Pendidikan Agama"
        subtitle="Kompilasi resmi hasil monitoring, capaian 31 indikator, temuan, tindak lanjut, dan keputusan Komite berdasarkan data aktual database."
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
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
              onClick={handleExportCsv}
              disabled={!hasAnyActualData}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-emerald-800 hover:bg-emerald-900 text-white cursor-pointer"
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

      {/* Printable Official Summary with Formal Kop Surat */}
      <Panel
        title={`Rekapitulasi Laporan Aktual — ${foundationName || FOUNDATION_BRAND.foundationDisplayName}`}
        meta={`Periode: ${selectedPeriodName} · Cakupan Unit: ${authorizedUnits.join(', ')}`}
      >
        <FoundationReportHeader
          alwaysVisible={true}
          reportTitle="LAPORAN RESMI KOMITE PENDIDIKAN AGAMA"
          subtitle={`Rekapitulasi Pengawasan Mutu Pendidikan Agama, Akhlakul Karimah, dan Tindak Lanjut — ${foundationName || FOUNDATION_BRAND.foundationDisplayName}`}
          periodLabel={selectedPeriodName}
          unitLabel={authorizedUnits.join(', ')}
          metaItems={[
            { label: 'Unit Melapor', value: `${scopedAggregates.length} unit` },
            { label: 'Program Terpantau', value: `${scopedPrograms.length} program` },
            {
              label: 'Temuan / Selesai',
              value: `${scopedFindings.length} / ${scopedFindings.filter((f) => f.followUpStatus === 'Selesai').length}`,
            },
            { label: 'Keputusan Rapat', value: `${decisions.length} keputusan` },
          ]}
        />
        {!hasAnyActualData ? (
          <EmptyState
            title="Belum Ada Data Aktual untuk Dilaporkan"
            description="Laporan Komite hanya disusun dari data aktual di database. Belum ada data agregat unit, program, temuan, atau keputusan rapat yang tersimpan."
          />
        ) : (
          <div className="space-y-6 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-slate-200">
              <div>
                <p className="text-slate-500">Unit Melapor Agregat</p>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {scopedAggregates.length}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Program Terpantau</p>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {scopedPrograms.length}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Temuan &amp; Tindak Lanjut Selesai</p>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {scopedFindings.length} /{' '}
                  {scopedFindings.filter((f) => f.followUpStatus === 'Selesai').length}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Keputusan Rapat</p>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {decisions.length}
                </p>
              </div>
            </div>

            {scopedAggregates.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">
                  A. Ringkasan Capaian Unit
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Unit</th>
                        <th className="py-2 px-3 font-medium text-right">Akhlak</th>
                        <th className="py-2 px-3 font-medium text-right">Monev</th>
                        <th className="py-2 px-3 font-medium text-right">Mutaba’ah</th>
                        <th className="py-2 pl-3 font-medium text-right">Pembiasaan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {scopedAggregates.map((a) => (
                        <tr key={a.id}>
                          <td className="py-2 pr-3 font-medium text-slate-900">{a.unitCode}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">{a.overallAkhlakScore}%</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">{a.monevProgressPct}%</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">{a.mutabaahCompliancePct}%</td>
                          <td className="py-2 pl-3 text-right font-mono tabular-nums">{a.pembiasaanExecutionPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {scopedFindings.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">
                  B. Ringkasan Temuan &amp; Status Tindak Lanjut
                </h3>
                <ul className="space-y-1.5 list-disc pl-4 text-slate-700">
                  {scopedFindings.map((f) => (
                    <li key={f.id}>
                      <span className="font-medium text-slate-900">[{f.unitCode}] {f.title}</span> — Status: {f.followUpStatus} (PIC: {f.picName})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Archive Official Report Form */}
      {(normalizeRole(profile.role) === 'COMMITTEE_ADMIN' || isFoundationOrSuperAdmin(profile.role)) && (
        <Panel
          title="Simpan Arsip Laporan Resmi kepada Yayasan"
          meta="Menyimpan ringkasan eksekutif beserta angka statistik aktual saat ini ke database"
          className="no-print"
        >
          <form onSubmit={handleSaveArchive} className="space-y-3 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Judul Laporan Resmi *
              </label>
              <input
                type="text"
                required
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="Contoh: Laporan Monitoring Pendidikan Agama Triwulan I"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Ringkasan Eksekutif &amp; Catatan untuk Pengurus Yayasan *
              </label>
              <textarea
                rows={4}
                required
                value={executiveSummary}
                onChange={(e) => setExecutiveSummary(e.target.value)}
                placeholder="Tuliskan kesimpulan utama evaluasi pendidikan agama, kekuatan unit, serta rekomendasi strategis..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-emerald-800 hover:bg-emerald-900 text-white cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Arsip Laporan'}</span>
            </button>
          </form>
        </Panel>
      )}

      {/* Archived Reports List */}
      <Panel
        title="Arsip Laporan Komite Tersimpan"
        meta={`${reports.length} dokumen arsip laporan`}
        className="no-print"
      >
        {reports.length === 0 ? (
          <EmptyState
            title="Belum Ada Arsip Laporan Komite"
            description="Laporan resmi yang telah disahkan dan disimpan oleh Komite akan muncul di sini."
          />
        ) : (
          <div className="divide-y divide-slate-200">
            {reports.map((rep) => (
              <div key={rep.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-slate-900 text-sm">{rep.title}</h4>
                  <span className="text-slate-500 font-mono">
                    {formatTimestamp(rep.createdAt)}
                  </span>
                </div>
                <p className="text-slate-500 tabular-nums">
                  Periode: {rep.periodName} · Cakupan: {rep.unitScope} · Temuan: {rep.findingsCount} (Selesai: {rep.completedFollowUpsCount}) · Keputusan: {rep.decisionsCount} · Disusun oleh: {rep.createdByName}
                </p>
                <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                  {rep.executiveSummary}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
