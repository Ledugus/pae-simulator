// ═══════════════════════════════════════════════════════════════
// js/ui-config.js
// Only ui setup, no state.
// ═══════════════════════════════════════════════════════════════

'use strict';

const COURSE_PALETTE_DEFS = [
    { name: 'blue', hue: 224, saturation: 90, lightness: 65, textMode: 'light' },
    { name: 'orange', hue: 30, saturation: 80, lightness: 63, textMode: 'light' },
    { name: 'green', hue: 151, saturation: 60, lightness: 54, textMode: 'light' },
    { name: 'pink', hue: 336, saturation: 80, lightness: 63, textMode: 'light' },
    { name: 'cyan', hue: 195, saturation: 80, lightness: 63, textMode: 'dark' },
    { name: 'yellow', hue: 48, saturation: 80, lightness: 63, textMode: 'dark' },
    { name: 'red-orange', hue: 12, saturation: 80, lightness: 63, textMode: 'light' },
    { name: 'purple', hue: 271, saturation: 85, lightness: 65, textMode: 'light' },
    { name: 'periwinkle', hue: 228, saturation: 95, lightness: 84, textMode: 'dark' },
    { name: 'slate', hue: 224, saturation: 22, lightness: 58, textMode: 'light' },
];

/**
 * Builds a full option palette from a single hue + a couple of tuning knobs.
 * textMode controls contrast: vivid/dark backgrounds get white text ('light'),
 * pale/bright backgrounds (yellow, cyan, periwinkle...) need dark text ('dark').
 */
function buildPalette(hue, { saturation = 80, lightness = 63, textMode = 'light' } = {}) {
    const bg = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    const primary = `hsl(${hue}, ${saturation}%, ${Math.max(lightness - 12, 15)}%)`; // darker border/badge
    const badge = primary; // same role as primary in your original data - kept explicit for clarity
    const dark = textMode === 'light' ? '#ffffff' : `hsl(${hue}, 60%, 20%)`;
    const mid = textMode === 'light' ? `hsl(${hue}, 100%, 95%)` : dark; // light pastel tint, or same dark shade
    return { bg, primary, dark, mid, badge };
}
const OPTION_COLORS = COURSE_PALETTE_DEFS.map(def => ({
    name: def.name,
    ...buildPalette(def.hue, def),
}));
