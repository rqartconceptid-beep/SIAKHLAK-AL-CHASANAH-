import React from 'react';

export const FOUNDATION_BRAND = {
  foundationName: 'YAYASAN PENDIDIKAN AL CHASANAH',
  foundationDisplayName: 'Yayasan Pendidikan Al Chasanah',
  appName: 'SIAKHLAK',
  appDescription: 'Sistem Informasi Akhlakul Karimah',
  reportSubtitle: 'SIAKHLAK — SISTEM INFORMASI AKHLAKUL KARIMAH',
  browserTitle: 'SIAKHLAK | Yayasan Pendidikan Al Chasanah',
  logoSrc: '/assets/logo-yayasan-al-chasanah.png',
  logoAlt: 'Logo Yayasan Pendidikan Al-Chasanah',
  levelsSummary: 'Jenjang Pendidikan: KB/TK · SD · SMP · SMA · SMK',
} as const;

export function FoundationLogo({
  className = 'w-12 h-12',
  framed = true,
}: {
  className?: string;
  framed?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 overflow-hidden ${
        framed ? 'bg-white border border-amber-500/40 rounded-lg p-1' : 'bg-white'
      } ${className}`}
    >
      <img
        src={FOUNDATION_BRAND.logoSrc}
        alt={FOUNDATION_BRAND.logoAlt}
        width={128}
        height={128}
        className="w-full h-full object-contain select-none"
        draggable={false}
      />
    </div>
  );
}

export type BrandVariant =
  | 'hero'
  | 'portal'
  | 'header'
  | 'sidebar'
  | 'profile'
  | 'dashboardBanner';

export function FoundationBrand({
  variant = 'portal',
  roleSubtitle,
  contextLabel,
  className = '',
}: {
  variant?: BrandVariant;
  roleSubtitle?: string;
  contextLabel?: string;
  className?: string;
}) {
  if (variant === 'hero') {
    return (
      <div
        className={`flex flex-col sm:flex-row items-center sm:items-center gap-5 pb-6 border-b-2 border-emerald-900/15 ${className}`}
      >
        <div className="flex items-center justify-center shrink-0">
          <FoundationLogo className="w-[108px] h-[108px] sm:w-[132px] sm:h-[132px] p-1.5 border-amber-600/45 shadow-xs" />
        </div>
        <div className="min-w-0 space-y-1 text-center sm:text-left">
          <p className="font-display text-xs sm:text-sm font-bold tracking-wider uppercase text-emerald-900">
            {FOUNDATION_BRAND.foundationName}
          </p>
          <div className="flex flex-wrap items-baseline justify-center sm:justify-start gap-x-2.5 gap-y-0.5">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              {FOUNDATION_BRAND.appName}
            </h1>
            <span className="text-sm sm:text-base font-medium text-amber-800">
              {FOUNDATION_BRAND.appDescription}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl pt-0.5">
            Sistem pemantauan pembinaan Akhlakul Karimah, pendidikan agama, Mutaba’ah, dan
            pengawasan mutu keagamaan untuk jenjang KB/TK, SD, SMP, SMA, dan SMK.
          </p>
        </div>
      </div>
    );
  }

  if (variant === 'portal') {
    return (
      <div className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-4 text-center sm:text-left ${className}`}>
        <div className="flex items-center justify-center shrink-0">
          <FoundationLogo className="w-[108px] h-[108px] sm:w-[132px] sm:h-[132px] p-1.5 border-amber-600/40 shadow-xs" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-xs sm:text-sm font-bold tracking-wider uppercase text-emerald-900 leading-snug">
            {FOUNDATION_BRAND.foundationName}
          </p>
          <p className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 leading-tight mt-0.5">
            {FOUNDATION_BRAND.appName}
          </p>
          <p className="text-xs sm:text-sm text-slate-600 leading-snug mt-0.5">
            {FOUNDATION_BRAND.appDescription}
          </p>
          <p className="text-[11px] text-amber-800 font-medium mt-1">
            {FOUNDATION_BRAND.levelsSummary}
          </p>
        </div>
      </div>
    );
  }

  if (variant === 'sidebar') {
    return (
      <div className={`px-4 py-4 border-b border-slate-200 bg-emerald-950/[0.02] ${className}`}>
        <div className="flex items-center gap-3">
          <FoundationLogo className="w-10 h-10 p-0.5 border-amber-600/40" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[10px] font-bold tracking-wide uppercase text-emerald-900 leading-tight">
              {FOUNDATION_BRAND.foundationName}
            </p>
            <p className="font-display text-sm font-bold text-slate-900 leading-tight mt-0.5">
              {FOUNDATION_BRAND.appName}
            </p>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-amber-600/25 flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-slate-600 truncate">
            {FOUNDATION_BRAND.appDescription}
          </span>
        </div>
        {roleSubtitle && (
          <p className="mt-1 text-[11px] font-mono font-medium text-emerald-900 truncate">
            {roleSubtitle}
          </p>
        )}
      </div>
    );
  }

  if (variant === 'header') {
    return (
      <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
        <FoundationLogo className="w-8 h-8 p-0.5 border-amber-600/40" />
        <div className="min-w-0 leading-tight">
          <p className="font-display text-[11px] sm:text-xs font-bold tracking-wide uppercase text-emerald-900 truncate">
            {FOUNDATION_BRAND.foundationName}
          </p>
          <p className="text-[11px] text-slate-600 truncate">
            <span className="font-semibold text-slate-900">{FOUNDATION_BRAND.appName}</span>
            <span className="hidden sm:inline"> — {FOUNDATION_BRAND.appDescription}</span>
          </p>
        </div>
      </div>
    );
  }

  if (variant === 'profile') {
    return (
      <div
        className={`bg-white border border-slate-200 rounded-lg p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t-2 border-t-emerald-800 ${className}`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <FoundationLogo className="w-12 h-12 p-1 border-amber-600/40" />
          <div className="min-w-0">
            <p className="font-display text-xs font-bold tracking-wider uppercase text-emerald-900">
              {FOUNDATION_BRAND.foundationName}
            </p>
            <p className="font-display text-base font-semibold text-slate-900">
              {FOUNDATION_BRAND.reportSubtitle}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{FOUNDATION_BRAND.levelsSummary}</p>
          </div>
        </div>
      </div>
    );
  }

  // variant === 'dashboardBanner'
  return (
    <div
      className={`no-print bg-white border border-slate-200 rounded-lg px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t-2 border-t-emerald-800 ${className}`}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <FoundationLogo className="w-11 h-11 p-1 border-amber-600/40" />
        <div className="min-w-0">
          <p className="font-display text-xs font-bold tracking-wider uppercase text-emerald-900">
            {FOUNDATION_BRAND.foundationName}
          </p>
          <p className="text-xs sm:text-sm font-semibold text-slate-900">
            {FOUNDATION_BRAND.reportSubtitle}
          </p>
        </div>
      </div>
      {contextLabel && (
        <div className="text-left sm:text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-800">
            Unit Kerja Aktif
          </p>
          <p className="text-xs font-semibold text-slate-800">{contextLabel}</p>
        </div>
      )}
    </div>
  );
}

export function FoundationReportHeader({
  reportTitle,
  subtitle,
  periodLabel,
  unitLabel,
  metaItems = [],
  alwaysVisible = false,
  className = '',
}: {
  reportTitle: string;
  subtitle?: string;
  periodLabel?: string;
  unitLabel?: string;
  metaItems?: { label: string; value: string }[];
  alwaysVisible?: boolean;
  className?: string;
}) {
  const todayLabel = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div
      className={`${
        alwaysVisible ? 'block' : 'hidden print:block'
      } print-avoid-break bg-white text-slate-900 mb-5 ${className}`}
    >
      {/* Official Kop Surat */}
      <div className="flex items-center gap-4 pb-3 border-b-2 border-emerald-900">
        <FoundationLogo className="w-16 h-16 sm:w-18 sm:h-18 p-1 border-amber-600/50" />
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <p className="font-display text-sm sm:text-base font-bold tracking-wider uppercase text-emerald-950">
            {FOUNDATION_BRAND.foundationName}
          </p>
          <p className="font-display text-xs sm:text-sm font-semibold tracking-wide text-emerald-800 mt-0.5">
            {FOUNDATION_BRAND.reportSubtitle}
          </p>
          <p className="text-[11px] text-slate-600 mt-0.5">
            {FOUNDATION_BRAND.levelsSummary}
          </p>
        </div>
      </div>
      <div className="h-0.5 bg-amber-600/70 mt-0.5 mb-3" />

      {/* Formal Report Title & Metadata */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 pb-3 border-b border-slate-200">
        <div>
          <h2 className="font-display text-sm sm:text-base font-bold uppercase tracking-tight text-slate-900">
            {reportTitle}
          </h2>
          {subtitle && <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>}
        </div>
        <div className="text-[11px] text-slate-600 sm:text-right font-mono space-y-0.5 shrink-0">
          {periodLabel && <p>Periode: {periodLabel}</p>}
          {unitLabel && <p>Unit / Cakupan: {unitLabel}</p>}
          <p>Tanggal Cetak: {todayLabel}</p>
        </div>
      </div>

      {metaItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2.5 text-xs">
          {metaItems.map((item) => (
            <div key={item.label} className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{item.label}</p>
              <p className="font-medium text-slate-900 mt-0.5 truncate">{item.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
