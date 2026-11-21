import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, QrCode, Smartphone, X, Check } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const BrandLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dim = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-14 h-14' : 'w-10 h-10';
  return (
    <div
      className={`${dim} rounded-2xl bg-gradient-to-br from-emerald-800 via-emerald-600 to-teal-500 p-1.5 shadow-md shadow-emerald-900/20 flex items-center justify-center shrink-0`}
    >
      <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
        <circle cx="32" cy="32" r="24" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" />
        <path
          d="M32 13L36.5 23.5L47.5 24.5L39.5 32L41.8 43L32 37.3L22.2 43L24.5 32L16.5 24.5L27.5 23.5L32 13Z"
          fill="rgba(236,253,245,0.96)"
        />
        <circle cx="32" cy="30" r="4.5" fill="#047857" />
      </svg>
    </div>
  );
};

export const QRInstallModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const currentUrl = typeof window !== 'undefined' ? window.location.origin : 'https://cbt-ma-nh.app';

  if (!open) return null;

  const handleCopy = () => {
    navigator.clipboard?.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-md p-4 animate-ios-enter"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-install-title"
    >
      <div className="glass-surface w-full max-w-md rounded-3xl p-6 relative">
        <button
          onClick={onClose}
          aria-label="Tutup modal instalasi"
          className="glass-pill-btn absolute top-4 right-4 w-9 h-9 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-300/70"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h3 id="qr-install-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Instal Aplikasi CBT di HP
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Scan kode QR atau instal langsung sebagai PWA layar penuh
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-5 border border-slate-200/80 shadow-inner mb-4">
          <QRCodeSVG value={currentUrl} size={172} level="M" includeMargin />
          <p className="mt-3 text-xs font-mono text-slate-600 break-all text-center">
            {currentUrl}
          </p>
          <button
            onClick={handleCopy}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : null}
            {copied ? 'Tautan Disalin' : 'Salin Tautan Portal'}
          </button>
        </div>

        <div className="space-y-3">
          {isInstallable && !isInstalled && (
            <button
              onClick={install}
              className="glass-pill-btn w-full py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
            >
              <Download className="w-4 h-4" />
              Instal Aplikasi Sekarang
            </button>
          )}

          {isInstalled && (
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200 text-center">
              Aplikasi sudah terpasang dalam mode Layar Penuh (Standalone).
            </div>
          )}

          <div className="rounded-2xl glass-subtle p-3.5 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5 text-slate-900 dark:text-white">
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              Panduan Tambah ke Layar Utama:
            </div>
            {isIOS ? (
              <p>
                Buka di <b>Safari</b> → ketuk ikon <b>Bagikan (Share)</b> → pilih{' '}
                <b>Tambahkan ke Layar Utama</b>.
              </p>
            ) : (
              <p>
                Buka di <b>Chrome / Edge</b> → ketuk menu titik tiga (⋮) → pilih{' '}
                <b>Instal Aplikasi / Tambahkan ke Layar Utama</b>.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
