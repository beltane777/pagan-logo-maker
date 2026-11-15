/**
 * @file src/renderer/components/ui/Controls.jsx
 * @description Small, reusable form controls used throughout the inspector.
 * Every control is fully controlled (value + onChange) so they can be driven by
 * either local component state or the Zustand store.
 */

import React, { useId } from 'react';
import { IconChevron } from './Icons';

/**
 * Labelled row wrapper — keeps label/control rhythm identical everywhere.
 * @param {{label?: string, hint?: string, children: React.ReactNode, className?: string, inline?: boolean}} props
 */
export function Row({ label, hint, children, className = '', inline = false }) {
  return (
    <div className={`${inline ? 'flex items-center gap-2' : 'space-y-1'} ${className}`}>
      {label && (
        <span className="block text-[10px] uppercase tracking-[0.14em] text-neutral-500 whitespace-nowrap">
          {label}
        </span>
      )}
      {children}
      {hint && <p className="text-[10px] text-neutral-600 leading-snug">{hint}</p>}
    </div>
  );
}

/**
 * Slider with a live numeric readout.
 * @param {{
 *   label: string, value: number, min: number, max: number, step?: number,
 *   onChange: (v:number)=>void, onCommit?: ()=>void, unit?: string,
 *   format?: (v:number)=>string, disabled?: boolean
 * }} props
 */
export function Slider({ label, value, min, max, step = 1, onChange, onCommit, unit = '', format, disabled }) {
  const pct = ((value - min) / (max - min)) * 100;
  const display = format ? format(value) : `${Math.round(value * 100) / 100}${unit}`;
  return (
    <div className={disabled ? 'opacity-40 pointer-events-none' : ''}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">{label}</span>
        <span className="text-[10px] text-gold-300/80 tnum font-mono">{display}</span>
      </div>
      <input
        type="range"
        className="slider"
        style={{ '--pct': `${pct}%` }}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        aria-label={label}
      />
    </div>
  );
}

/**
 * Numeric input with stepper affordances and commit-on-blur semantics.
 * @param {{label?: string, value: number, min?: number, max?: number, step?: number,
 *   onChange: (v:number)=>void, onCommit?: ()=>void, unit?: string, disabled?: boolean}} props
 */
export function NumberField({ label, value, min = -99999, max = 99999, step = 1, onChange, onCommit, unit, disabled }) {
  return (
    <Row label={label}>
      <div className="relative">
        <input
          type="number"
          className="field tnum pr-6"
          value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        {unit && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-neutral-600">
            {unit}
          </span>
        )}
      </div>
    </Row>
  );
}

/**
 * Colour picker with hex entry. Uses the native picker for the swatch and a
 * text field for exact values (designers always want the hex).
 * @param {{label: string, value: string, onChange: (v:string)=>void, onCommit?: ()=>void}} props
 */
export function ColorField({ label, value, onChange, onCommit }) {
  const id = useId();
  const safe = /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#d4af4f';
  return (
    <Row label={label}>
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={id}
          className="relative w-7 h-7 rounded-md border border-white/10 cursor-pointer overflow-hidden shrink-0
                     shadow-[inset_0_0_0_1px_rgba(0,0,0,0.5)]"
          style={{ background: safe }}
          title="Pick colour"
        >
          <input
            id={id}
            type="color"
            value={safe}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        <input
          className="field font-mono uppercase"
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </div>
    </Row>
  );
}

/**
 * Select control.
 * @param {{label?: string, value: string, options: Array<{value:string,label:string}>,
 *   onChange: (v:string)=>void, className?: string}} props
 */
export function Select({ label, value, options, onChange, className = '' }) {
  return (
    <Row label={label} className={className}>
      <div className="relative">
        <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </Row>
  );
}

/**
 * Segmented toggle group.
 * @param {{options: Array<{value:string,label:React.ReactNode,title?:string}>,
 *   value:string, onChange:(v:string)=>void, size?: 'sm'|'md'}} props
 */
export function Segmented({ options, value, onChange, size = 'md' }) {
  const pad = size === 'sm' ? 'px-1.5 h-6 text-[10px]' : 'px-2.5 h-7 text-[11px]';
  return (
    <div className="inline-flex rounded-md bg-void-900/80 border border-white/[0.06] p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`${pad} rounded-[5px] font-medium transition-colors
            ${
              value === o.value
                ? 'bg-gold-400/15 text-gold-200 shadow-[inset_0_0_0_1px_rgba(212,175,79,0.3)]'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Collapsible section used by the inspector.
 * @param {{title: string, children: React.ReactNode, defaultOpen?: boolean, right?: React.ReactNode}} props
 */
export function Section({ title, children, defaultOpen = true, right }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="border-b border-white/[0.05]">
      <div className="flex items-center">
        <button type="button" onClick={() => setOpen((v) => !v)} className="acc-trigger flex-1">
          <IconChevron open={open} className="text-gold-400/50" />
          <span>{title}</span>
        </button>
        {right && <div className="pr-2">{right}</div>}
      </div>
      {open && <div className="px-3 pb-3 space-y-2.5 animate-fade-in">{children}</div>}
    </section>
  );
}

/**
 * Switch toggle.
 * @param {{checked: boolean, onChange: (v:boolean)=>void, label?: string, disabled?: boolean}} props
 */
export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0
        ${checked ? 'bg-gold-500/80' : 'bg-void-600'}
        ${disabled ? 'opacity-40' : ''}`}
    >
      <span
        className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-gradient-to-b from-white to-neutral-300
          shadow transition-all duration-150 ${checked ? 'left-[16px]' : 'left-[2px]'}`}
      />
    </button>
  );
}

/**
 * Empty-state block for panels with nothing to show.
 * @param {{icon?: React.ReactNode, title: string, body?: string, action?: React.ReactNode}} props
 */
export function EmptyState({ icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 gap-2">
      {icon && <div className="text-gold-400/30 mb-1">{icon}</div>}
      <p className="text-[11px] font-medium text-neutral-400">{title}</p>
      {body && <p className="text-[10px] text-neutral-600 leading-relaxed max-w-[190px]">{body}</p>}
      {action}
    </div>
  );
}
