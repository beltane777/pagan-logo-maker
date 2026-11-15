/**
 * @file src/renderer/components/modals/AboutModal.jsx
 * @description License + attribution panel. Doubles as the "About" and
 * "License" entry point required by the app blueprint.
 */

import React from 'react';
import { Modal } from './Modal';
import { IconInfo, IconSparkle } from '../ui/Icons';
import { libraryStats } from '../../lib/assetLibrary';

/**
 * @param {{onClose: Function}} props
 */
export function AboutModal({ onClose }) {
  const stats = libraryStats();
  const versions = window.desktop?.versions;

  return (
    <Modal
      title="Pagan Logo Maker"
      subtitle={`Version 1.0.0 · ${stats.total} bundled vectors`}
      onClose={onClose}
      icon={<IconSparkle size={18} />}
      width={560}
      footer={
        <button type="button" className="btn btn-gold" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-4 text-[11px] leading-relaxed text-neutral-400">
        <p>
          A standalone studio for crafting pagan, esoteric and occult logo marks — runes, lunar sigils,
          knotwork, alchemical glyphs and heraldic frames — composed on a live vector canvas and exported
          at any resolution. Everything is offline: no accounts, no cloud, no telemetry.
        </p>

        <div className="divider" />

        <section>
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-gold-300/80 mb-1.5">Artwork license</h3>
          <p>
            Every vector in the Vault is generated in-house for this application and released under{' '}
            <span className="text-parchment">CC0 1.0 Universal</span> — free for personal and commercial
            use, with no attribution required. Designs you create are entirely yours.
          </p>
        </section>

        <section>
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-gold-300/80 mb-1.5">
            Fonts (SIL Open Font License)
          </h3>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-neutral-500">
            <li>Cinzel Decorative</li>
            <li>Cormorant Garamond</li>
            <li>Uncial Antiqua</li>
            <li>IM Fell English</li>
            <li>Metamorphous</li>
            <li>Almendra SC</li>
            <li>MedievalSharp</li>
            <li>Noto Sans Runic</li>
          </ul>
          <p className="mt-1.5 text-[10px] text-neutral-600">
            Fonts are bundled locally; they are never fetched at runtime.
          </p>
        </section>

        <section>
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-gold-300/80 mb-1.5">Open source</h3>
          <p>
            Built with Electron, React, Fabric.js, Zustand, Vite and Tailwind CSS. Application source is
            MIT licensed.
          </p>
        </section>

        {versions && (
          <div className="rounded-md border border-white/[0.06] bg-void-900/50 px-3 py-2 font-mono text-[10px] text-neutral-500">
            <span className="text-neutral-600">Electron</span> {versions.electron}
            <span className="mx-2 text-neutral-700">·</span>
            <span className="text-neutral-600">Chromium</span> {versions.chrome}
            <span className="mx-2 text-neutral-700">·</span>
            <span className="text-neutral-600">Node</span> {versions.node}
          </div>
        )}

        <p className="text-[9px] text-neutral-700">
          This application is an independent work. It is not affiliated with any other logo software vendor.
        </p>
      </div>
    </Modal>
  );
}
