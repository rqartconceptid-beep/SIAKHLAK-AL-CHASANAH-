import React from 'react';
import { Printer } from 'lucide-react';
import { AuditLog, ExcelImportLog, isFoundationOrSuperAdmin, UserProfile } from '../../types/siakhlak';
import { formatTimestamp } from '../../services/siakhlakService';
import { EmptyState, Panel, RestrictedNotice, SectionHeader } from '../ui/Primitives';
import { FoundationReportHeader } from '../branding/FoundationBrand';

export function CoreAuditTrail({
  profile,
  auditLogs,
  importLogs,
}: {
  profile: UserProfile;
  auditLogs: AuditLog[];
  importLogs: ExcelImportLog[];
}) {
  if (!isFoundationOrSuperAdmin(profile.role)) {
    return (
      <RestrictedNotice
        title="Audit Trail Khusus Admin Yayasan & Super Admin"
        message="Catatan jejak audit sistem hanya dapat diakses oleh Admin Yayasan (FOUNDATION_ADMIN) dan Super Admin (SUPER_ADMIN)."
      />
    );
  }

  return (
    <div className="space-y-6">
      <FoundationReportHeader
        reportTitle="LAPORAN AUDIT TRAIL & RIWAYAT IMPORT SIAKHLAK"
        subtitle="Jejak aktivitas resmi perubahan hak akses, status akun, relasi wali, penugasan guru, dan import penilaian Excel."
        unitLabel="Seluruh Unit Pendidikan"
      />
      <SectionHeader
        title="Audit Trail & Riwayat Import Excel"
        subtitle="Jejak aktivitas perubahan hak akses, status akun, relasi wali, penugasan guru, import Excel penilaian, dan operasional SIAKHLAK."
        action={
          <button
            type="button"
            onClick={() => window.print()}
            className="no-print inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-emerald-800 bg-white hover:bg-emerald-50 text-emerald-900 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak / Export PDF</span>
          </button>
        }
      />

      <Panel title="Log Jejak Audit Sistem" meta={`${auditLogs.length} catatan audit`}>
        {auditLogs.length === 0 ? (
          <EmptyState
            title="Belum Ada Catatan Audit"
            description="Aktivitas sensitif seperti perubahan peran pengguna, permission, relasi wali, dan import penilaian Excel akan tercatat otomatis di sini."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Waktu</th>
                  <th className="py-2 px-3 font-medium">Pelaku</th>
                  <th className="py-2 px-3 font-medium">Aksi</th>
                  <th className="py-2 pl-3 font-medium">Ringkasan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="py-2.5 pr-3 font-mono text-slate-600 whitespace-nowrap">
                      {formatTimestamp(log.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-900">
                      {log.actorName}{' '}
                      <span className="text-slate-500">({log.actorRole})</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">{log.action}</td>
                    <td className="py-2.5 pl-3 text-slate-700">{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Riwayat Import Excel Seluruh Guru" meta={`${importLogs.length} aktivitas import`}>
        {importLogs.length === 0 ? (
          <EmptyState
            title="Belum Ada Riwayat Import"
            description="Seluruh aktivitas import Excel dari guru wali kelas akan tercatat di sini."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Waktu</th>
                  <th className="py-2 px-3 font-medium">Guru</th>
                  <th className="py-2 px-3 font-medium">Kelas &amp; Periode</th>
                  <th className="py-2 px-3 font-medium">File</th>
                  <th className="py-2 px-3 font-medium text-right">Valid / Gagal</th>
                  <th className="py-2 pl-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 pr-3 font-mono text-slate-600 whitespace-nowrap">
                      {formatTimestamp(log.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">{log.teacherName}</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {log.unitCode} · {log.className} ({log.periodName})
                    </td>
                    <td className="py-2.5 px-3 font-mono max-w-48 truncate">{log.fileName}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {log.validCount} / {log.failedCount}
                    </td>
                    <td className="py-2.5 pl-3 font-medium text-slate-900">{log.status}</td>
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
