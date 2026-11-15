/**
 * @file src/renderer/components/modals/TemplatesModal.jsx
 * @description Template gallery. Previews are composed live from the bundled
 * vector library, so a template is always in sync with the assets it uses.
 */

import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { TEMPLATES } from '../../assets/templates';
import { templatePreviewSvg } from '../../lib/applyTemplate';
import { IconSparkle } from '../ui/Icons';

/**
 * @param {{onClose: Function, onPick: (template: object) => void}} props
 */
export function TemplatesModal({ onClose, onPick }) {
  return (
    <Modal
      title="Start from a Template"
      subtitle="Every layout is fully editable — swap symbols, retype and recolour."
      onClose={onClose}
      icon={<IconSparkle size={18} />}
      width={760}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {TEMPLATES.map((template) => (
          <TemplateCard key={template.id} template={template} onPick={onPick} />
        ))}
      </div>
    </Modal>
  );
}

/**
 * @param {{template: object, onPick: Function}} props
 */
function TemplateCard({ template, onPick }) {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let alive = true;
    templatePreviewSvg(template, 200)
      .then((svg) => {
        if (alive) {
          setPreview(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [template]);

  return (
    <button
      type="button"
      onClick={() => onPick(template)}
      className="group text-left rounded-lg overflow-hidden border border-white/[0.07]
                 bg-void-900/60 transition-all hover:border-gold-400/50 hover:shadow-glow
                 focus-visible:border-gold-400"
    >
      <div className="aspect-[4/3] bg-void-950/60 grid place-items-center overflow-hidden">
        {preview ? (
          <img
            src={preview}
            alt=""
            className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="w-full h-full animate-pulse-slow bg-white/[0.03]" />
        )}
      </div>
      <div className="px-2.5 py-2 border-t border-white/[0.05]">
        <p className="text-[11px] font-medium text-neutral-200 group-hover:text-parchment">
          {template.name}
        </p>
        <p className="text-[9px] leading-snug text-neutral-600 line-clamp-2 mt-0.5">
          {template.blurb}
        </p>
      </div>
    </button>
  );
}
