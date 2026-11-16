import React, { useState } from 'react';
import {
  Activity,
  Award,
  BookOpen,
  Building2,
  ClipboardCheck,
  FileBarChart2,
  FileWarning,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  ActiveMenuKey,
  normalizeRole,
  roleLabel,
  UserProfile,
} from '../types/siakhlak';
import { FoundationBrand } from './branding/FoundationBrand';

interface NavItem {
  key: ActiveMenuKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const KOMITE_MENUS: NavItem[] = [
  { key: 'komite_dashboard', label: 'Dashboard Komite', icon: LayoutDashboard },
  { key: 'komite_monitoring_agama', label: 'Monitoring Pendidikan Agama', icon: Activity },
  { key: 'komite_evaluasi_program', label: 'Evaluasi Program Keagamaan', icon: BookOpen },
  { key: 'komite_monitoring_akhlak', label: 'Monitoring Akhlakul Karimah', icon: Award },
  { key: 'komite_monitoring_mutabaah', label: 'Monitoring Mutaba’ah', icon: ClipboardCheck },
  { key: 'komite_temuan_rekomendasi', label: 'Temuan dan Rekomendasi', icon: FileWarning },
  { key: 'komite_rapat_keputusan', label: 'Rapat dan Keputusan Komite', icon: Users },
  { key: 'komite_tindak_lanjut', label: 'Tindak Lanjut Rekomendasi', icon: ListChecks },
  { key: 'komite_laporan', label: 'Laporan Komite', icon: FileBarChart2 },
  { key: 'profil_saya', label: 'Profil Saya', icon: UserCheck },
];

const YAYASAN_CORE_MENUS: NavItem[] = [
  { key: 'core_dashboard', label: 'Dashboard Operasional', icon: LayoutDashboard },
  { key: 'core_penilaian_akhlak', label: 'Penilaian 31 Indikator', icon: Award },
  { key: 'core_program_keagamaan', label: 'Monev, Mutaba’ah & Pembiasaan', icon: BookOpen },
  { key: 'core_tindak_lanjut_unit', label: 'Tindak Lanjut Rekomendasi', icon: ListChecks },
  { key: 'core_master_data', label: 'Data Master & Manajemen Peserta Didik', icon: Building2 },
  { key: 'core_pengaturan_sistem', label: 'Pengaturan, Role & Permission', icon: Settings },
  { key: 'core_audit_trail', label: 'Audit Trail & Riwayat Import', icon: ShieldCheck },
  { key: 'profil_saya', label: 'Profil Saya', icon: UserCheck },
];

const TEACHER_MENUS: NavItem[] = [
  { key: 'core_dashboard', label: 'Dashboard Guru', icon: LayoutDashboard },
  { key: 'core_penilaian_akhlak', label: 'Penilaian 31 Indikator & Excel', icon: Award },
  { key: 'core_program_keagamaan', label: 'Mutaba’ah & Program Unit', icon: BookOpen },
  { key: 'core_tindak_lanjut_unit', label: 'Tindak Lanjut Rekomendasi', icon: ListChecks },
  { key: 'core_master_data', label: 'Kelas Penugasan & Siswa', icon: Building2 },
  { key: 'profil_saya', label: 'Profil Saya', icon: UserCheck },
];

const STUDENT_ONLY_MENUS: NavItem[] = [
  { key: 'siswa_dashboard', label: 'Dashboard Siswa', icon: LayoutDashboard },
  { key: 'siswa_profil', label: 'Profil Pribadi', icon: UserCheck },
  { key: 'siswa_mutabaah', label: 'Mutaba’ah', icon: ClipboardCheck },
];

const PARENT_ONLY_MENUS: NavItem[] = [
  { key: 'siswa_dashboard', label: 'Dashboard Orang Tua', icon: LayoutDashboard },
  { key: 'siswa_profil', label: 'Profil Pribadi', icon: UserCheck },
  { key: 'siswa_akhlak', label: 'Penilaian 31 Indikator', icon: Award },
  { key: 'siswa_mutabaah', label: 'Mutaba’ah', icon: ClipboardCheck },
  { key: 'siswa_riwayat', label: 'Riwayat Perkembangan', icon: History },
];

export function Sidebar({
  profile,
  activeMenu,
  onSelectMenu,
  onSignOut,
}: {
  profile: UserProfile;
  activeMenu: ActiveMenuKey;
  onSelectMenu: (menu: ActiveMenuKey) => void;
  onSignOut: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const canonicalRole = normalizeRole(profile.role);
  const isKomite = canonicalRole === 'COMMITTEE_ADMIN';
  const isTeacher = canonicalRole === 'TEACHER' || canonicalRole === 'HOMEROOM_TEACHER';
  const isStudent = canonicalRole === 'STUDENT';
  const isParent = canonicalRole === 'PARENT';
  const isSuperAdmin = canonicalRole === 'SUPER_ADMIN';

  const renderNavGroup = (heading: string, items: NavItem[]) => (
    <div>
      <p className="px-2.5 mb-2 text-xs font-medium text-slate-500">{heading}</p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activeMenu === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onSelectMenu(item.key);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium text-left transition-colors cursor-pointer ${
                active
                  ? 'bg-emerald-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderNavContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <FoundationBrand variant="sidebar" roleSubtitle={roleLabel(canonicalRole)} />

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {isStudent ? (
          renderNavGroup('Portal Siswa', STUDENT_ONLY_MENUS)
        ) : isParent ? (
          renderNavGroup('Portal Orang Tua Murid', PARENT_ONLY_MENUS)
        ) : isTeacher ? (
          renderNavGroup(
            canonicalRole === 'HOMEROOM_TEACHER'
              ? 'Portal Wali Kelas'
              : 'Portal Guru Bidang / PAI',
            TEACHER_MENUS
          )
        ) : isKomite ? (
          renderNavGroup('Menu Komite Pendidikan Agama', KOMITE_MENUS)
        ) : (
          <>
            {renderNavGroup(
              isSuperAdmin ? 'Portal Super Admin & Yayasan' : 'Portal Admin Yayasan',
              YAYASAN_CORE_MENUS
            )}
            {renderNavGroup('Pengawasan Komite Agama', KOMITE_MENUS)}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-3 bg-slate-50/70">

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-900 truncate">
              {profile.full_name || profile.displayName}
            </p>
            <p className="text-xs text-slate-500 truncate">{profile.email}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            title="Logout"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:text-red-700 hover:border-red-200 hover:bg-red-50 transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Buka Navigasi"
        className="lg:hidden fixed bottom-4 right-4 z-40 p-3 rounded-lg bg-emerald-900 text-white shadow-md"
      >
        <Menu className="w-5 h-5" />
      </button>

      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {renderNavContent()}
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Tutup Navigasi"
              className="absolute top-3 right-3 p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
            {renderNavContent()}
          </div>
        </div>
      )}
    </>
  );
}
