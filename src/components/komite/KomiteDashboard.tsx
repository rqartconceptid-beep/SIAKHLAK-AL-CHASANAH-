import React, { useMemo, useState } from 'react';
import { ArrowRight, Printer } from 'lucide-react';
import {
  AKHLAK_31_INDICATORS,
  AcademicPeriod,
  ActiveMenuKey,
  EDUCATION_UNITS,
  FOLLOW_UP_STATUSES,
  KomiteFinding,
  matchesEducationLevel,
  normalizeEducationLevel,
  ReligiousProgram,
  UnitAggregate,
  UnitCode,
  EducationUnit,
} from '../../types/siakhlak';
import { EmptyState, FollowUpStatusText, Panel, SectionHeader } from '../ui/Primitives';
import { FoundationBrand, FoundationReportHeader } from '../branding/FoundationBrand';

export function KomiteDashboard({
  authorizedUnits,
  units,
  periods,
  aggregates,
  programs,
  findings,
  activePeriodId,
  onNavigate,
}: {
  authorizedUnits: UnitCode[];
  units: EducationUnit[];
  periods: AcademicPeriod[];
  aggregates: UnitAggregate[];
  programs: ReligiousProgram[];
  findings: KomiteFinding[];
  activePeriodId: string;
  onNavigate: (menu: ActiveMenuKey) => void;
}) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(
    activePeriodId || periods[0]?.id || ''
  );

  const effectivePeriodId =
    selectedPeriodId || activePeriodId || periods[0]?.id || '';

  const filteredAggregates = useMemo(() => {
    return aggregates.filter(
      (a) =>
        authorizedUnits.some((au) => matchesEducationLevel(a.unitCode, au)) &&
        (!effectivePeriodId || a.periodId === effectivePeriodId)
    );
  }, [aggregates, authorizedUnits, effectivePeriodId]);

  const filteredPrograms = useMemo(() => {
    return programs.filter(
      (p) =>
        authorizedUnits.some((au) => matchesEducationLevel(p.unitCode, au)) &&
        (!effectivePeriodId || p.periodId === effectivePeriodId)
    );
  }, [programs, authorizedUnits, effectivePeriodId]);

  const authorizedFindings = useMemo(() => {
    return findings.filter(
      (f) =>
        f.unitCode === 'Seluruh Unit' ||
        authorizedUnits.some((au) => matchesEducationLevel(f.unitCode, au))
    );
  }, [findings, authorizedUnits]);

  const avgMetrics = useMemo(() => {
    if (filteredAggregates.length === 0) return null;
    const count = filteredAggregates.length;
    const sumAkhlak = filteredAggregates.reduce((s, a) => s + a.overallAkhlakScore, 0);
    const sumMonev = filteredAggregates.reduce((s, a) => s + a.monevProgressPct, 0);
    const sumMutabaah = filteredAggregates.reduce((s, a) => s + a.mutabaahCompliancePct, 0);
    const sumPembiasaan = filteredAggregates.reduce((s, a) => s + a.pembiasaanExecutionPct, 0);
    const totalStudentsAssessed = filteredAggregates.reduce(
      (s, a) => s + a.assessedStudentCount,
      0
    );
    return {
      akhlak: (sumAkhlak / count).toFixed(1),
      monev: (sumMonev / count).toFixed(1),
      mutabaah: (sumMutabaah / count).toFixed(1),
      pembiasaan: (sumPembiasaan / count).toFixed(1),
      totalStudentsAssessed,
      unitCount: count,
    };
  }, [filteredAggregates]);

  const indicatorDomainSummary = useMemo(() => {
    if (filteredAggregates.length === 0) return [];
    const domains = Array.from(new Set(AKHLAK_31_INDICATORS.map((i) => i.domain)));
    return domains.map((domain) => {
      const domainIndicators = AKHLAK_31_INDICATORS.filter((i) => i.domain === domain);
      const values: number[] = [];
      filteredAggregates.forEach((agg) => {
        domainIndicators.forEach((ind) => {
          const val = agg.indicatorScores?.[ind.code];
          if (typeof val === 'number' && !Number.isNaN(val)) {
            values.push(val);
          }
        });
      });
      const avg =
        values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : null;
      return {
        domain,
        indicatorCount: domainIndicators.length,
        avgScore: avg !== null ? Number(avg.toFixed(1)) : null,
      };
    });
  }, [filteredAggregates]);

  const programBreakdown = useMemo(() => {
    const categories = [
      { key: 'monev', label: 'Monev Pendidikan Agama' },
      { key: 'mutabaah', label: 'Kegiatan Mutaba’ah' },
      { key: 'pembiasaan', label: 'Pembiasaan Keagamaan' },
    ] as const;

    return categories.map((cat) => {
      const items = filteredPrograms.filter((p) => p.category === cat.key);
      const avgPct =
        items.length > 0
          ? Number(
              (
                items.reduce((s, p) => s + p.completionPct, 0) / items.length
              ).toFixed(1)
            )
          : null;
      const terkendala = items.filter((p) => p.status === 'Terkendala').length;
      return {
        ...cat,
        count: items.length,
        avgPct,
        terkendala,
      };
    });
  }, [filteredPrograms]);

  const followUpCounts = useMemo(() => {
    return FOLLOW_UP_STATUSES.map((status) => ({
      status,
      count: authorizedFindings.filter((f) => f.followUpStatus === status).length,
    }));
  }, [authorizedFindings]);

  const periodComparisons = useMemo(() => {
    const map = new Map<
      string,
      { periodName: string; items: UnitAggregate[] }
    >();
    aggregates
      .filter((a) => authorizedUnits.includes(a.unitCode))
      .forEach((agg) => {
        const entry = map.get(agg.periodId) || {
          periodName: agg.periodName,
          items: [],
        };
        entry.items.push(agg);
        map.set(agg.periodId, entry);
      });

    return Array.from(map.entries()).map(([periodId, { periodName, items }]) => {
      const n = items.length;
      return {
        periodId,
        periodName,
        unitReported: n,
        akhlak: (items.reduce((s, a) => s + a.overallAkhlakScore, 0) / n).toFixed(1),
        monev: (items.reduce((s, a) => s + a.monevProgressPct, 0) / n).toFixed(1),
        mutabaah: (items.reduce((s, a) => s + a.mutabaahCompliancePct, 0) / n).toFixed(1),
        pembiasaan: (items.reduce((s, a) => s + a.pembiasaanExecutionPct, 0) / n).toFixed(1),
      };
    });
  }, [aggregates, authorizedUnits]);

  const displayUnits = EDUCATION_UNITS.filter((u) => authorizedUnits.includes(u));

  const selectedPeriodName =
    periods.find((p) => p.id === effectivePeriodId)?.name || 'Semua Periode Tersimpan';

  return (
    <div className="space-y-6">
      <FoundationBrand
        variant="dashboardBanner"
        contextLabel="Komite Pendidikan Agama Yayasan"
      />
      <FoundationReportHeader
        reportTitle="RINGKASAN EKSEKUTIF KOMITE PENDIDIKAN AGAMA"
        subtitle="Pengawasan mutu pendidikan agama, capaian 31 indikator Akhlakul Karimah, Monev, Mutaba’ah, dan tindak lanjut."
        periodLabel={selectedPeriodName}
        unitLabel={displayUnits.join(' · ')}
      />
      <SectionHeader
        title="Dashboard Komite Pendidikan Agama"
        subtitle="Ringkasan pengawasan mutu pendidikan agama, capaian 31 indikator Akhlakul Karimah, Monev, Mutaba’ah, pembiasaan, serta tindak lanjut rekomendasi seluruh unit."
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <select
              value={effectivePeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              aria-label="Filter Periode Akademik"
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900"
            >
              <option value="">Semua Periode Tersimpan</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onNavigate('komite_temuan_rekomendasi')}
              className="px-3.5 py-2 text-xs font-medium rounded-md bg-emerald-800 hover:bg-emerald-900 text-white whitespace-nowrap shrink-0 cursor-pointer"
            >
              Catat Temuan Baru
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-emerald-800 bg-white hover:bg-emerald-50 text-emerald-900 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / PDF</span>
            </button>
          </div>
        }
      />

      {/* Top KPI Strip - Strictly Computed from Actual Database */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">
            Capaian 31 Indikator Akhlak
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {avgMetrics ? `${avgMetrics.akhlak}%` : 'Belum ada data'}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {avgMetrics
              ? `${avgMetrics.unitCount} unit · ${avgMetrics.totalStudentsAssessed} siswa ternilai`
              : 'Menunggu input agregat unit'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">
            Perkembangan Monev Agama
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {avgMetrics ? `${avgMetrics.monev}%` : 'Belum ada data'}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {programBreakdown[0].count} program Monev tercatat
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">
            Pelaksanaan Mutaba’ah &amp; Pembiasaan
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {avgMetrics
              ? `${avgMetrics.mutabaah}% / ${avgMetrics.pembiasaan}%`
              : 'Belum ada data'}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {programBreakdown[1].count} Mutaba’ah · {programBreakdown[2].count} Pembiasaan
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs font-medium text-slate-500">
            Temuan &amp; Tindak Lanjut Selesai
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {authorizedFindings.length} /{' '}
            {authorizedFindings.filter((f) => f.followUpStatus === 'Selesai').length}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {authorizedFindings.filter((f) => f.followUpStatus !== 'Selesai').length} masih memerlukan tindak lanjut
          </p>
        </div>
      </div>

      {/* 1. Ringkasan Kondisi Pendidikan Agama Seluruh Unit */}
      <Panel
        title="1. Ringkasan Kondisi Pendidikan Agama Seluruh Unit"
        meta={`Cakupan kewenangan: ${displayUnits.join(' · ')}`}
        action={
          <button
            type="button"
            onClick={() => onNavigate('komite_monitoring_agama')}
            className="text-xs font-medium text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
          >
            <span>Lihat Detail</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        }
      >
        {filteredAggregates.length === 0 && units.length === 0 ? (
          <EmptyState
            title="Data Kondisi Pendidikan Agama Belum Tersedia"
            description="Belum ada data master unit atau agregat capaian periode ini yang tercatat di database. Admin Yayasan atau Kepala Unit dapat mengisi data aktual unit melalui modul SIAKHLAK."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Unit</th>
                  <th className="py-2.5 px-3 font-medium text-right">Siswa</th>
                  <th className="py-2.5 px-3 font-medium text-right">Akhlak (31 Ind.)</th>
                  <th className="py-2.5 px-3 font-medium text-right">Monev</th>
                  <th className="py-2.5 px-3 font-medium text-right">Mutaba’ah</th>
                  <th className="py-2.5 px-3 font-medium text-right">Pembiasaan</th>
                  <th className="py-2.5 pl-4 font-medium">Ringkasan Kondisi Aktual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayUnits.map((unitCode) => {
                  const unitMaster = units.find((u) => matchesEducationLevel(u.code, unitCode));
                  const agg = filteredAggregates.find((a) =>
                    matchesEducationLevel(a.unitCode, unitCode)
                  );
                  return (
                    <tr key={unitCode} className="hover:bg-slate-50">
                      <td className="py-3 pr-4 font-medium text-slate-900 whitespace-nowrap">
                        {unitCode}
                        {unitMaster?.name ? (
                          <span className="block text-slate-500 font-normal">
                            {unitMaster.name}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {unitMaster ? unitMaster.studentCount : agg ? agg.assessedStudentCount : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                        {agg ? `${agg.overallAkhlakScore}%` : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {agg ? `${agg.monevProgressPct}%` : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {agg ? `${agg.mutabaahCompliancePct}%` : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {agg ? `${agg.pembiasaanExecutionPct}%` : '-'}
                      </td>
                      <td className="py-3 pl-4 text-slate-600 max-w-xs">
                        {agg?.religiousConditionSummary || unitMaster?.religiousProgramNote || (
                          <span className="text-slate-400 italic">Belum ada catatan periode ini</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* 2 & 3/4/5 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 2. Capaian 31 Indikator Akhlakul Karimah */}
        <Panel
          title="2. Capaian Penilaian 31 Indikator Akhlakul Karimah"
          meta="Rekapitulasi berdasarkan 5 ranah pembinaan karakter"
          action={
            <button
              type="button"
              onClick={() => onNavigate('komite_monitoring_akhlak')}
              className="text-xs font-medium text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
            >
              <span>31 Indikator</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          }
        >
          {indicatorDomainSummary.length === 0 ? (
            <EmptyState
              title="Capaian 31 Indikator Belum Tersedia"
              description="Belum ada rekapitulasi penilaian 31 indikator Akhlakul Karimah pada periode terpilih."
            />
          ) : (
            <div className="space-y-3.5">
              {indicatorDomainSummary.map((d) => (
                <div key={d.domain} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">
                      {d.domain}{' '}
                      <span className="text-slate-500 font-normal">
                        ({d.indicatorCount} indikator)
                      </span>
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {d.avgScore !== null ? `${d.avgScore}%` : 'Belum diisi'}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-800 transition-all"
                      style={{ width: `${d.avgScore ?? 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* 3, 4, 5. Monev, Mutabaah, Pembiasaan */}
        <Panel
          title="3–5. Monev, Mutaba’ah & Pembiasaan Keagamaan"
          meta="Data program aktual yang dilaporkan oleh masing-masing unit"
          action={
            <button
              type="button"
              onClick={() => onNavigate('komite_evaluasi_program')}
              className="text-xs font-medium text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
            >
              <span>Evaluasi Program</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          }
        >
          {filteredPrograms.length === 0 ? (
            <EmptyState
              title="Belum Ada Program Keagamaan Tercatat"
              description="Belum ada catatan program Monev, kegiatan Mutaba’ah, atau pembiasaan keagamaan untuk periode ini."
            />
          ) : (
            <div className="divide-y divide-slate-200">
              {programBreakdown.map((item) => (
                <div
                  key={item.key}
                  className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      {item.count} program aktif · {item.terkendala} berstatus terkendala
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-base font-semibold text-slate-900 tabular-nums">
                      {item.avgPct !== null ? `${item.avgPct}%` : '-'}
                    </p>
                    <p className="text-xs text-slate-500">Rata-rata capaian</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* 6 & 7: Temuan & Status Tindak Lanjut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel
          title="6. Temuan, Kendala & Rekomendasi Terbaru"
          meta="Catatan monitoring Komite Pendidikan Agama"
          className="lg:col-span-2"
          action={
            <button
              type="button"
              onClick={() => onNavigate('komite_temuan_rekomendasi')}
              className="text-xs font-medium text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
            >
              <span>Kelola Temuan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          }
        >
          {authorizedFindings.length === 0 ? (
            <EmptyState
              title="Belum Ada Temuan & Rekomendasi"
              description="Komite belum mencatat temuan monitoring atau rekomendasi perbaikan pada periode ini."
              action={
                <button
                  type="button"
                  onClick={() => onNavigate('komite_temuan_rekomendasi')}
                  className="px-3.5 py-2 text-xs font-medium rounded-md bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer"
                >
                  Catat Temuan Pertama
                </button>
              }
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {authorizedFindings.slice(0, 5).map((f) => (
                <div key={f.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {f.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {f.unitCode} · {f.aspect} · Prioritas {f.priority} · PIC: {f.picName}
                      </p>
                    </div>
                    <FollowUpStatusText status={f.followUpStatus} />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">
                    Rekomendasi: {f.recommendation}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="7. Status Tindak Lanjut"
          meta="Distribusi seluruh rekomendasi Komite"
          action={
            <button
              type="button"
              onClick={() => onNavigate('komite_tindak_lanjut')}
              className="text-xs font-medium text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
            >
              <span>Pantau</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          }
        >
          <div className="divide-y divide-slate-100">
            {followUpCounts.map((item) => (
              <div
                key={item.status}
                className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs"
              >
                <FollowUpStatusText status={item.status} />
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* 8. Perbandingan Perkembangan Antarperiode Akademik */}
      <Panel
        title="8. Perbandingan Perkembangan Antarperiode Akademik"
        meta="Komparasi rata-rata capaian unit berdasarkan data historis periode di database"
      >
        {periodComparisons.length === 0 ? (
          <EmptyState
            title="Belum Ada Data Lintas Periode"
            description="Perbandingan antarperiode akan tampil otomatis setelah data agregat dari satu atau lebih periode akademik tersimpan di database."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Periode Akademik</th>
                  <th className="py-2.5 px-3 font-medium text-right">Unit Melapor</th>
                  <th className="py-2.5 px-3 font-medium text-right">Rata-rata Akhlak</th>
                  <th className="py-2.5 px-3 font-medium text-right">Monev Agama</th>
                  <th className="py-2.5 px-3 font-medium text-right">Mutaba’ah</th>
                  <th className="py-2.5 pl-3 font-medium text-right">Pembiasaan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {periodComparisons.map((row) => (
                  <tr key={row.periodId} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-4 font-medium text-slate-900">
                      {row.periodName}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {row.unitReported}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {row.akhlak}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {row.monev}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {row.mutabaah}%
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-slate-700">
                      {row.pembiasaan}%
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
