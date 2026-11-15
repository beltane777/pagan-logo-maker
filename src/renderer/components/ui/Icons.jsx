/**
 * @file src/renderer/components/ui/Icons.jsx
 * @description Hand-drawn monoline icon set (24×24, `currentColor`). Bundled
 * inline rather than pulled from an icon package so the app has zero network
 * dependencies and the visual language stays consistent with the brand.
 */

import React from 'react';

/**
 * Shared SVG wrapper.
 * @param {{children: React.ReactNode, size?: number, className?: string, strokeWidth?: number}} props
 */
const Svg = ({ children, size = 16, className = '', strokeWidth = 1.6 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconNew = (p) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M12 12v5M9.5 14.5h5" />
  </Svg>
);

export const IconSave = (p) => (
  <Svg {...p}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <path d="M17 21v-8H7v8M7 3v5h8" />
  </Svg>
);

export const IconExport = (p) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5-5 5 5M12 5v12" />
  </Svg>
);

export const IconUndo = (p) => (
  <Svg {...p}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12H9" />
  </Svg>
);

export const IconRedo = (p) => (
  <Svg {...p}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h5" />
  </Svg>
);

export const IconSearch = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4.3-4.3" />
  </Svg>
);

export const IconPlus = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconImport = (p) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5 5-5-5M12 13V3" />
  </Svg>
);

export const IconChevron = ({ className = '', size = 14, open = false }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    className={`transition-transform duration-200 ${open ? 'rotate-90' : ''} ${className}`}
    aria-hidden="true"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const IconEye = ({ off = false, ...p }) => (
  <Svg {...p}>
    {off ? (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.6 6.2A9 9 0 0 1 21 12a17 17 0 0 1-2.4 2.9M6.3 7.9A17 17 0 0 0 3 12a9 9 0 0 0 12.7 4.1" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      </>
    ) : (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </>
    )}
  </Svg>
);

export const IconLock = ({ locked = false, ...p }) => (
  <Svg {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    {locked ? <path d="M8 11V7a4 4 0 0 1 8 0v4" /> : <path d="M8 11V7a4 4 0 0 1 7.5-2" />}
  </Svg>
);

export const IconGrip = (p) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
  </Svg>
);

export const IconTrash = (p) => (
  <Svg {...p}>
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    <path d="M10 11v5M14 11v5" />
  </Svg>
);

export const IconCopy = (p) => (
  <Svg {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </Svg>
);

export const IconLayers = (p) => (
  <Svg {...p}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5M3 18l9 5 9-5" />
  </Svg>
);

export const IconText = (p) => (
  <Svg {...p}>
    <path d="M4 6V4h16v2M12 4v16M9 20h6" />
  </Svg>
);

export const IconShapes = (p) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="4.5" />
    <rect x="12" y="12" width="8.5" height="8.5" rx="1.5" />
  </Svg>
);

export const IconSymbol = (p) => (
  <Svg {...p}>
    <path d="M12 2l2.6 6.3 6.8.5-5.2 4.4 1.6 6.7L12 16.2 6.2 20l1.6-6.7L2.6 8.8l6.8-.5L12 2z" />
  </Svg>
);

export const IconImage = (p) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.8" />
    <path d="M21 16l-5-5-9 9" />
  </Svg>
);

export const IconGrid = (p) => (
  <Svg {...p}>
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </Svg>
);

export const IconMagnet = (p) => (
  <Svg {...p}>
    <path d="M6 18V9a6 6 0 0 1 12 0v9" />
    <path d="M6 13h4M14 13h4" />
    <path d="M4 18h4v3H4zM16 18h4v3h-4z" />
  </Svg>
);

export const IconRulers = (p) => (
  <Svg {...p}>
    <rect x="2" y="8" width="20" height="8" rx="1" transform="rotate(-45 12 12)" />
    <path d="M9 9l1.5 1.5M12 12l1.5 1.5" />
  </Svg>
);

export const IconZoomIn = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M11 8v6M8 11h6M20 20l-4.3-4.3" />
  </Svg>
);

export const IconZoomOut = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M8 11h6M20 20l-4.3-4.3" />
  </Svg>
);

export const IconFit = (p) => (
  <Svg {...p}>
    <path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5" />
  </Svg>
);

export const IconClose = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconCheck = (p) => (
  <Svg {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </Svg>
);

export const IconInfo = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5h.01" />
  </Svg>
);

export const IconMoon = (p) => (
  <Svg {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Svg>
);

export const IconAlign = ({ mode = 'center', ...p }) => {
  const bars =
    mode === 'left'
      ? ['M4 4v16', 'M8 9h9M8 15h6']
      : mode === 'right'
        ? ['M20 4v16', 'M7 9h9M10 15h6']
        : mode === 'top'
          ? ['M4 4h16', 'M9 8v9M15 8v6']
          : mode === 'bottom'
            ? ['M4 20h16', 'M9 7v9M15 10v6']
            : ['M12 3v18', 'M6 10h12M6 14h12'];
  return (
    <Svg {...p}>
      {bars.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </Svg>
  );
};

export const IconGroup = (p) => (
  <Svg {...p}>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="3" width="8" height="8" rx="1" />
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
  </Svg>
);

export const IconUngroup = (p) => (
  <Svg {...p}>
    <rect x="2" y="2" width="7" height="7" rx="1" />
    <rect x="15" y="15" width="7" height="7" rx="1" />
    <path d="M12 12h.01M9 9l6 6" strokeDasharray="2 2" />
  </Svg>
);

export const IconSparkle = (p) => (
  <Svg {...p}>
    <path d="M12 3l1.8 4.9L19 9.6l-4.6 3 1.3 5.4L12 15.4 8.3 18l1.3-5.4-4.6-3 5.2-1.7L12 3z" />
  </Svg>
);

export const IconFolder = (p) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </Svg>
);

export const IconMoveUp = (p) => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);

export const IconMoveDown = (p) => (
  <Svg {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Svg>
);

/** Map of layer kind → icon component, used by the layer panel. */
export const KIND_ICONS = {
  symbol: IconSymbol,
  text: IconText,
  shape: IconShapes,
  image: IconImage,
  group: IconGroup,
  background: IconImage,
};
