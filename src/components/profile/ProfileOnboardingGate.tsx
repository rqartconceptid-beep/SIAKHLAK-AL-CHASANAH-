import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  LogOut,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import {
  CommitteeMemberProfile,
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVELS,
  EducationLevel,
  GuardianProfile,
  LoginPortal,
  portalLabel,
  Student,
  Teacher,
  UserProfile,
} from '../../types/siakhlak';
import {
  PendingOnboardingInput,
  submitPendingOnboardingProfile,
} from '../../services/siakhlakService';
import { FoundationBrand } from '../branding/FoundationBrand';

type OnboardingRoleOption = 'STUDENT' | 'PARENT' | 'TEACHER' | 'COMMITTEE_ADMIN';

function defaultOnboardingRoleForPortal(portal: LoginPortal): OnboardingRoleOption {
  if (portal === 'teacher') return 'TEACHER';
  if (portal === 'committee') return 'COMMITTEE_ADMIN';
  return 'STUDENT';
}

export function ProfileOnboardingGate({
  profile,
  selectedPortal,
  ownDocs,
  onSignOut,
}: {
  profile: UserProfile;
  selectedPortal: LoginPortal;
  ownDocs: {
    student?: Student | null;
    guardian?: GuardianProfile | null;
    teacher?: Teacher | null;
    committee?: CommitteeMemberProfile | null;
  };
  onSignOut: () => Promise<void>;
}) {
  const initialRole: OnboardingRoleOption =
    profile.requested_role === 'STUDENT' ||
    profile.requested_role === 'PARENT' ||
    profile.requested_role === 'TEACHER' ||
    profile.requested_role === 'COMMITTEE_ADMIN'
      ? profile.requested_role
      : defaultOnboardingRoleForPortal(profile.requested_portal || selectedPortal);

  const [requestedRole, setRequestedRole] = useState<OnboardingRoleOption>(initialRole);
  const [fullName, setFullName] = useState(
    profile.full_name || profile.displayName || ''
  );
  const [phone, setPhone] = useState(
    profile.phone ||
      ownDocs.student?.phone ||
      ownDocs.guardian?.phone ||
      ownDocs.teacher?.phone ||
      ownDocs.committee?.phone ||
      ''
  );
  const [address, setAddress] = useState(
    ownDocs.student?.address ||
      ownDocs.guardian?.address ||
      ownDocs.teacher?.address ||
      ''
  );

  // Student fields
  const [nis, setNis] = useState(ownDocs.student?.nis || '');
  const [nisn, setNisn] = useState(ownDocs.student?.nisn || '');
  const [birthPlace, setBirthPlace] = useState(ownDocs.student?.birth_place || '');
  const [birthDate, setBirthDate] = useState(ownDocs.student?.birth_date || '');
  const [gender, setGender] = useState<'L' | 'P'>(
    ownDocs.student?.gender || ownDocs.teacher?.gender || 'L'
  );
  const [educationLevel, setEducationLevel] = useState<EducationLevel>(
    ownDocs.student?.education_level || ownDocs.teacher?.education_level || 'SD'
  );
  const [admissionYear, setAdmissionYear] = useState(
    ownDocs.student?.admission_year || String(new Date().getFullYear())
  );
  const [requestedClassName, setRequestedClassName] = useState(
    ownDocs.student?.className || ''
  );

  // Parent fields
  const [relationshipType, setRelationshipType] = useState<'ayah' | 'ibu' | 'wali'>(
    ownDocs.guardian?.relationship_type || 'ayah'
  );
  const [childNis, setChildNis] = useState('');
  const [childName, setChildName] = useState('');

  // Teacher fields
  const [employeeNumber, setEmployeeNumber] = useState(
    ownDocs.teacher?.employee_number || ownDocs.teacher?.nip || ''
  );
  const [position, setPosition] = useState(ownDocs.teacher?.position || 'Guru PAI');
  const [employmentStatus, setEmploymentStatus] = useState<'TETAP' | 'KONTRAK' | 'HONORER'>(
    ownDocs.teacher?.employment_status || 'TETAP'
  );
  const [teachingSubjects, setTeachingSubjects] = useState(
    (ownDocs.teacher?.teaching_subjects || []).join(', ') || 'Pendidikan Agama Islam'
  );
  const [isPaiTeacher, setIsPaiTeacher] = useState(
    ownDocs.teacher?.isPaiTeacher ?? true
  );

  // Committee fields
  const [committeePosition, setCommitteePosition] = useState(
    ownDocs.committee?.committee_position || 'Anggota Komite Pendidikan Agama'
  );
  const [appointmentNumber, setAppointmentNumber] = useState(
    ownDocs.committee?.appointment_number || ''
  );

  const [submitting, setSubmitting] = useState(false);
  const [submittedOk, setSubmittedOk] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (dirtyRef.current) return;
    if (profile.full_name || profile.displayName) {
      setFullName(profile.full_name || profile.displayName || '');
    }
    const hydratedPhone =
      profile.phone ||
      ownDocs.student?.phone ||
      ownDocs.guardian?.phone ||
      ownDocs.teacher?.phone ||
      ownDocs.committee?.phone;
    if (hydratedPhone) setPhone(hydratedPhone);
    const hydratedAddress =
      ownDocs.student?.address ||
      ownDocs.guardian?.address ||
      ownDocs.teacher?.address;
    if (hydratedAddress) setAddress(hydratedAddress);

    if (ownDocs.student) {
      if (ownDocs.student.nis) setNis(ownDocs.student.nis);
      if (ownDocs.student.nisn) setNisn(ownDocs.student.nisn);
      if (ownDocs.student.birth_place) setBirthPlace(ownDocs.student.birth_place);
      if (ownDocs.student.birth_date) setBirthDate(ownDocs.student.birth_date);
      if (ownDocs.student.gender) setGender(ownDocs.student.gender);
      if (ownDocs.student.education_level) setEducationLevel(ownDocs.student.education_level);
      if (ownDocs.student.admission_year) setAdmissionYear(ownDocs.student.admission_year);
      if (ownDocs.student.className) setRequestedClassName(ownDocs.student.className);
    }
    if (ownDocs.guardian?.relationship_type) {
      setRelationshipType(ownDocs.guardian.relationship_type);
    }
    if (ownDocs.teacher) {
      if (ownDocs.teacher.employee_number || ownDocs.teacher.nip) {
        setEmployeeNumber(ownDocs.teacher.employee_number || ownDocs.teacher.nip || '');
      }
      if (ownDocs.teacher.position) setPosition(ownDocs.teacher.position);
      if (ownDocs.teacher.employment_status) {
        setEmploymentStatus(ownDocs.teacher.employment_status);
      }
      if (ownDocs.teacher.teaching_subjects?.length) {
        setTeachingSubjects(ownDocs.teacher.teaching_subjects.join(', '));
      }
      if (typeof ownDocs.teacher.isPaiTeacher === 'boolean') {
        setIsPaiTeacher(ownDocs.teacher.isPaiTeacher);
      }
      if (ownDocs.teacher.gender) setGender(ownDocs.teacher.gender);
      if (ownDocs.teacher.education_level) setEducationLevel(ownDocs.teacher.education_level);
    }
    if (ownDocs.committee) {
      if (ownDocs.committee.committee_position) {
        setCommitteePosition(ownDocs.committee.committee_position);
      }
      if (ownDocs.committee.appointment_number) {
        setAppointmentNumber(ownDocs.committee.appointment_number);
      }
    }
  }, [profile, ownDocs]);

  const hasExistingDraft = Boolean(
    ownDocs.student || ownDocs.guardian || ownDocs.teacher || ownDocs.committee
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSubmittedOk(false);

    const payload: PendingOnboardingInput = {
      portal: selectedPortal,
      requestedRole,
      full_name: fullName,
      phone,
      address,
      nis,
      nisn,
      birth_place: birthPlace,
      birth_date: birthDate,
      gender,
      education_level: educationLevel,
      admission_year: admissionYear,
      requested_class_name: requestedClassName,
      relationship_type: relationshipType,
      child_nis: childNis,
      child_name: childName,
      employee_number: employeeNumber,
      position,
      employment_status: employmentStatus,
      teaching_subjects: teachingSubjects,
      is_pai_teacher: isPaiTeacher,
      committee_position: committeePosition,
      appointment_number: appointmentNumber,
    };

    try {
      await submitPendingOnboardingProfile(profile.uid, profile.email, payload);
      setSubmittedOk(true);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal mengirim pengajuan profil.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white border border-amber-300 border-t-4 border-t-emerald-800 rounded-lg p-6 space-y-4">
          <FoundationBrand variant="portal" className="pb-4 border-b border-slate-200" />
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-amber-800" />
              </div>
              <div>
                <p className="font-mono text-xs font-semibold text-amber-800">
                  STATUS AKUN: PENDING · MENUNGGU VERIFIKASI ADMIN YAYASAN
                </p>
                <h1 className="font-display text-lg font-semibold text-slate-900 mt-1">
                  Lengkapi Pengisian Profil Akun SIAKHLAK
                </h1>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Akun <span className="font-mono text-slate-900">{profile.email}</span> terdaftar dari{' '}
                  <span className="font-medium text-slate-800">{portalLabel(selectedPortal)}</span> dengan status{' '}
                  <span className="font-mono font-semibold text-amber-900">PENDING</span>. Lengkapi data profil di bawah ini agar Admin Yayasan dapat memverifikasi peran, unit, dan mengaktifkan akun Anda.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-xs font-medium text-slate-700 shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>

          <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
            <p>
              Akses dashboard dan data akademik dikunci selama status akun masih <span className="font-mono font-semibold">PENDING</span>. Pengajuan profil ini tidak otomatis mengubah role atau mengaktifkan akun tanpa persetujuan Admin Yayasan.
            </p>
          </div>
        </div>

        {(submittedOk || hasExistingDraft) && (
          <div className="p-4 rounded-lg border border-emerald-300 bg-emerald-50 text-xs text-emerald-950 flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                Pengajuan Profil Tersimpan (Status: PENDING — Menunggu Persetujuan Admin Yayasan)
              </p>
              <p className="mt-1 text-emerald-900">
                Data profil Anda sudah tercatat di Cloud Firestore. Setelah Admin Yayasan memverifikasi dan mengubah status menjadi ACTIVE, halaman ini akan terbuka otomatis saat Anda masuk kembali.
              </p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 border border-red-300 bg-red-50 rounded-md text-xs text-red-800">
            {errorMsg}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          onChange={() => {
            dirtyRef.current = true;
          }}
          className="bg-white border border-slate-200 rounded-lg p-6 space-y-5 text-xs"
        >
          <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-800" />
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Formulir Pengajuan Profil Pengguna
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="onb-role" className="font-medium text-slate-700">
                Kategori Profil:
              </label>
              <select
                id="onb-role"
                value={requestedRole}
                onChange={(e) => setRequestedRole(e.target.value as OnboardingRoleOption)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-md font-medium text-slate-900"
              >
                <option value="STUDENT">Siswa (STUDENT)</option>
                <option value="PARENT">Orang Tua / Wali Murid (PARENT)</option>
                <option value="TEACHER">Guru / Wali Kelas (TEACHER)</option>
                <option value="COMMITTEE_ADMIN">Anggota Komite Agama (COMMITTEE_ADMIN)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Nama Lengkap *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nama lengkap sesuai identitas"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Nomor Telepon / WhatsApp *</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="08xxxxxxxxxx"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Alamat Domisili</label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Alamat lengkap tempat tinggal..."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
            />
          </div>

          {requestedRole === 'STUDENT' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-4">
              <p className="font-semibold text-slate-900">Data Identitas &amp; Jenjang Siswa</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">NIS *</label>
                  <input
                    type="text"
                    required
                    value={nis}
                    onChange={(e) => setNis(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">NISN</label>
                  <input
                    type="text"
                    value={nisn}
                    onChange={(e) => setNisn(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jenis Kelamin *</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="L">Laki-laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tempat Lahir</label>
                  <input
                    type="text"
                    value={birthPlace}
                    onChange={(e) => setBirthPlace(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tanggal Lahir</label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jenjang Pendidikan *</label>
                  <select
                    value={educationLevel}
                    onChange={(e) => setEducationLevel(e.target.value as EducationLevel)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    {EDUCATION_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {EDUCATION_LEVEL_LABELS[lvl]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tahun Masuk / Angkatan *</label>
                  <input
                    type="text"
                    required
                    value={admissionYear}
                    onChange={(e) => setAdmissionYear(e.target.value)}
                    placeholder="2026"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Kelas Saat Ini</label>
                  <input
                    type="text"
                    value={requestedClassName}
                    onChange={(e) => setRequestedClassName(e.target.value)}
                    placeholder="Contoh: 7A / X-1"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>
            </div>
          )}

          {requestedRole === 'PARENT' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-4">
              <p className="font-semibold text-slate-900">Data Orang Tua / Wali &amp; Pengajuan Tautan Anak</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Hubungan Wali *</label>
                  <select
                    value={relationshipType}
                    onChange={(e) => setRelationshipType(e.target.value as 'ayah' | 'ibu' | 'wali')}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="ayah">Ayah Kandung</option>
                    <option value="ibu">Ibu Kandung</option>
                    <option value="wali">Wali Resmi</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">NIS Anak yang Diajukan *</label>
                  <input
                    type="text"
                    required
                    value={childNis}
                    onChange={(e) => setChildNis(e.target.value)}
                    placeholder="Nomor Induk Siswa anak"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nama Anak *</label>
                  <input
                    type="text"
                    required
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    placeholder="Nama lengkap siswa"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>
            </div>
          )}

          {requestedRole === 'TEACHER' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-4">
              <p className="font-semibold text-slate-900">Data Pendidik / Guru / Wali Kelas</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">NIP / NIY *</label>
                  <input
                    type="text"
                    required
                    value={employeeNumber}
                    onChange={(e) => setEmployeeNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jenjang Unit *</label>
                  <select
                    value={educationLevel}
                    onChange={(e) => setEducationLevel(e.target.value as EducationLevel)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    {EDUCATION_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {EDUCATION_LEVEL_LABELS[lvl]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jenis Kelamin</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'L' | 'P')}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jabatan *</label>
                  <input
                    type="text"
                    required
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Status Kepegawaian *</label>
                  <select
                    value={employmentStatus}
                    onChange={(e) =>
                      setEmploymentStatus(e.target.value as 'TETAP' | 'KONTRAK' | 'HONORER')
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  >
                    <option value="TETAP">TETAP</option>
                    <option value="KONTRAK">KONTRAK</option>
                    <option value="HONORER">HONORER</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Mata Pelajaran (pisahkan koma)</label>
                  <input
                    type="text"
                    value={teachingSubjects}
                    onChange={(e) => setTeachingSubjects(e.target.value)}
                    placeholder="PAI, Tahfidz, Bahasa Arab"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPaiTeacher}
                  onChange={(e) => setIsPaiTeacher(e.target.checked)}
                />
                <span>Pengampu Pendidikan Agama Islam (PAI) / Pembinaan Akhlak</span>
              </label>
            </div>
          )}

          {requestedRole === 'COMMITTEE_ADMIN' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-4">
              <p className="font-semibold text-slate-900">Data Anggota Komite Pendidikan Agama</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Jabatan Komite *</label>
                  <input
                    type="text"
                    required
                    value={committeePosition}
                    onChange={(e) => setCommitteePosition(e.target.value)}
                    placeholder="Ketua / Sekretaris / Anggota Komite"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nomor SK Pengangkatan (Jika Ada)</label>
                  <input
                    type="text"
                    value={appointmentNumber}
                    onChange={(e) => setAppointmentNumber(e.target.value)}
                    placeholder="Nomor SK Yayasan"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-medium disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Menyimpan Pengajuan...' : 'Kirim & Simpan Pengajuan Profil'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
