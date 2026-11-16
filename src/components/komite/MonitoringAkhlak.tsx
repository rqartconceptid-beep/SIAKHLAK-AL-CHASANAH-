import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  AKHLAK_31_INDICATORS,
  AcademicPeriod,
  matchesEducationLevel,
  normalizeEducationLevel,
  StudentAssessment,
  UnitAggregate,
  UnitCode,
} from '../../types/siakhlak';
import { EmptyState, Panel, RestrictedNotice, SectionHeader } from '../ui/Primitives';
import { FoundationReportHeader } from '../branding/FoundationBrand';

export function MonitoringAkhlak({
  authorizedUnits,
  periods,
  aggregates,
  assessments,
  allowIndividualStudentAccess,
  activePeriodId,
}: {
  authorizedUnits: UnitCode[];
  periods: AcademicPeriod[];
  aggregates: UnitAggregate[];
  assessments: StudentAssessment[];
  allowIndividualStudentAccess: boolean;
  activePeriodId: string;
}) {
  const [periodFilter, setPeriodFilter] = useState<string>(
    activePeriodId || periods[0]?.id || ''
  );
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [domainFilter, setDomainFilter] = useState<string>('ALL');

  const domains = useMemo(
    () => Array.from(new Set(AKHLAK_31_INDICATORS.map((i) => i.domain))),
    []
  );

  const relevantAggregates = useMemo(() => {
    return aggregates.filter(
      (a) =>
        authorizedUnits.some((au) => matchesEducationLevel(a.unitCode, au)) &&
        matchesEducationLevel(a.unitCode, unitFilter) &&
        (!periodFilter || a.periodId === periodFilter)
    );
  }, [aggregates, authorizedUnits, unitFilter, periodFilter]);

  const indicatorRows = useMemo(() => {
    return AKHLAK_31_INDICATORS.filter(
      (ind) => domainFilter === 'ALL' || ind.domain === domainFilter
    ).map((ind) => {
      const unitValues: Record<string, number | null> = {};
      const collected: number[] = [];
      authorizedUnits.forEach((u) => {
        const agg = relevantAggregates.find((a) => matchesEducationLevel(a.unitCode, u));
        const val = agg?.indicatorScores?.[ind.code];
        if (typeof val === 'number' && !Number.isNaN(val)) {
          unitValues[u] = val;
          collected.push(val);
        } else {
          unitValues[u] = null;
        }
      });
      const avg =
        collected.length > 0
          ? Number((collected.reduce((a, b) => a + b, 0) / collected.length).toFixed(1))
          : null;
      return { ...ind, unitValues, avg };
    });
  }, [authorizedUnits, relevantAggregates, domainFilter]);

  const displayedUnits = authorizedUnits.filter((u) =>
    matchesEducationLevel(u, unitFilter)
  );

  const selectedPeriodName =
    periods.find((p) => p.id === periodFilter)?.name || 'Semua Periode';

  return (
    <div className="space-y-6">
      <FoundationReportHeader
        reportTitle="LAPORAN MONITORING PENILAIAN 31 INDIKATOR AKHLAKUL KARIMAH"
        subtitle="Pemantauan capaian 31 indikator Akhlakul Karimah per unit pendidikan."
        periodLabel={selectedPeriodName}
        unitLabel={unitFilter === 'ALL' ? authorizedUnits.join(', ') : unitFilter}
      />
      <SectionHeader
        title="Monitoring Penilaian Akhlakul Karimah"
        subtitle="Pemantauan capaian 31 indikator Akhlakul Karimah per unit pendidikan. Komite tidak dapat mengubah nilai siswa maupun hasil verifikasi penilaian guru."
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900"
            >
              <option value="ALL">Seluruh Ranah (31 Indikator)</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
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

      {!allowIndividualStudentAccess ? (
        <RestrictedNotice
          title="Nilai Individual Siswa Dilindungi (Read-Only Agregat)"
          message="Komite Pendidikan Agama hanya melihat capaian agregat per unit untuk 31 indikator Akhlakul Karimah dan tidak dapat mengubah nilai maupun verifikasi guru. Akses daftar nilai siswa individual memerlukan otorisasi eksplisit Yayasan."
        />
      ) : (
        <Panel
          title="Ringkasan Penilaian Siswa Individual (Read-Only / Terotorisasi Yayasan)"
          meta={`${assessments.length} dokumen penilaian siswa terdata`}
        >
          {assessments.length === 0 ? (
            <EmptyState
              title="Belum Ada Penilaian Siswa Individual"
              description="Belum terdapat data penilaian siswa individual yang diinput guru pada database."
            />
          ) : (
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Nama Siswa</th>
                    <th className="py-2 px-3 font-medium">Unit / Kelas</th>
                    <th className="py-2 px-3 font-medium text-right">Rata-rata 31 Indikator</th>
                    <th className="py-2 pl-3 font-medium">Status Verifikasi Guru</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assessments
                    .filter(
                      (a) =>
                        authorizedUnits.some((au) => matchesEducationLevel(a.unitCode, au)) &&
                        matchesEducationLevel(a.unitCode, unitFilter) &&
                        (!periodFilter || a.periodId === periodFilter)
                    )
                    .map((a) => (
                      <tr key={a.id}>
                        <td className="py-2 pr-3 font-medium text-slate-900">
                          {a.studentName}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {normalizeEducationLevel(a.unitCode)} · {a.className}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                          {a.averageScore !== null ? `${a.averageScore.toFixed(1)}%` : 'Belum ada nilai'}
                        </td>
                        <td className="py-2 pl-3 text-slate-700">
                          {a.verificationStatus}
                          {a.verifiedBy ? ` (${a.verifiedBy})` : ''}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <Panel
        title="Matriks Capaian 31 Indikator Akhlakul Karimah"
        meta={
          relevantAggregates.length === 0
            ? 'Menunggu data agregat unit dari SIAKHLAK'
            : `Menampilkan data aktual dari ${relevantAggregates.length} laporan agregat unit`
        }
      >
        {relevantAggregates.length === 0 && (
          <div className="mb-4">
            <EmptyState
              title="Nilai Agregat 31 Indikator Belum Diinput"
              description="Tabel referensi 31 indikator tetap ditampilkan untuk transparansi standar penilaian Yayasan, namun seluruh nilai capaian akan tampil 0 / belum tersedia hingga Guru atau Admin Yayasan menginput data aktual."
            />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-3 font-medium w-12">No</th>
                <th className="py-2.5 px-3 font-medium">Ranah &amp; Indikator Akhlakul Karimah</th>
                {displayedUnits.map((u) => (
                  <th key={u} className="py-2.5 px-3 font-medium text-right whitespace-nowrap">
                    {u}
                  </th>
                ))}
                <th className="py-2.5 pl-3 font-medium text-right whitespace-nowrap">
                  Rata-rata
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {indicatorRows.map((row) => (
                <tr key={row.code} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-500">
                    {String(row.number).padStart(2, '0')}
                  </td>
                  <td className="py-2.5 px-3">
                    <p className="font-medium text-slate-900">{row.title}</p>
                    <p className="text-slate-500">{row.domain} · {row.code}</p>
                  </td>
                  {displayedUnits.map((u) => (
                    <td
                      key={u}
                      className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700"
                    >
                      {row.unitValues[u] !== null ? `${row.unitValues[u]}%` : '-'}
                    </td>
                  ))}
                  <td className="py-2.5 pl-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {row.avg !== null ? `${row.avg}%` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
