import React, { useState } from 'react';
import {
  AcademicPeriod,
  ALL_PERMISSIONS,
  ClassAssignment,
  defaultPermissionsForRole,
  EDUCATION_UNITS,
  isAccountActive,
  isFoundationOrSuperAdmin,
  normalizeAccountStatus,
  normalizeEducationLevel,
  normalizeRole,
  PermissionKey,
  SchoolClass,
  Student,
  StudentGuardian,
  SystemConfig,
  UserPermissionsDoc,
  UserProfile,
} from '../../types/siakhlak';
import {
  createTeacherClassAssignment,
  createVerifiedGuardianRelation,
  PRIVILEGED_MUTATION_DISABLED_MESSAGE,
  saveSystemConfig,
  toggleClassAssignmentStatus,
} from '../../services/siakhlakService';
import { EmptyState, Panel, RestrictedNotice, SectionHeader } from '../ui/Primitives';
import { FOUNDATION_BRAND } from '../branding/FoundationBrand';

export function CoreSystemSettings({
  profile,
  systemConfig,
  periods,
  classes,
  students,
  users,
  userPermissionsList = [],
  classAssignments = [],
  studentGuardians = [],
}: {
  profile: UserProfile;
  systemConfig: SystemConfig | null;
  periods: AcademicPeriod[];
  classes: SchoolClass[];
  students: Student[];
  users: UserProfile[];
  userPermissionsList?: UserPermissionsDoc[];
  classAssignments?: ClassAssignment[];
  studentGuardians?: StudentGuardian[];
}) {
  const [foundationName, setFoundationName] = useState(
    systemConfig?.foundationName || FOUNDATION_BRAND.foundationDisplayName
  );
  const [activePeriodId, setActivePeriodId] = useState(
    systemConfig?.activePeriodId || periods[0]?.id || ''
  );
  const [komiteScope, setKomiteScope] = useState(
    systemConfig?.komiteDefaultScope || 'Seluruh Unit (TK, SD, SMP, SMA, SMK)'
  );
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingUid] = useState<string | null>(null);
  const [expandedPermUid, setExpandedPermUid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Class Assignment Form
  const [assignTeacherUid, setAssignTeacherUid] = useState('');
  const [assignClassId, setAssignClassId] = useState('');
  const [assignPeriodId, setAssignPeriodId] = useState(
    systemConfig?.activePeriodId || periods[0]?.id || ''
  );
  const [assignHomeroom, setAssignHomeroom] = useState(true);
  const [savingAssignment, setSavingAssignment] = useState(false);

  // Student Guardian Form
  const [guardianStudentId, setGuardianStudentId] = useState('');
  const [guardianUserUid, setGuardianUserUid] = useState('');
  const [guardianRelType, setGuardianRelType] = useState<'ayah' | 'ibu' | 'wali'>('ayah');
  const [guardianVerStatus, setGuardianVerStatus] = useState<'verified' | 'pending' | 'rejected'>('verified');
  const [savingGuardian, setSavingGuardian] = useState(false);

  if (!isFoundationOrSuperAdmin(profile.role)) {
    return (
      <RestrictedNotice
        title="Pengaturan Sistem Hanya untuk Admin Yayasan & Super Admin"
        message="Komite Pendidikan Agama, Guru, Wali Kelas, Siswa, dan Orang Tua tidak dapat mengakses konfigurasi sistem, manajemen akun, role, maupun permission."
      />
    );
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const pName = periods.find((p) => p.id === activePeriodId)?.name || 'Belum Dipilih';
      await saveSystemConfig({
        foundationName,
        activePeriodId,
        activePeriodName: pName,
        komiteDefaultScope: komiteScope,
      });
      setSuccessMsg('Konfigurasi sistem Yayasan berhasil disimpan.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi.');
    } finally {
      setSavingConfig(false);
    }
  };

  const getUserEffectivePermissions = (u: UserProfile): PermissionKey[] => {
    const doc = userPermissionsList.find((p) => p.uid === u.uid);
    if (doc?.permissions && doc.permissions.length > 0) return doc.permissions;
    if (u.permissions && u.permissions.length > 0) return u.permissions;
    return defaultPermissionsForRole(normalizeRole(u.role));
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    const cls = classes.find((c) => c.id === assignClassId);
    const chosenPeriod = assignPeriodId || periods[0]?.id || 'DEFAULT';
    if (!assignTeacherUid || !cls) {
      setErrorMsg('Pilih akun Guru/Wali Kelas dan Kelas terlebih dahulu.');
      return;
    }
    setSavingAssignment(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await createTeacherClassAssignment(
        {
          teacher_uid: assignTeacherUid,
          class_id: cls.id,
          education_unit_id: cls.unitCode,
          academic_year_id: chosenPeriod,
          is_homeroom: assignHomeroom,
        },
        profile
      );
      setSuccessMsg(`Penugasan kelas ${cls.unitCode} · ${cls.name} berhasil disimpan.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan penugasan kelas.');
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleCreateGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guardianStudentId || !guardianUserUid) {
      setErrorMsg('Pilih siswa dan akun orang tua/wali terlebih dahulu.');
      return;
    }
    setSavingGuardian(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await createVerifiedGuardianRelation(
        {
          student_id: guardianStudentId,
          guardian_uid: guardianUserUid,
          relationship_type: guardianRelType,
          verification_status: guardianVerStatus,
        },
        profile
      );
      setSuccessMsg('Relasi wali-siswa berhasil disimpan & diaudit.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan relasi wali-siswa.');
    } finally {
      setSavingGuardian(false);
    }
  };

  const teacherUsers = users.filter((u) => {
    const r = normalizeRole(u.role);
    return r === 'TEACHER' || r === 'HOMEROOM_TEACHER';
  });

  const parentUsers = users.filter((u) => normalizeRole(u.role) === 'PARENT');

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Pengaturan Sistem, Manajemen Akun, Role & Permission"
        subtitle="Kendali penuh Admin Yayasan: konfigurasi periode, status akun, 6 role resmi, permission matrix, penugasan kelas guru, dan relasi wali-siswa terverifikasi."
      />

      {errorMsg && (
        <div className="p-3 border border-red-300 bg-red-50 rounded-md text-xs text-red-800">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-3 border border-emerald-300 bg-emerald-50 rounded-md text-xs text-emerald-900">
          {successMsg}
        </div>
      )}

      <Panel title="Konfigurasi Umum Yayasan">
        <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Nama Yayasan *
              </label>
              <input
                type="text"
                required
                value={foundationName}
                onChange={(e) => setFoundationName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Periode Akademik Aktif
              </label>
              <select
                value={activePeriodId}
                onChange={(e) => setActivePeriodId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              >
                <option value="">-- Belum Dipilih --</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Mandat &amp; Ruang Lingkup Default Komite Pendidikan Agama
            </label>
            <input
              type="text"
              required
              value={komiteScope}
              onChange={(e) => setKomiteScope(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
            />
          </div>
          <button
            type="submit"
            disabled={savingConfig}
            className="px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium cursor-pointer"
          >
            {savingConfig ? 'Menyimpan...' : 'Simpan Konfigurasi Sistem'}
          </button>
        </form>
      </Panel>

      <Panel
        title="Manajemen Akun, Role & Permission Matrix (Mode Baca)"
        meta={`${users.length} akun terdaftar pada organisasi yayasan_siakhlak`}
      >
        <div className="mb-4 p-3 border border-amber-300 bg-amber-50 rounded-md text-xs text-amber-900">
          <span className="font-semibold">Kebijakan Keamanan Fase 1: </span>
          {PRIVILEGED_MUTATION_DISABLED_MESSAGE}
        </div>
        {users.length === 0 ? (
          <EmptyState
            title="Belum Ada Pengguna Terdaftar"
            description="Pengguna yang terdaftar pada sistem akan tercatat di sini beserta role, status akun, dan permission efektifnya."
          />
        ) : (
          <div className="divide-y divide-slate-200 text-xs">
            {users.map((u) => {
              const canonical = normalizeRole(u.role);
              const normStatus = normalizeAccountStatus(u.account_status);
              const perms = getUserEffectivePermissions(u);
              const isPermExpanded = expandedPermUid === u.uid;

              return (
                <div key={u.uid} className="py-4 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">
                        {u.full_name || u.displayName}
                      </p>
                      <p className="text-slate-500 font-mono">
                        {u.email} · UID: {u.uid.slice(0, 12)}…
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <select
                        value={canonical}
                        disabled
                        aria-label={`Role untuk ${u.email}`}
                        className="px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded-md font-medium text-slate-700 cursor-not-allowed"
                      >
                        <option value="SUPER_ADMIN">SUPER_ADMIN (Super Admin)</option>
                        <option value="FOUNDATION_ADMIN">FOUNDATION_ADMIN (Admin Yayasan)</option>
                        <option value="COMMITTEE_ADMIN">COMMITTEE_ADMIN (Komite Agama)</option>
                        <option value="HOMEROOM_TEACHER">HOMEROOM_TEACHER (Wali Kelas)</option>
                        <option value="TEACHER">TEACHER (Guru PAI / Bidang)</option>
                        <option value="PARENT">PARENT (Orang Tua / Wali)</option>
                        <option value="STUDENT">STUDENT (Siswa)</option>
                      </select>

                      <select
                        value={normStatus}
                        disabled
                        aria-label={`Status akun untuk ${u.email}`}
                        className={`px-2.5 py-1.5 border rounded-md font-mono font-medium cursor-not-allowed ${
                          isAccountActive(u.account_status)
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                            : normStatus === 'PENDING' || normStatus === 'PENDING_VERIFICATION'
                            ? 'bg-amber-50 border-amber-300 text-amber-900'
                            : 'bg-red-50 border-red-300 text-red-800'
                        }`}
                      >
                        <option value="PENDING">PENDING</option>
                        <option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="SUSPENDED">SUSPENDED</option>
                        <option value="REVOKED">REVOKED</option>
                        <option value="INACTIVE">INACTIVE</option>
                        <option value="ARCHIVED">ARCHIVED</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => setExpandedPermUid(isPermExpanded ? null : u.uid)}
                        className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                      >
                        {isPermExpanded
                          ? 'Tutup Permission'
                          : `Permission (${perms.length})`}
                      </button>

                      {canonical === 'COMMITTEE_ADMIN' && (
                        <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-not-allowed">
                          <input
                            type="checkbox"
                            checked={Boolean(u.allowIndividualStudentAccess)}
                            disabled
                            readOnly
                          />
                          <span>Izin Data Siswa Individual</span>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Granular Permission Matrix (Read-Only) */}
                  {isPermExpanded && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                      <p className="font-medium text-slate-800">
                        Granular Permission (user_permissions/{u.uid}) — Read-Only
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {ALL_PERMISSIONS.map((permDef) => {
                          const checked = perms.includes(permDef.key);
                          return (
                            <label
                              key={permDef.key}
                              className="inline-flex items-start gap-2 text-slate-600 cursor-not-allowed"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled
                                readOnly
                                className="mt-0.5"
                              />
                              <span>
                                <span className="font-medium text-slate-900">{permDef.label}</span>
                                <span className="block font-mono text-slate-500">
                                  {permDef.key}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Staff Unit Assignment (Read-Only) */}
                  {(canonical === 'SUPER_ADMIN' ||
                    canonical === 'FOUNDATION_ADMIN' ||
                    canonical === 'COMMITTEE_ADMIN' ||
                    canonical === 'TEACHER' ||
                    canonical === 'HOMEROOM_TEACHER') && (
                    <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2.5 rounded-md border border-slate-200">
                      <span className="font-medium text-slate-700 mr-1">Unit Kewenangan:</span>
                      {EDUCATION_UNITS.map((unit) => {
                        const checked = (u.assignedUnits || []).some(
                          (au) => normalizeEducationLevel(au) === unit
                        );
                        return (
                          <label
                            key={unit}
                            className="inline-flex items-center gap-1 text-slate-600 cursor-not-allowed"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={true || savingUid === u.uid}
                              readOnly
                            />
                            <span>{unit}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Teacher / Homeroom Class Assignment Overview (Read-Only) */}
                  {(canonical === 'TEACHER' || canonical === 'HOMEROOM_TEACHER') &&
                    classes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2.5 rounded-md border border-slate-200">
                        <span className="font-medium text-slate-700 mr-1">
                          Kelas Penugasan:
                        </span>
                        {classes.map((c) => {
                          const checked = (u.assignedClassIds || []).includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className="inline-flex items-center gap-1 text-slate-600 cursor-not-allowed"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled
                                readOnly
                              />
                              <span>
                                {c.unitCode} · {c.name}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                  {/* Student / Parent Verified Student Link Overview (Read-Only) */}
                  {(canonical === 'STUDENT' || canonical === 'PARENT') && (
                    <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2.5 rounded-md border border-slate-200">
                      <span className="font-medium text-slate-700 mr-1">
                        Tautan Siswa:
                      </span>
                      {students.length === 0 ? (
                        <span className="text-slate-500">Belum ada data master siswa.</span>
                      ) : (
                        students.map((s) => {
                          const checked = (u.linkedStudentIds || []).includes(s.id);
                          return (
                            <label
                              key={s.id}
                              className="inline-flex items-center gap-1 text-slate-600 cursor-not-allowed"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled
                                readOnly
                              />
                              <span>
                                {s.name} ({s.nis})
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Formal Class Assignments (class_assignments) */}
      <Panel
        title="Penugasan Guru & Wali Kelas (class_assignments)"
        meta={`${classAssignments.length} penugasan tercatat`}
      >
        <div className="space-y-4 text-xs">
          <form onSubmit={handleCreateAssignment} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Akun Guru / Wali Kelas *</label>
              <select
                required
                value={assignTeacherUid}
                onChange={(e) => setAssignTeacherUid(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              >
                <option value="">-- Pilih Guru --</option>
                {teacherUsers.map((t) => (
                  <option key={t.uid} value={t.uid}>
                    {t.full_name} ({normalizeRole(t.role)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Kelas *</label>
              <select
                required
                value={assignClassId}
                onChange={(e) => setAssignClassId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              >
                <option value="">-- Pilih Kelas --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.unitCode} · {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Periode Akademik *</label>
              <select
                value={assignPeriodId || periods[0]?.id || ''}
                onChange={(e) => setAssignPeriodId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignHomeroom}
                  onChange={(e) => setAssignHomeroom(e.target.checked)}
                />
                <span>Wali Kelas</span>
              </label>
              <button
                type="submit"
                disabled={savingAssignment || teacherUsers.length === 0 || classes.length === 0}
                className="px-3.5 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium disabled:opacity-50 cursor-pointer"
              >
                {savingAssignment ? 'Menyimpan...' : 'Tetapkan'}
              </button>
            </div>
          </form>

          {classAssignments.length > 0 && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md px-3">
              {classAssignments.map((ca) => {
                const tUser = users.find((u) => u.uid === ca.teacher_uid);
                const cls = classes.find((c) => c.id === ca.class_id);
                return (
                  <div key={ca.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {tUser?.full_name || ca.teacher_uid} → {ca.education_unit_id} · {cls?.name || ca.class_id}
                      </p>
                      <p className="text-slate-500 font-mono">
                        {ca.is_homeroom ? 'Wali Kelas' : 'Guru Bidang'} · Status: {ca.assignment_status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        toggleClassAssignmentStatus(
                          ca.id,
                          ca.assignment_status === 'active' ? 'inactive' : 'active',
                          profile
                        )
                      }
                      className="text-emerald-800 font-medium hover:underline cursor-pointer"
                    >
                      {ca.assignment_status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Panel>

      {/* Formal Verified Guardian Relations (student_guardians) */}
      <Panel
        title="Relasi Wali-Siswa Terverifikasi (student_guardians)"
        meta={`${studentGuardians.length} relasi wali tercatat`}
      >
        <div className="space-y-4 text-xs">
          <form onSubmit={handleCreateGuardian} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Akun Orang Tua / Wali *</label>
              <select
                required
                value={guardianUserUid}
                onChange={(e) => setGuardianUserUid(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              >
                <option value="">-- Pilih Akun PARENT --</option>
                {parentUsers.map((p) => (
                  <option key={p.uid} value={p.uid}>
                    {p.full_name} ({p.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Siswa *</label>
              <select
                required
                value={guardianStudentId}
                onChange={(e) => setGuardianStudentId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              >
                <option value="">-- Pilih Siswa --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nis} — {s.name} ({s.unitCode})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Hubungan &amp; Status *</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={guardianRelType}
                  onChange={(e) => setGuardianRelType(e.target.value as 'ayah' | 'ibu' | 'wali')}
                  className="px-2.5 py-2 bg-white border border-slate-300 rounded-md"
                >
                  <option value="ayah">Ayah</option>
                  <option value="ibu">Ibu</option>
                  <option value="wali">Wali</option>
                </select>
                <select
                  value={guardianVerStatus}
                  onChange={(e) =>
                    setGuardianVerStatus(e.target.value as 'verified' | 'pending' | 'rejected')
                  }
                  className="px-2.5 py-2 bg-white border border-slate-300 rounded-md"
                >
                  <option value="verified">verified</option>
                  <option value="pending">pending</option>
                  <option value="rejected">rejected</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={savingGuardian || parentUsers.length === 0 || students.length === 0}
              className="px-3.5 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium disabled:opacity-50 cursor-pointer"
            >
              {savingGuardian ? 'Menyimpan...' : 'Simpan Relasi Wali'}
            </button>
          </form>

          {studentGuardians.length > 0 && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md px-3">
              {studentGuardians.map((sg) => {
                const pUser = users.find((u) => u.uid === sg.guardian_uid);
                const stu = students.find((s) => s.id === sg.student_id);
                return (
                  <div key={sg.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {pUser?.full_name || sg.guardian_uid} → {stu ? `${stu.name} (${stu.nis})` : sg.student_id}
                      </p>
                      <p className="text-slate-500 font-mono">
                        Hubungan: {sg.relationship_type} · Status: {sg.verification_status}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
