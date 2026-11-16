import React from 'react';
import { AlertCircle, CheckCircle2, Database, Lock, RefreshCw } from 'lucide-react';
import { DbConnectionStatus, FollowUpStatus } from '../../types/siakhlak';

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 pb-4">
      <div className="min-w-0">
        <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-600 max-w-3xl">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}

export function Panel({
  title,
  meta,
  action,
  children,
  className = '',
}: {
  title?: string;
  meta?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white border border-slate-200 rounded-lg ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-sm font-semibold text-slate-900 truncate">
                {title}
              </h2>
            )}
            {meta && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">{meta}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6 border border-dashed border-slate-300 rounded-lg bg-slate-50/60">
      <Database className="w-7 h-7 text-slate-400 mb-3" strokeWidth={1.5} />
      <h3 className="font-display text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs text-slate-600 max-w-md leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function DbStatusBadge({
  status,
  onRetry,
}: {
  status: DbConnectionStatus;
  onRetry?: () => void;
}) {
  if (status === 'NOT CONNECTED') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-red-300 bg-red-50 text-red-800 text-xs font-medium whitespace-nowrap shrink-0">
        <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
        <span className="font-mono font-semibold">NOT CONNECTED</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-1 underline hover:text-red-950 focus-visible:outline-2 focus-visible:outline-red-600"
          >
            Uji Ulang
          </button>
        )}
      </div>
    );
  }
  if (status === 'CHECKING') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap shrink-0">
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
        <span>Memeriksa database...</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-emerald-800 whitespace-nowrap shrink-0">
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
      <span className="font-mono">Database Terhubung</span>
    </div>
  );
}

export function FollowUpStatusText({ status }: { status: FollowUpStatus }) {
  const colorMap: Record<FollowUpStatus, string> = {
    Baru: 'text-slate-700',
    Diterima: 'text-sky-700',
    'Dalam Proses': 'text-amber-700',
    'Menunggu Verifikasi': 'text-indigo-700',
    Selesai: 'text-emerald-700',
    'Perlu Perbaikan': 'text-red-700',
  };
  return (
    <span className={`font-medium text-xs whitespace-nowrap ${colorMap[status]}`}>
      {status}
    </span>
  );
}

export function RestrictedNotice({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4 border border-slate-200 bg-slate-50 rounded-lg text-xs text-slate-700">
      <Lock className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-slate-600 leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
