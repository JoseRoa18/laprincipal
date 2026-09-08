/**
 * One accent hue for every chart mark and bar in the reports. The pair was
 * validated for the light card surface and the dark one (contrast >= 3:1,
 * lightness band, chroma floor). Apply on a wrapper; marks use
 * `var(--viz-accent)` or `bg-(--viz-accent)`.
 */
export const VIZ_ROOT = "[--viz-accent:#2a78d6] dark:[--viz-accent:#3987e5]";
