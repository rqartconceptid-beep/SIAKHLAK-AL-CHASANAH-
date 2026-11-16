import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  AcademicPeriod,
  EDUCATION_UNITS,
  EducationUnit,
  matchesEducationLevel,
  normalizeEducationLevel,
  ReligiousProgram,
  Student,
  UnitAggregate,
  UnitCode,
  UNIT_LABELS,
} from '../../types/siakhlak';
import { EmptyState, Panel, RestrictedNotice, SectionHeader } from '../ui/Primitives';
import { FoundationReportHeader } from '../branding/FoundationBrand';

export function MonitoringPendidikanAgama({
  authorizedUnits,
  units,
  periods,
  aggregates,
  programs,
  students,
  allowIndividualStudentAccess,
  activePeriodId,
}: {
  authorizedUnits: UnitCode[];
  units: EducationUnit[];
  periods: AcademicPeriod[];
  aggregates: UnitAggregate[];
  programs: ReligiousProgram[];
  students: Student[];
  allowIndividualStudentAccess: boolean;
  activePeriodId: string;
}) {
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [periodFilter, setPeriodFilter] = useState<string>(
    activePeriodId || periods[0]?.id || ''
  );

  const visibleUnits = useMemo(() => {
    return EDUCATION_UNITS.filter(
      (u) =>
        authorizedUnits.some((au) => matchesEducationLevel(au, u)) &&
        matchesEducationLevel(u, unitFilter)
    );
  }, [authorizedUnits, unitFilter]);

  const monevPrograms = useMemo(() => {
    return programs.filter(
      (p) =>
        p.category === 'monev' &&
        authorizedUnits.some((au) => matchesEducationLevel(p.unitCode, au)) &&
        matchesEducationLevel(p.unitCode, unitFilter) &&
        (!periodFilter || p.periodId === periodFilter)
    );
  }, [programs, authorizedUnits, unitFilter, periodFilter]);

  const selectedPeriodName =
    periods.find((p) => p.id === periodFilter)?.name || 'Semua Periode';

  return (
    <div className="space-y-6">
      <FoundationReportHeader
        reportTitle="LAPORAN MONITORING PENDIDIKAN AGAMA"
        subtitle="Pemantauan kondisi umum pendidikan agama, keterlaksanaan Monev, dan kendala lapangan per unit."
        periodLabel={selectedPeriodName}
        unitLabel={unitFilter === 'ALL' ? authorizedUnits.join(', ') : unitFilter}
      />
      <SectionHeader
        title="Monitoring Pendidikan Agama"
        subtitle="Pemantauan kondisi umum pendidikan agama, keterlaksanaan Monev, dan kendala lapangan per unit pendidikan Yayasan."
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              aria-label="Filter Unit Pendidikan"
              className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900"
            >
              <option value="ALL">Seluruh Unit Kewenangan</option>
              {authorizedUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              aria-label="Filter Periode"
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
          title="Mode Data Agregat Unit (Default Kebijakan Yayasan)"
          message="Sesuai hak akses default Komite Pendidikan Agama, Anda melihat data agregat tingkat unit. Data siswa individual hanya dapat diakses apabila kewenangan eksplisit diberikan oleh Admin Yayasan."
        />
      ) : (
        <Panel
          title="Akses Khusus Data Siswa Individual Aktif"
          meta={`Yayasan memberikan kewenangan lihat (read-only) untuk ${students.length} siswa terdata`}
        >
          {students.length === 0 ? (
            <EmptyState
              title="Belum Ada Data Master Siswa"
              description="Kewenangan akses siswa individual aktif, namun data master siswa belum diisi di database."
            />
          ) : (
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">NIS</th>
                    <th className="py-2 px-3 font-medium">Nama Siswa</th>
                    <th className="py-2 px-3 font-medium">Unit</th>
                    <th className="py-2 pl-3 font-medium">Kelas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students
                    .filter((s) => matchesEducationLevel(s.unitCode, unitFilter))
                    .slice(0, 20)
                    .map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 pr-3 font-mono text-slate-600">{s.nis}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">{s.name}</td>
                        <td className="py-2 px-3 text-slate-700">{normalizeEducationLevel(s.unitCode)}</td>
                        <td className="py-2 pl-3 text-slate-700">{s.className}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* Unit Condition Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleUnits.map((unitCode) => {
          const master = units.find((u) => matchesEducationLevel(u.code, unitCode));
          const agg = aggregates.find(
            (a) =>
              matchesEducationLevel(a.unitCode, unitCode) &&
              (!periodFilter || a.periodId === periodFilter)
          );
          return (
            <Panel
              key={unitCode}
              title={unitCode}
              meta={master?.name || UNIT_LABELS[normalizeEducationLevel(unitCode)]}
            >
              {!master && !agg ? (
                <EmptyState
                  title={`Belum Ada Data Unit ${unitCode}`}
                  description="Belum terdapat data master atau laporan agregat pendidikan agama untuk unit ini."
                />
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-3 gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <p className="text-slate-500">Kepala Unit</p>
                      <p className="font-medium text-slate-900 mt-0.5 truncate">
                        {master?.headName || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Jumlah Siswa / Guru</p>
                      <p className="font-mono font-medium text-slate-900 mt-0.5 tabular-nums">
                        {master ? `${master.studentCount} / ${master.teacherCount}` : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Capaian Monev</p>
                      <p className="font-mono font-semibold text-emerald-800 mt-0.5 tabular-nums">
                        {agg ? `${agg.monevProgressPct}%` : '-'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">Kondisi Pendidikan Agama:</p>
                    <p className="mt-1 text-slate-600 leading-relaxed">
                      {agg?.religiousConditionSummary ||
                        master?.religiousProgramNote ||
                        'Belum ada ringkasan kondisi pendidikan agama.'}
                    </p>
                  </div>
                  {agg?.keyConstraints && (
                    <div>
                      <p className="font-medium text-amber-800">Kendala Lapangan:</p>
                      <p className="mt-1 text-slate-600 leading-relaxed">
                        {agg.keyConstraints}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </Panel>
          );
        })}
      </div>

      {/* Monev Programs Table */}
      <Panel
        title="Daftar Program Monev Pendidikan Agama"
        meta="Data pelaksanaan Monev yang dilaporkan oleh unit (read-only bagi Komite)"
      >
        {monevPrograms.length === 0 ? (
          <EmptyState
            title="Belum Ada Program Monev Tercatat"
            description="Belum terdapat laporan program Monev Pendidikan Agama untuk filter unit dan periode yang dipilih."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Unit</th>
                  <th className="py-2.5 px-3 font-medium">Program Monev</th>
                  <th className="py-2.5 px-3 font-medium">Jadwal &amp; PIC</th>
                  <th className="py-2.5 px-3 font-medium text-right">Capaian</th>
                  <th className="py-2.5 pl-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monevPrograms.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-3 font-medium text-slate-900">{p.unitCode}</td>
                    <td className="py-3 px-3">
                      <p className="font-medium text-slate-900">{p.title}</p>
                      <p className="text-slate-500 mt-0.5">{p.description}</p>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {p.schedule} · {p.picName}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                      {p.completionPct}%
                    </td>
                    <td className="py-3 pl-3 text-slate-700 font-medium">{p.status}</td>
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
