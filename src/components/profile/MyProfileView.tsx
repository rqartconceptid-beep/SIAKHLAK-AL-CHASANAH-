import React, { useEffect, useRef, useState } from 'react';
import { Lock, Save, ShieldCheck } from 'lucide-react';
import {
  ClassAssignment,
  CommitteeMemberProfile,
  EDUCATION_LEVEL_LABELS,
  FoundationAdminProfile,
  GuardianProfile,
  isFoundationOrSuperAdmin,
  normalizeEducationLevel,
  normalizeRole,
  roleLabel,
  SchoolClass,
  Student,
  StudentGuardian,
  Teacher,
  UserProfile,
} from '../../types/siakhlak';
import { updateMyProfile } from '../../services/siakhlakService';
import { Panel, SectionHeader } from '../ui/Primitives';
import { FoundationBrand } from '../branding/FoundationBrand';

export function MyProfileView({
  profile,
  ownDocs,
  linkedStudents = [],
  verifiedGuardians = [],
  classAssignments = [],
  classes = [],
}: {
  profile: UserProfile;
  ownDocs: {
    student?: Student | null;
    guardian?: GuardianProfile | null;
    teacher?: Teacher | null;
    committee?: CommitteeMemberProfile | null;
    foundationAdmin?: FoundationAdminProfile | null;
  };
  linkedStudents?: Student[];
  verifiedGuardians?: StudentGuardian[];
  classAssignments?: ClassAssignment[];
  classes?: SchoolClass[];
}) {
  const canonicalRole = normalizeRole(profile.role);

  const entityDocId =
    canonicalRole === 'STUDENT'
      ? ownDocs.student?.id || linkedStudents[0]?.id
      : canonicalRole === 'PARENT'
      ? ownDocs.guardian?.id
      : canonicalRole === 'TEACHER' || canonicalRole === 'HOMEROOM_TEACHER'
      ? ownDocs.teacher?.id
      : canonicalRole === 'COMMITTEE_ADMIN'
      ? ownDocs.committee?.id
      : ownDocs.foundationAdmin?.id;

  const initialAddress =
    ownDocs.student?.address ||
    ownDocs.guardian?.address ||
    ownDocs.teacher?.address ||
    '';

  const [fullName, setFullName] = useState(profile.full_name || profile.displayName || '');
  const [phone, setPhone] = useState(
    profile.phone ||
      ownDocs.student?.phone ||
      ownDocs.guardian?.phone ||
      ownDocs.teacher?.phone ||
      ownDocs.committee?.phone ||
      ownDocs.foundationAdmin?.phone ||
      ''
  );
  const [address, setAddress] = useState(initialAddress);
  const [profilePhoto, setProfilePhoto] = useState(profile.profile_photo || '');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (dirtyRef.current) return;
    setFullName(profile.full_name || profile.displayName || '');
    setPhone(
      profile.phone ||
        ownDocs.student?.phone ||
        ownDocs.guardian?.phone ||
        ownDocs.teacher?.phone ||
        ownDocs.committee?.phone ||
        ownDocs.foundationAdmin?.phone ||
        ''
    );
    setAddress(
      ownDocs.student?.address ||
        ownDocs.guardian?.address ||
        ownDocs.teacher?.address ||
        ''
    );
    setProfilePhoto(profile.profile_photo || '');
  }, [profile, ownDocs]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      await updateMyProfile(profile.uid, canonicalRole, {
        full_name: fullName,
        phone,
        address,
        profile_photo: profilePhoto,
        linkedEntityDocId: entityDocId,
      });
      setSuccessMsg('Perubahan informasi personal pada Profil Saya berhasil disimpan.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui profil.');
    } finally {
      setSaving(false);
    }
  };

  const primaryStudent = ownDocs.student || linkedStudents[0] || null;

  return (
    <div className="space-y-6">
      <FoundationBrand variant="profile" />
      <SectionHeader
        title="Profil Saya"
        subtitle="Informasi identitas akun terverifikasi, metadata kelembagaan resmi, dan pembaruan kontak pribadi yang diizinkan."
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Locked Official Institutional Identity */}
        <div className="lg:col-span-2 space-y-6">
          <Panel
            title="Status Akun &amp; Kewenangan Resmi (Terkunci)"
            meta="Hanya dapat diubah oleh Admin Yayasan"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-slate-500">Email Google Terdaftar</p>
                <p className="mt-1 font-mono text-slate-900">{profile.email}</p>
              </div>
              <div>
                <p className="text-slate-500">Peran Sistem (Role)</p>
                <p className="mt-1 font-semibold text-slate-900 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{roleLabel(canonicalRole)}</span>
                </p>
              </div>
              <div>
                <p className="text-slate-500">Status Akun &amp; Verifikasi Profil</p>
                <p className="mt-1 font-mono text-emerald-800 font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    {profile.account_status} · {profile.profile_status || 'VERIFIED'}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-slate-500">Organisasi</p>
                <p className="mt-1 font-mono text-slate-900">{profile.organization_id}</p>
              </div>
            </div>
          </Panel>

          {/* Role-Specific Official Metadata */}
          {canonicalRole === 'STUDENT' && (
            <Panel
              title="Data Pendidikan Resmi Siswa (Terkunci)"
              meta="Unit, Angkatan & Kelas dikelola terpusat oleh Admin Yayasan"
            >
              {!primaryStudent ? (
                <p className="text-xs text-slate-600">
                  Data induk siswa belum tertaut dengan akun ini. Hubungi Admin Yayasan.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="text-slate-500">NIS / NISN</p>
                    <p className="mt-1 font-mono font-semibold text-slate-900">
                      {primaryStudent.nis}
                      {primaryStudent.nisn ? ` · ${primaryStudent.nisn}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Jenjang Pendidikan</p>
                    <p className="mt-1 font-medium text-slate-900">
                      {EDUCATION_LEVEL_LABELS[normalizeEducationLevel(primaryStudent.unitCode)]}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Angkatan / Tahun Masuk</p>
                    <p className="mt-1 font-mono text-slate-900">
                      {primaryStudent.cohort_id || primaryStudent.admission_year || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Kelas Aktif</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {primaryStudent.className || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Status Peserta Didik</p>
                    <p className="mt-1 font-mono text-slate-900">
                      {primaryStudent.status || 'ACTIVE'}
                    </p>
                  </div>
                </div>
              )}
            </Panel>
          )}

          {canonicalRole === 'PARENT' && (
            <Panel
              title="Daftar Anak Terverifikasi (Terkunci)"
              meta={`${linkedStudents.length} relasi wali terverifikasi`}
            >
              {linkedStudents.length === 0 ? (
                <p className="text-xs text-slate-600">
                  Belum ada data anak dengan relasi wali terverifikasi pada akun ini.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {linkedStudents.map((stu) => {
                    const rel = verifiedGuardians.find((g) => g.student_id === stu.id);
                    return (
                      <div
                        key={stu.id}
                        className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{stu.name}</p>
                          <p className="font-mono text-slate-500">
                            NIS: {stu.nis} · {normalizeEducationLevel(stu.unitCode)} · Kelas{' '}
                            {stu.className}
                          </p>
                        </div>
                        <span className="font-mono text-emerald-800 font-medium">
                          {rel
                            ? `${rel.relationship_type.toUpperCase()} (${rel.verification_status})`
                            : 'TERVERIFIKASI'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          )}

          {(canonicalRole === 'TEACHER' || canonicalRole === 'HOMEROOM_TEACHER') && (
            <Panel
              title="Profil Kepegawaian &amp; Penugasan Guru (Terkunci)"
              meta="Penetapan unit, jabatan, dan kelas penugasan oleh Admin Yayasan"
            >
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-slate-500">NIP / NIY</p>
                    <p className="mt-1 font-mono font-semibold text-slate-900">
                      {ownDocs.teacher?.nip || ownDocs.teacher?.employee_number || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Unit Kewenangan</p>
                    <p className="mt-1 font-mono text-slate-900">
                      {profile.assignedUnits.length > 0
                        ? profile.assignedUnits.join(', ')
                        : ownDocs.teacher?.unitCode || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Status Kepegawaian</p>
                    <p className="mt-1 font-mono text-slate-900">
                      {ownDocs.teacher?.employment_status || 'TETAP'} ·{' '}
                      {ownDocs.teacher?.roleTitle || 'Guru'}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">Kelas Penugasan Aktif</p>
                  {classAssignments.length === 0 && (profile.assignedClassIds || []).length === 0 ? (
                    <p className="text-slate-600">Seluruh kelas pada unit kewenangan.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {classAssignments.map((ca) => {
                        const cls = classes.find((c) => c.id === ca.class_id);
                        return (
                          <span
                            key={ca.id}
                            className="px-2.5 py-1 rounded border border-slate-200 bg-slate-50 font-mono text-slate-800"
                          >
                            {normalizeEducationLevel(ca.education_unit_id)} ·{' '}
                            {cls?.name || ca.class_id}{' '}
                            {ca.is_homeroom ? '(Wali Kelas)' : ''}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          )}

          {canonicalRole === 'COMMITTEE_ADMIN' && (
            <Panel
              title="SK &amp; Masa Tugas Komite Pendidikan Agama (Terkunci)"
              meta="Keanggotaan ditetapkan oleh Yayasan"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-slate-500">Jabatan Komite</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {ownDocs.committee?.committee_position || 'Anggota Komite Pendidikan Agama'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Nomor SK Pengangkatan</p>
                  <p className="mt-1 font-mono text-slate-900">
                    {ownDocs.committee?.appointment_number || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Masa Tugas</p>
                  <p className="mt-1 font-mono text-slate-900">
                    {ownDocs.committee?.term_start || '-'} s.d.{' '}
                    {ownDocs.committee?.term_end || '-'}
                  </p>
                </div>
              </div>
            </Panel>
          )}

          {isFoundationOrSuperAdmin(canonicalRole) && (
            <Panel
              title={
                canonicalRole === 'SUPER_ADMIN'
                  ? 'Jabatan &amp; Divisi Super Admin (Terkunci)'
                  : 'Jabatan &amp; Divisi Admin Yayasan (Terkunci oleh SK)'
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-slate-500">Jabatan</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {ownDocs.foundationAdmin?.position ||
                      (canonicalRole === 'SUPER_ADMIN'
                        ? 'Super Administrator Sistem'
                        : 'Administrator Yayasan')}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Divisi</p>
                  <p className="mt-1 text-slate-900">
                    {ownDocs.foundationAdmin?.division ||
                      (canonicalRole === 'SUPER_ADMIN'
                        ? 'Tata Kelola & Keamanan Sistem'
                        : 'Manajemen Pendidikan Yayasan')}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Nomor SK</p>
                  <p className="mt-1 font-mono text-slate-900">
                    {ownDocs.foundationAdmin?.appointment_number || '-'}
                  </p>
                </div>
              </div>
            </Panel>
          )}
        </div>

        {/* Editable Allowed Personal Fields */}
        <div>
          <Panel
            title="Perbarui Kontak Pribadi"
            meta="Field personal yang diizinkan diedit mandiri"
          >
            <form
              onSubmit={handleSave}
              onChange={() => {
                dirtyRef.current = true;
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nama Lengkap *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nomor Telepon / WhatsApp
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08xxxxxxxxxx"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>

              {(canonicalRole === 'STUDENT' ||
                canonicalRole === 'PARENT' ||
                canonicalRole === 'TEACHER' ||
                canonicalRole === 'HOMEROOM_TEACHER') && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Alamat Domisili
                  </label>
                  <textarea
                    rows={3}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  URL Foto Profil (Opsional)
                </label>
                <input
                  type="url"
                  value={profilePhoto}
                  onChange={(e) => setProfilePhoto(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium disabled:opacity-60 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Menyimpan...' : 'Simpan Profil Saya'}</span>
              </button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
