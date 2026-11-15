/**
 * @file src/renderer/components/modals/ExportModal.jsx
 * @description Export dialog — format, resolution, transparency, and a live
 * pixel-size readout so the exported file is never a surprise.
 */

import React, { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Segmented, Row, Switch, Slider } from '../ui/Controls';
import { SIZE_PRESETS, outputSize, exportRaster, exportVector, describePixels, safeName } from '../../lib/exporters';
import { IconExport } from '../ui/Icons';
import { useDesignStore } from '../../store/useDesignStore';

/**
 * @param {{onClose: Function, engineRef: React.MutableRefObject<any>}} props
 */
export function ExportModal({ onClose, engineRef }) {
  const artboard = useDesignStore((s) => s.doc.artboard);
  const projectName = useDesignStore((s) => s.ui.projectName);
  const toast = useDesignStore((s) => s.toast);

  const [format, setFormat] = useState('png');
  const [multiplier, setMultiplier] = useState(2);
  const [transparent, setTransparent] = useState(false);
  const [busy, setBusy] = useState(false);

  const size = useMemo(() => outputSize(artboard, multiplier), [artboard, multiplier]);

  /** Run the export and close on success. */
  const run = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setBusy(true);
    try {
      const result =
        format === 'svg'
          ? await exportVector(engine, { projectName, transparent })
          : await exportRaster(engine, {
              format,
              multiplier,
              transparent: format === 'png' && transparent,
              projectName,
            });

      if (result?.canceled) {
        toast('Export cancelled', 'info');
      } else if (result?.error) {
        toast(`Export failed: ${result.error}`, 'error');
      } else {
        toast(`Exported ${safeName(projectName)}.${format === 'jpeg' ? 'jpg' : format}`, 'ok');
        onClose();
      }
    } catch (err) {
      toast(`Export failed: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export Design"
      subtitle="Vector-sharp output up to 4× the artboard"
      onClose={onClose}
      icon={<IconExport size={18} />}
      width={520}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-gold" onClick={run} disabled={busy}>
            {busy ? 'Rendering…' : `Export ${format.toUpperCase()}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Row label="Format">
          <Segmented
            value={format}
            onChange={(v) => setFormat(v)}
            options={[
              { value: 'png', label: 'PNG', title: 'Lossless raster with alpha' },
              { value: 'jpeg', label: 'JPEG', title: 'Compact photo raster' },
              { value: 'svg', label: 'SVG', title: 'Editable vector' },
            ]}
          />
        </Row>

        {format !== 'svg' ? (
          <>
            <Row label="Resolution">
              <div className="grid grid-cols-2 gap-1.5">
                {SIZE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setMultiplier(p.multiplier)}
                    className={`rounded-md border px-2 py-1.5 text-left transition-all
                      ${
                        multiplier === p.multiplier
                          ? 'border-gold-400/60 bg-gold-400/10'
                          : 'border-white/[0.07] bg-void-900/50 hover:border-gold-400/30'
                      }`}
                  >
                    <span className="block text-[11px] font-medium text-neutral-200">{p.label}</span>
                    <span className="block text-[9px] text-neutral-600">{p.note}</span>
                  </button>
                ))}
              </div>
            </Row>

            <Slider
              label="Custom scale"
              value={multiplier}
              min={0.5}
              max={8}
              step={0.5}
              onChange={setMultiplier}
              format={(v) => `${v}×`}
            />

            {format === 'png' && (
              <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-void-900/40 px-3 py-2">
                <div>
                  <p className="text-[11px] text-neutral-300">Transparent background</p>
                  <p className="text-[9px] text-neutral-600">Keep alpha so the mark drops onto any surface.</p>
                </div>
                <Switch checked={transparent} onChange={setTransparent} label="Transparent background" />
              </div>
            )}

            <div className="rounded-md border border-gold-400/20 bg-gold-400/[0.05] px-3 py-2 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.14em] text-gold-300/70">Output</span>
              <span className="text-[12px] font-mono tnum text-parchment">
                {size.width} × {size.height} px
                <span className="text-neutral-500 ml-1.5">({describePixels(size.width * size.height)})</span>
              </span>
            </div>
          </>
        ) : (
          <div className="rounded-md border border-gold-400/20 bg-gold-400/[0.05] px-3 py-2">
            <p className="text-[11px] text-neutral-300">Vector export includes every layer as editable paths.</p>
            <p className="text-[9px] text-neutral-600 mt-0.5">
              Text is embedded as outlined glyph groups — open in Illustrator, Affinity or Inkscape.
            </p>
          </div>
        )}

        <p className="text-[9px] leading-relaxed text-neutral-600">
          Grid and guide overlays are never included in exports.
        </p>
      </div>
    </Modal>
  );
}
