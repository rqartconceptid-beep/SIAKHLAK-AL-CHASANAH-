import React, { useState } from 'react';
import { Plus, Printer, Trash2 } from 'lucide-react';
import {
  DecisionExecutionStatus,
  isFoundationOrSuperAdmin,
  KomiteDecision,
  KomiteMeeting,
  normalizeRole,
  UnitCode,
  UnitScope,
  UserProfile,
} from '../../types/siakhlak';
import {
  createKomiteDecision,
  createKomiteMeeting,
  deleteMasterDoc,
  updateKomiteDecisionStatus,
} from '../../services/siakhlakService';
import { EmptyState, Panel, SectionHeader } from '../ui/Primitives';
import { FoundationReportHeader } from '../branding/FoundationBrand';

const DECISION_STATUSES: DecisionExecutionStatus[] = [
  'Belum Dimulai',
  'Berjalan',
  'Selesai',
  'Terlambat',
];

export function RapatKeputusan({
  profile,
  authorizedUnits,
  meetings,
  decisions,
}: {
  profile: UserProfile;
  authorizedUnits: UnitCode[];
  meetings: KomiteMeeting[];
  decisions: KomiteDecision[];
}) {
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [showDecisionFormFor, setShowDecisionFormFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Meeting Form
  const [mTitle, setMTitle] = useState('');
  const [mDate, setMDate] = useState('');
  const [mChair, setMChair] = useState(profile.displayName);
  const [mAgenda, setMAgenda] = useState('');
  const [mParticipants, setMParticipants] = useState('');
  const [mMinutes, setMMinutes] = useState('');

  // Decision Form
  const [dText, setDText] = useState('');
  const [dUnit, setDUnit] = useState<UnitScope>('Seluruh Unit');
  const [dPic, setDPic] = useState('');
  const [dDeadline, setDDeadline] = useState('');

  // Decision Progress Edit
  const [editingDecisionId, setEditingDecisionId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<DecisionExecutionStatus>('Berjalan');
  const [editProgressNote, setEditProgressNote] = useState('');

  const canonicalRole = normalizeRole(profile.role);
  const canManage = canonicalRole === 'COMMITTEE_ADMIN' || isFoundationOrSuperAdmin(canonicalRole);

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const participantList = mParticipants
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await createKomiteMeeting({
        title: mTitle,
        meetingDate: mDate,
        agenda: mAgenda,
        participants: participantList,
        minutes: mMinutes,
        chairperson: mChair,
      });
      setMTitle('');
      setMDate('');
      setMAgenda('');
      setMParticipants('');
      setMMinutes('');
      setShowMeetingForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan rapat.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDecision = async (e: React.FormEvent, meeting: KomiteMeeting) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      await createKomiteDecision({
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        decisionText: dText,
        unitCode: dUnit,
        picName: dPic,
        deadline: dDeadline,
      });
      setDText('');
      setDPic('');
      setDDeadline('');
      setShowDecisionFormFor(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mencatat keputusan rapat.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDecisionProgress = async (decisionId: string) => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await updateKomiteDecisionStatus(decisionId, editStatus, editProgressNote);
      setEditingDecisionId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui status keputusan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <FoundationReportHeader
        reportTitle="NOTULEN RAPAT & KEPUTUSAN KOMITE PENDIDIKAN AGAMA"
        subtitle="Dokumentasi resmi agenda, notulen rapat, keputusan, penanggung jawab, dan tenggat pelaksanaan."
        unitLabel={authorizedUnits.join(', ')}
      />
      <SectionHeader
        title="Rapat dan Keputusan Komite"
        subtitle="Pencatatan agenda, daftar peserta, notulen rapat, keputusan resmi, penanggung jawab, tenggat waktu, dan pemantauan pelaksanaannya."
        action={
          <div className="flex flex-wrap items-center gap-2 no-print">
            {canManage && (
              <button
                type="button"
                onClick={() => setShowMeetingForm((v) => !v)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-emerald-800 hover:bg-emerald-900 text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showMeetingForm ? 'Tutup Formulir' : 'Catat Rapat Baru'}</span>
              </button>
            )}
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

      {errorMsg && (
        <div className="p-3 border border-red-300 bg-red-50 rounded-md text-xs text-red-800">
          {errorMsg}
        </div>
      )}

      {showMeetingForm && canManage && (
        <Panel title="Formulir Agenda & Notulen Rapat Komite">
          <form onSubmit={handleCreateMeeting} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block font-medium text-slate-700 mb-1">
                  Judul Rapat *
                </label>
                <input
                  type="text"
                  required
                  value={mTitle}
                  onChange={(e) => setMTitle(e.target.value)}
                  placeholder="Rapat Evaluasi Tengah Semester"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Tanggal Rapat *
                </label>
                <input
                  type="date"
                  required
                  value={mDate}
                  onChange={(e) => setMDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Pimpinan Rapat *
                </label>
                <input
                  type="text"
                  required
                  value={mChair}
                  onChange={(e) => setMChair(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Agenda Rapat *
              </label>
              <textarea
                rows={2}
                required
                value={mAgenda}
                onChange={(e) => setMAgenda(e.target.value)}
                placeholder="1. Evaluasi capaian 31 indikator... 2. Pembahasan kendala Mutaba'ah..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Peserta Rapat (pisahkan dengan koma atau baris baru)
              </label>
              <textarea
                rows={2}
                value={mParticipants}
                onChange={(e) => setMParticipants(e.target.value)}
                placeholder="Ketua Komite, Sekretaris Komite, Kepala Unit SMP, Koordinator PAI..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Notulen Rapat
              </label>
              <textarea
                rows={4}
                value={mMinutes}
                onChange={(e) => setMMinutes(e.target.value)}
                placeholder="Ringkasan jalannya pembahasan, masukan peserta, dan catatan strategis..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-medium rounded-md bg-emerald-800 hover:bg-emerald-900 text-white cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan Rapat & Notulen'}
              </button>
              <button
                type="button"
                onClick={() => setShowMeetingForm(false)}
                className="px-4 py-2 text-xs font-medium rounded-md border border-slate-300 text-slate-700 cursor-pointer"
              >
                Batal
              </button>
            </div>
          </form>
        </Panel>
      )}

      {/* Meetings & Attached Decisions */}
      <Panel
        title="Arsip Rapat & Notulen Komite"
        meta={`${meetings.length} rapat tercatat`}
      >
        {meetings.length === 0 ? (
          <EmptyState
            title="Belum Ada Catatan Rapat Komite"
            description="Agenda, peserta, notulen, dan keputusan rapat Komite Pendidikan Agama akan tersimpan secara permanen di sini."
            action={
              canManage && !showMeetingForm ? (
                <button
                  type="button"
                  onClick={() => setShowMeetingForm(true)}
                  className="px-3.5 py-2 text-xs font-medium rounded-md bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer"
                >
                  Catat Rapat Pertama
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-slate-200">
            {meetings.map((meeting) => {
              const relatedDecisions = decisions.filter((d) => d.meetingId === meeting.id);
              const addingDecision = showDecisionFormFor === meeting.id;
              return (
                <div key={meeting.id} className="py-5 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {meeting.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        Tanggal: {meeting.meetingDate} · Pimpinan: {meeting.chairperson} · {meeting.participants.length} peserta
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setShowDecisionFormFor(addingDecision ? null : meeting.id)
                          }
                          className="text-xs font-medium text-emerald-800 hover:underline cursor-pointer"
                        >
                          {addingDecision ? 'Tutup Form Keputusan' : '+ Tambah Keputusan Rapat'}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMasterDoc('komiteMeetings', meeting.id)}
                          title="Hapus Rapat"
                          className="p-1 text-slate-400 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-slate-50 border border-slate-200 rounded-md p-3.5">
                    <div>
                      <p className="font-medium text-slate-800">Agenda &amp; Peserta</p>
                      <p className="mt-1 text-slate-600 whitespace-pre-line">{meeting.agenda}</p>
                      {meeting.participants.length > 0 && (
                        <p className="mt-2 text-slate-500">
                          Peserta: {meeting.participants.join(', ')}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">Notulen Rapat</p>
                      <p className="mt-1 text-slate-600 whitespace-pre-line">
                        {meeting.minutes || '-'}
                      </p>
                    </div>
                  </div>

                  {addingDecision && canManage && (
                    <form
                      onSubmit={(e) => handleCreateDecision(e, meeting)}
                      className="p-4 border border-emerald-200 bg-emerald-50/40 rounded-md space-y-3 text-xs"
                    >
                      <p className="font-semibold text-slate-900">
                        Tambah Keputusan Rapat Baru
                      </p>
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          Isi Keputusan Rapat *
                        </label>
                        <textarea
                          rows={2}
                          required
                          value={dText}
                          onChange={(e) => setDText(e.target.value)}
                          placeholder="Keputusan operasional atau kebijakan yang harus dijalankan..."
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            Unit Terkait
                          </label>
                          <select
                            value={dUnit}
                            onChange={(e) => setDUnit(e.target.value as UnitScope)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                          >
                            <option value="Seluruh Unit">Seluruh Unit</option>
                            {authorizedUnits.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            Penanggung Jawab *
                          </label>
                          <input
                            type="text"
                            required
                            value={dPic}
                            onChange={(e) => setDPic(e.target.value)}
                            placeholder="Nama PIC"
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            Tenggat Waktu *
                          </label>
                          <input
                            type="date"
                            required
                            value={dDeadline}
                            onChange={(e) => setDDeadline(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-3.5 py-1.5 text-xs font-medium rounded-md bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer"
                      >
                        {saving ? 'Menyimpan...' : 'Simpan Keputusan'}
                      </button>
                    </form>
                  )}

                  {relatedDecisions.length > 0 && (
                    <div className="pl-2 space-y-2">
                      <p className="text-xs font-medium text-slate-700">
                        Keputusan Rapat Terkait ({relatedDecisions.length})
                      </p>
                      <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                        {relatedDecisions.map((dec) => (
                          <div key={dec.id} className="p-3 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                              <p className="font-medium text-slate-900">{dec.decisionText}</p>
                              <p className="text-slate-500 mt-0.5 tabular-nums">
                                {dec.unitCode} · PIC: {dec.picName} · Tenggat: {dec.deadline}
                              </p>
                              {dec.progressNote && (
                                <p className="text-slate-600 mt-1">Catatan progres: {dec.progressNote}</p>
                              )}
                            </div>
                            <span className="font-medium text-slate-800 whitespace-nowrap shrink-0">
                              {dec.executionStatus}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Monitoring Pelaksanaan Semua Keputusan */}
      <Panel
        title="Pemantauan Pelaksanaan Keputusan Komite"
        meta={`${decisions.length} keputusan rapat dalam pengawasan`}
      >
        {decisions.length === 0 ? (
          <EmptyState
            title="Belum Ada Keputusan Rapat Tercatat"
            description="Tambahkan keputusan rapat dari daftar rapat di atas untuk memantau penanggung jawab, tenggat waktu, dan progres pelaksanaannya."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Keputusan &amp; Rapat</th>
                  <th className="py-2.5 px-3 font-medium">Unit &amp; PIC</th>
                  <th className="py-2.5 px-3 font-medium">Tenggat</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 pl-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {decisions.map((dec) => {
                  const isEditing = editingDecisionId === dec.id;
                  return (
                    <tr key={dec.id} className="align-top">
                      <td className="py-3 pr-3">
                        <p className="font-medium text-slate-900">{dec.decisionText}</p>
                        <p className="text-slate-500 mt-0.5">Rapat: {dec.meetingTitle}</p>
                        {dec.progressNote && !isEditing && (
                          <p className="text-slate-600 mt-1">Progres: {dec.progressNote}</p>
                        )}
                        {isEditing && (
                          <div className="mt-2 space-y-2 max-w-md">
                            <select
                              value={editStatus}
                              onChange={(e) =>
                                setEditStatus(e.target.value as DecisionExecutionStatus)
                              }
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                            >
                              {DECISION_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                            <textarea
                              rows={2}
                              value={editProgressNote}
                              onChange={(e) => setEditProgressNote(e.target.value)}
                              placeholder="Catatan pelaksanaan keputusan..."
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => handleSaveDecisionProgress(dec.id)}
                                className="px-3 py-1 bg-emerald-800 text-white rounded-md cursor-pointer"
                              >
                                Simpan
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingDecisionId(null)}
                                className="px-3 py-1 border border-slate-300 rounded-md cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-700">
                        {dec.unitCode} · {dec.picName}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {dec.deadline}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-900 whitespace-nowrap">
                        {dec.executionStatus}
                      </td>
                      <td className="py-3 pl-3 text-right whitespace-nowrap">
                        {canManage && !isEditing && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDecisionId(dec.id);
                                setEditStatus(dec.executionStatus);
                                setEditProgressNote(dec.progressNote || '');
                              }}
                              className="text-emerald-800 font-medium hover:underline cursor-pointer"
                            >
                              Pantau / Update
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteMasterDoc('komiteDecisions', dec.id)}
                              className="text-slate-400 hover:text-red-700 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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
    </div>
  );
}
