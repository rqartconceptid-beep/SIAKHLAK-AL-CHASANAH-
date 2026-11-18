import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  AKHLAK_31_INDICATORS,
  AcademicPeriod,
  AcademicYearDoc,
  CommitteeMemberProfile,
  FoundationAdminProfile,
  getScoreValue,
  GuardianProfile,
  MutabaahLog,
  normalizeEducationLevel,
  normalizeRole,
  Student,
  StudentAssessment,
  StudentGuardian,
  StudentParentMenuKey,
  Teacher,
  UserProfile,
} from '../../types/siakhlak';
import { EmptyState, Panel, RestrictedNotice, SectionHeader } from '../ui/Primitives';
import { MyProfileView } from '../profile/MyProfileView';
import { FoundationBrand, FoundationReportHeader } from '../branding/FoundationBrand';
import { resolveAssessmentInstrument } from '../../utils/instrumentResolver';

export function StudentParentPortal({
  profile,
  activeMenu,
  students,
  verifiedGuardians = [],
  assessments,
  mutabaahLogs,
  periods,
  academicYears = [],
  ownDocs = {},
}: {
  profile: UserProfile;
  activeMenu: StudentParentMenuKey;
  students: Student[];
  verifiedGuardians?: StudentGuardian[];
  assessments: StudentAssessment[];
  mutabaahLogs: MutabaahLog[];
  periods: AcademicPeriod[];
  academicYears?: AcademicYearDoc[];
  ownDocs?: {
    student?: Student | null;
    guardian?: GuardianProfile | null;
    teacher?: Teacher | null;
    committee?: CommitteeMemberProfile | null;
    foundationAdmin?: FoundationAdminProfile | null;
  };
}) {
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');

  const canonicalRole = normalizeRole(profile.role);
  const isParent = canonicalRole === 'PARENT';
  const isStudent = canonicalRole === 'STUDENT';

  // Strictly enforce verified relationship isolation:
  // Parents can ONLY view students connected through verified student_guardians links (verification_status === 'verified').
  // Unverified links, linkedStudentIds, or guardianUids arrays alone never grant parent access.
  const linkedStudents = useMemo(() => {
    const allowedIds = new Set(profile.linkedStudentIds || []);
    const verifiedStudentIds = new Set(
      verifiedGuardians
        .filter(
          (g) => g.guardian_uid === profile.uid && g.verification_status === 'verified'
        )
        .map((g) => g.student_id)
    );

    return students.filter((s) => {
      if (isParent) {
        return verifiedStudentIds.has(s.id);
      }
      return (
        allowedIds.has(s.id) ||
        s.studentUid === profile.uid ||
        s.student_uid === profile.uid
      );
    });
  }, [students, verifiedGuardians, profile.linkedStudentIds, profile.uid, isParent]);

  const activeStudent =
    linkedStudents.find((s) => s.id === selectedStudentId) || linkedStudents[0] || null;

  // Strictly published assessments for activeStudent — accessible to verified PARENTS ONLY (never STUDENT)
  const publishedAssessments = useMemo(() => {
    if (!isParent || !activeStudent) return [];
    return assessments.filter(
      (a) =>
        a.studentId === activeStudent.id &&
        a.isPublishedToParents === true
    );
  }, [isParent, assessments, activeStudent]);

  const activeAssessment = isParent
    ? publishedAssessments.find((a) => !selectedPeriodId || a.periodId === selectedPeriodId) ||
      publishedAssessments[0] ||
      null
    : null;

  const studentMutabaah = useMemo(() => {
    if (!activeStudent) return [];
    return mutabaahLogs.filter(
      (m) =>
        m.studentId === activeStudent.id &&
        m.isPublishedToParents === true
    );
  }, [mutabaahLogs, activeStudent]);

  if (activeMenu === 'siswa_profil') {
    return (
      <MyProfileView
        profile={profile}
        ownDocs={ownDocs}
        linkedStudents={linkedStudents}
        verifiedGuardians={verifiedGuardians}
      />
    );
  }

  if (isStudent && (activeMenu === 'siswa_akhlak' || activeMenu === 'siswa_riwayat')) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Akses Laporan Penilaian Dibatasi"
          subtitle="Portal Siswa hanya menampilkan profil pribadi, identitas kelas/tahun ajaran, dan catatan Mutaba’ah."
        />
        <RestrictedNotice
          title="Laporan Penilaian 31 Indikator Khusus Orang Tua / Wali Murid"
          message="Hasil penilaian Akhlakul Karimah 31 indikator, nilai akhir, dan riwayat perkembangan hanya dapat diakses oleh Orang Tua / Wali Murid melalui Portal Orang Tua."
        />
      </div>
    );
  }

  if (linkedStudents.length === 0) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title={isParent ? 'Dashboard Orang Tua / Wali Murid' : 'Dashboard Siswa'}
          subtitle={
            isParent
              ? 'Portal pemantauan perkembangan Akhlakul Karimah dan Mutaba’ah anak yang memiliki relasi wali terverifikasi.'
              : 'Portal informasi profil siswa, identitas kelas/tahun ajaran, dan catatan Mutaba’ah.'
          }
        />
        <RestrictedNotice
          title="Akun Belum Terhubung dengan Data Siswa Terverifikasi"
          message="Untuk menjaga kerahasiaan data, akun Siswa maupun Orang Tua hanya dapat melihat data siswa yang memiliki relasi terverifikasi. Hubungi Admin Yayasan untuk menautkan akun Anda dengan NIS siswa terkait."
        />
      </div>
    );
  }

  const activeStudentLevelLabel = activeStudent
    ? normalizeEducationLevel(activeStudent.education_level || activeStudent.unitCode) === 'TK'
      ? activeStudent.education_unit_id && activeStudent.education_unit_id !== 'TK'
        ? `KB/TK (${activeStudent.education_unit_id})`
        : 'KB/TK'
      : normalizeEducationLevel(activeStudent.education_level || activeStudent.unitCode)
    : '-';

  const activePeriodLabel =
    periods.find((p) => p.id === (selectedPeriodId || activeAssessment?.periodId))?.name ||
    'Semua / Periode Terbaru';

  return (
    <div className="space-y-6">
      <FoundationBrand
        variant="dashboardBanner"
        contextLabel={isParent ? 'Portal Orang Tua / Wali Murid' : 'Portal Siswa'}
      />
      {isParent && (
        <FoundationReportHeader
          reportTitle={
            activeMenu === 'siswa_mutabaah'
              ? 'LAPORAN MUTABA’AH SISWA'
              : activeMenu === 'siswa_riwayat'
              ? 'LAPORAN RIWAYAT PERKEMBANGAN AKHLAKUL KARIMAH'
              : 'LAPORAN PENILAIAN & PERKEMBANGAN AKHLAKUL KARIMAH SISWA'
          }
          subtitle="Laporan resmi perkembangan pembinaan Akhlakul Karimah dan Mutaba’ah siswa yang telah dipublikasikan."
          periodLabel={activePeriodLabel}
          unitLabel={`${activeStudentLevelLabel} · Kelas ${activeStudent.className}`}
          metaItems={[
            { label: 'Nama Siswa', value: activeStudent.name },
            { label: 'NIS', value: activeStudent.nis },
            { label: 'Jenjang / Kelas', value: `${activeStudentLevelLabel} · ${activeStudent.className}` },
            {
              label: 'Capaian Akhlak',
              value:
                activeAssessment && activeAssessment.averageScore !== null
                  ? `${activeAssessment.averageScore}%`
                  : 'Belum dirilis',
            },
          ]}
        />
      )}
      <SectionHeader
        title={
          activeMenu === 'siswa_dashboard'
            ? isParent
              ? 'Dashboard Orang Tua / Wali Murid'
              : 'Dashboard Siswa'
            : activeMenu === 'siswa_akhlak'
            ? 'Perkembangan Penilaian Akhlakul Karimah'
            : activeMenu === 'siswa_mutabaah'
            ? 'Informasi & Catatan Mutaba’ah'
            : 'Riwayat Perkembangan Lintas Periode'
        }
        subtitle={
          isParent
            ? 'Menampilkan data perkembangan anak yang memiliki relasi wali terverifikasi dan telah dipublikasikan oleh sekolah.'
            : 'Menampilkan informasi profil, kelas, tahun ajaran, dan catatan Mutaba’ah milik Anda.'
        }
        action={
          isParent ? (
            <div className="flex flex-wrap items-center gap-2">
              {linkedStudents.length > 1 && (
                <select
                  value={activeStudent?.id || ''}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  aria-label="Pilih Anak"
                  className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900"
                >
                  {linkedStudents.map((s) => {
                    const lvl = normalizeEducationLevel(s.education_level || s.unitCode);
                    const lvlLabel =
                      lvl === 'TK'
                        ? s.education_unit_id && s.education_unit_id !== 'TK'
                          ? `KB/TK (${s.education_unit_id})`
                          : 'KB/TK'
                        : lvl;
                    const yrName =
                      academicYears.find((y) => y.id === s.academic_year_id)?.yearName ||
                      s.academic_year_id ||
                      '-';
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name} ({lvlLabel} · {yrName} · {s.className})
                      </option>
                    );
                  })}
                </select>
              )}
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                aria-label="Filter Periode"
                className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-900 no-print"
              >
                <option value="">Periode Terbaru</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => window.print()}
                className="no-print inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-emerald-800 bg-white hover:bg-emerald-50 text-emerald-900 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak / Export PDF</span>
              </button>
            </div>
          ) : undefined
        }
      />

      {activeStudent && (
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${
            isParent ? 'xl:grid-cols-4' : ''
          } gap-4`}
        >
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500">Identitas Siswa</p>
            <p className="mt-1.5 text-sm font-semibold text-slate-900 truncate">
              {activeStudent.name}
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono">
              NIS: {activeStudent.nis} ·{' '}
              {normalizeEducationLevel(activeStudent.education_level || activeStudent.unitCode) === 'TK'
                ? activeStudent.education_unit_id && activeStudent.education_unit_id !== 'TK'
                  ? `KB/TK (${activeStudent.education_unit_id})`
                  : 'KB/TK'
                : normalizeEducationLevel(activeStudent.education_level || activeStudent.unitCode)}{' '}
              · {activeStudent.className}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 font-mono">
              TA:{' '}
              {academicYears.find((y) => y.id === activeStudent.academic_year_id)?.yearName ||
                activeStudent.academic_year_id ||
                'Belum ditetapkan'}
            </p>
          </div>

          {isParent && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-medium text-slate-500">Capaian Akhlak (Dipublikasikan)</p>
              <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {activeAssessment && activeAssessment.averageScore !== null
                  ? `${activeAssessment.averageScore}%`
                  : 'Belum tersedia'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {activeAssessment
                  ? `Status: ${activeAssessment.verificationStatus}`
                  : 'Menunggu rilis penilaian guru'}
              </p>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500">Catatan Mutaba’ah</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {studentMutabaah.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">Entri Mutaba’ah diizinkan tampil</p>
          </div>

          {isParent && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-medium text-slate-500">Laporan Tersedia</p>
              <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {publishedAssessments.length}
              </p>
              <p className="mt-1 text-xs text-slate-500">Periode penilaian dirilis</p>
            </div>
          )}
        </div>
      )}

      {isParent && (activeMenu === 'siswa_dashboard' || activeMenu === 'siswa_akhlak') && (
        <Panel
          title="Hasil Penilaian 31 Indikator Akhlakul Karimah (Yang Dipublikasikan)"
          meta="Skala 1 (Belum Berkembang) s.d. 4 (Membudaya). Indikator kosong tampil sebagai Belum Dinilai."
        >
          {!activeAssessment ? (
            <EmptyState
              title="Belum Ada Laporan Penilaian yang Dirilis"
              description="Penilaian Akhlakul Karimah baru akan muncul setelah diinput guru, diverifikasi, dan diizinkan untuk ditampilkan kepada orang tua / wali murid."
            />
          ) : (
            <div className="space-y-4">
              {activeAssessment.teacherNotes && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">Catatan Guru / Wali Kelas: </span>
                  {activeAssessment.teacherNotes}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3 font-medium w-14">Kode</th>
                      <th className="py-2 px-3 font-medium">Indikator Akhlakul Karimah</th>
                      <th className="py-2 px-3 font-medium">Ranah</th>
                      <th className="py-2 pl-3 font-medium text-right">Nilai (1–4)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const resolved = resolveAssessmentInstrument(activeAssessment.instrumentVersion, {
                        allowHistoricalFallback: true,
                      });
                      const displayIndicators = resolved.instrument?.indicators || AKHLAK_31_INDICATORS;
                      return displayIndicators.map((ind) => {
                        const val = getScoreValue(activeAssessment.scores, ind);
                        return (
                          <tr key={ind.code}>
                            <td className="py-2 pr-3 font-mono text-slate-500">{ind.excelCode}</td>
                            <td className="py-2 px-3 font-medium text-slate-900">{ind.title}</td>
                            <td className="py-2 px-3 text-slate-600">{ind.domain}</td>
                            <td className="py-2 pl-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {val !== null ? val : <span className="text-slate-400 font-normal">Belum dinilai</span>}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Panel>
      )}

      {(activeMenu === 'siswa_dashboard' || activeMenu === 'siswa_mutabaah') && (
        <Panel
          title="Catatan Mutaba’ah"
          meta="Aktivitas ibadah harian dan pembiasaan yang dicatat dan dirilis oleh sekolah"
        >
          {studentMutabaah.length === 0 ? (
            <EmptyState
              title="Belum Ada Catatan Mutaba’ah"
              description="Belum ada entri Mutaba’ah yang dirilis untuk siswa ini."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Tanggal</th>
                    <th className="py-2 px-3 font-medium text-right">Sholat Wajib</th>
                    <th className="py-2 px-3 font-medium text-right">Tilawah (Hal)</th>
                    <th className="py-2 px-3 font-medium">Dzikir</th>
                    <th className="py-2 px-3 font-medium">Infaq</th>
                    <th className="py-2 pl-3 font-medium">Catatan Adab</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentMutabaah.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 pr-3 font-mono text-slate-700">{m.logDate}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">{m.sholatWajibCount} / 5</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">{m.tilawahPages}</td>
                      <td className="py-2 px-3 text-slate-700">{m.dzikirCompleted ? 'Terlaksana' : 'Belum'}</td>
                      <td className="py-2 px-3 text-slate-700">{m.infaqDone ? 'Ya' : 'Tidak'}</td>
                      <td className="py-2 pl-3 text-slate-600">{m.adabNotes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {isParent && (activeMenu === 'siswa_dashboard' || activeMenu === 'siswa_riwayat') && (
        <Panel
          title="Riwayat Perkembangan Antarperiode"
          meta="Rekam jejak laporan penilaian yang telah diizinkan tampil"
        >
          {publishedAssessments.length === 0 ? (
            <EmptyState
              title="Belum Ada Riwayat Penilaian"
              description="Riwayat perkembangan lintas periode akan muncul seiring rilis penilaian tiap semester."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Periode</th>
                    <th className="py-2 px-3 font-medium">Kelas</th>
                    <th className="py-2 px-3 font-medium text-right">Capaian (%)</th>
                    <th className="py-2 px-3 font-medium">Verifikasi</th>
                    <th className="py-2 pl-3 font-medium">Catatan Guru</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {publishedAssessments.map((a) => {
                    const pName =
                      periods.find((p) => p.id === a.periodId)?.name || a.periodId;
                    return (
                      <tr key={a.id}>
                        <td className="py-2.5 pr-3 font-medium text-slate-900">{pName}</td>
                        <td className="py-2.5 px-3 text-slate-600">{a.unitCode} · {a.className}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                          {a.averageScore !== null ? `${a.averageScore}%` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{a.verificationStatus}</td>
                        <td className="py-2.5 pl-3 text-slate-600">{a.teacherNotes || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
