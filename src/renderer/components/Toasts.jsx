/**
 * @file src/renderer/components/Toasts.jsx
 * @description Non-blocking notification stack (bottom-right). Tone drives the
 * accent: gold for success, blood for errors, neutral for info.
 */

import React from 'react';
import { useDesignStore } from '../store/useDesignStore';
import { IconCheck, IconClose, IconInfo } from './ui/Icons';

const TONE = {
  ok: { icon: IconCheck, ring: 'border-moss-400/40', text: 'text-moss-400', wash: 'bg-moss-500/10' },
  error: { icon: IconClose, ring: 'border-blood-500/50', text: 'text-blood-500', wash: 'bg-blood-500/10' },
  info: { icon: IconInfo, ring: 'border-gold-400/30', text: 'text-gold-300', wash: 'bg-gold-400/[0.07]' },
};

export function Toasts() {
  const toasts = useDesignStore((s) => s.ui.toasts);
  const dismiss = useDesignStore((s) => s.dismissToast);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[300px]">
      {toasts.map((t) => {
        const tone = TONE[t.tone] || TONE.info;
        const Icon = tone.icon;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2
                        bg-void-850/95 backdrop-blur-md shadow-[0_16px_40px_-16px_rgba(0,0,0,1)]
                        animate-fade-in ${tone.ring} ${tone.wash}`}
            role="status"
          >
            <Icon size={13} className={`mt-0.5 shrink-0 ${tone.text}`} />
            <p className="flex-1 text-[11px] leading-snug text-neutral-300">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-neutral-600 hover:text-neutral-300 shrink-0"
              aria-label="Dismiss"
            >
              <IconClose size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
