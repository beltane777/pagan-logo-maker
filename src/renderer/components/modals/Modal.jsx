/**
 * @file src/renderer/components/modals/Modal.jsx
 * @description Accessible modal shell: focus trap, Escape to dismiss, backdrop
 * click to close, and a consistent header/footer chrome.
 */

import React, { useEffect, useRef } from 'react';
import { IconClose } from '../ui/Icons';

/**
 * @param {{title: string, subtitle?: string, onClose: Function,
 *   children: React.ReactNode, footer?: React.ReactNode, width?: number, icon?: React.ReactNode}} props
 */
export function Modal({ title, subtitle, onClose, children, footer, width = 560, icon }) {
  const cardRef = useRef(null);

  /* Escape + focus trap */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && cardRef.current) {
        const nodes = cardRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const list = [...nodes].filter((n) => !n.disabled && n.offsetParent !== null);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    // Move focus into the dialog.
    requestAnimationFrame(() => cardRef.current?.querySelector('input, button')?.focus());
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={cardRef}
        className="modal-card"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-start gap-3 px-5 py-4 border-b border-gold-400/15">
          {icon && <div className="text-gold-400/80 mt-0.5">{icon}</div>}
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-[15px] tracking-[0.06em] text-parchment">{title}</h2>
            {subtitle && <p className="text-[11px] text-neutral-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon" aria-label="Close">
            <IconClose size={14} />
          </button>
        </header>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.06] bg-void-900/40">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
