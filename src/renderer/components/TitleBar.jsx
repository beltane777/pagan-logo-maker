/**
 * @file src/renderer/components/TitleBar.jsx
 * @description The custom top chrome: brand mark, project name (inline
 * editable), quick-action toolbar (new / save / export / undo / redo) and the
 * About + license entry point.
 *
 * On macOS the window uses `titleBarStyle: 'hiddenInset'`, so we reserve space
 * for the traffic lights and make the strip draggable via `-webkit-app-region`.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useDesignStore } from '../store/useDesignStore';
import { Toolbar } from './Toolbar';

/**
 * @param {{onNew: Function, onSave: Function, onExport: Function, onAbout: Function,
 *   canUndo: boolean, canRedo: boolean, onUndo: Function, onRedo: Function}} props
 */
export function TitleBar({ onNew, onSave, onExport, onAbout, canUndo, canRedo, onUndo, onRedo }) {
  const projectName = useDesignStore((s) => s.ui.projectName);
  const dirty = useDesignStore((s) => s.ui.dirty);
  const setUi = useDesignStore((s) => s.setUi);
  const setMeta = useDesignStore((s) => s.setMeta);
  const isMac = window.desktop?.platform === 'darwin';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);
  const inputRef = useRef(null);

  useEffect(() => setDraft(projectName), [projectName]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  /** Commit the inline rename. */
  const commit = () => {
    const name = draft.trim() || 'Untitled Sigil';
    setUi({ projectName: name, dirty: name !== projectName ? true : dirty });
    setMeta({ name });
    setEditing(false);
  };

  return (
    <header
      className="relative z-30 flex h-12 shrink-0 items-center gap-3 border-b border-gold-400/10
                 bg-gradient-to-b from-void-800 to-void-850/95 px-3 select-none"
      style={{ WebkitAppRegion: 'drag', paddingLeft: isMac ? 78 : 12 }}
    >
      {/* Brand ------------------------------------------------------- */}
      <div className="flex items-center gap-2 shrink-0">
        <BrandMark />
        <div className="leading-none hidden sm:block">
          <p className="font-display text-[13px] tracking-[0.16em] text-parchment/95">PAGAN</p>
          <p className="text-[8px] uppercase tracking-[0.42em] text-gold-400/70 mt-[3px]">Logo Maker</p>
        </div>
      </div>

      <div className="h-6 w-px bg-gold-400/15" />

      {/* Project name ------------------------------------------------ */}
      <div className="no-drag flex items-center gap-1.5 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(projectName);
                setEditing(false);
              }
            }}
            className="field w-44 text-[12px]"
            aria-label="Project name"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Rename project"
            className="group flex items-center gap-1.5 min-w-0 px-1.5 h-7 rounded-md hover:bg-white/[0.04] transition-colors"
          >
            <span className="truncate text-[12px] text-neutral-300 group-hover:text-parchment max-w-[220px]">
              {projectName}
            </span>
            {dirty && (
              <span
                title="Unsaved changes"
                className="w-[5px] h-[5px] rounded-full bg-gold-400 shrink-0 animate-pulse-slow"
              />
            )}
          </button>
        )}
      </div>

      {/* Quick actions ------------------------------------------------ */}
      <div className="no-drag ml-auto flex items-center gap-1">
        <Toolbar
          onNew={onNew}
          onSave={onSave}
          onExport={onExport}
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
        <div className="h-5 w-px bg-white/10 mx-1" />
        <button type="button" className="btn btn-ghost btn-icon" title="About & License" onClick={onAbout}>
          <span className="font-serif text-[13px] leading-none">ⓘ</span>
        </button>
      </div>
    </header>
  );
}

/** The Sigil brand mark — a star-in-crescent drawn inline. */
function BrandMark() {
  return (
    <div className="relative w-7 h-7 grid place-items-center">
      <svg viewBox="0 0 32 32" className="w-7 h-7" aria-hidden="true">
        <defs>
          <linearGradient id="brand-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f7e7a8" />
            <stop offset="0.45" stopColor="#d4af4f" />
            <stop offset="1" stopColor="#8f6d20" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="14" fill="none" stroke="url(#brand-g)" strokeWidth="1.4" opacity="0.75" />
        <path
          d="M16 5.5l2.6 6.9 7.4.4-5.8 4.6 1.9 7.2L16 20.3l-6.1 4.3 1.9-7.2L6 12.8l7.4-.4L16 5.5z"
          fill="none"
          stroke="url(#brand-g)"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="2.1" fill="url(#brand-g)" />
      </svg>
    </div>
  );
}
