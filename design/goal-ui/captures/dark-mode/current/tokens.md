# Declared goal colour tokens — static contrast evidence

Source runtime commit: `a3163a91be0394b17200f033d21a0efa53cee263` (main `eac7b8e4c544aef10ef7857a3369dea1e7cac50d` integrated). Documentation HEAD at calculation: `b6ad72257bd1fac55d03106e5f03f10fee839e6b`. Calculated on 2026-11-26 with Node `v24.4.0`, using native modules only. Both CSS files matched the pinned source when read.

Light values come from [client/src/index.css](../../../../../client/src/index.css), `:root` goal declarations at lines 284–295. Dark values come from [client/src/styles/goalDark.css](../../../../../client/src/styles/goalDark.css), `.dark .g-scope` at lines 5–34. Roles and thresholds follow [DESIGN.md](../../../../../DESIGN.md), [packet §3](../../../../../docs/plans/D-048-dark-mode.md), and the existing 27-colour contract in [goalTheme.test.tsx](../../../../../client/src/components/goal/goalTheme.test.tsx). This is an inventory of current declarations, not a palette proposal or approval claim.

All ratios below are `:1`, rounded to three decimal places after calculation. Five-surface lists are ordered **canvas / surface / sunken / hover / selected**; minima use all five, including duplicate light colours. Three-primary lists are ordered **default / hover / pressed**. Text requires **4.5:1**; meaningful control boundaries require **3:1**. Backgrounds, decorative dividers/artwork and scrims have **N/A** where no meaningful foreground requirement is defined; informational ratios there are not pass/fail assessments. The mark-2 **3:1** check is specifically the existing test contract, not a text requirement for the brand artwork.

| Token | Exact light value | Exact dark value | Foreground / backdrop and source role | Required ratio | Light contrast | Dark contrast |
|---|---|---|---|---|---|---|
| `--g-canvas` | `#ffffff` | `#0b0b0c` | Page background; ink foregrounds checked below on all five surfaces | N/A — background | N/A | N/A |
| `--g-surface` | `#ffffff` | `#121214` | Cards, bars, drawers and inputs; ink foregrounds checked below | N/A — background | N/A | N/A |
| `--g-surface-sunken` | `#fafafa` | `#0e0e10` | Rail, list headers and locked-panel background; ink foregrounds checked below | N/A — background | N/A | N/A |
| `--g-surface-hover` | `#f4f4f5` | `#1c1c20` | Hover tile background; ink foregrounds checked below | N/A — background | N/A | N/A |
| `--g-surface-selected` | `#f4f4f5` | `#242429` | Selected rows, active rail tiles and chips; ink foregrounds checked below | N/A — background | N/A | N/A |
| `--g-scrim` | `rgb(10 10 10 / 0.24)` | `rgb(0 0 0 / 0.6)` | Phone-sheet dimming overlay; no text foreground assigned. Example blend over `--g-surface` only | N/A — scrim | 1.741 informational | 1.075 informational |
| `--g-ink` | `#0a0a0a` | `#f4f4f5` | Primary text / all five surfaces | 4.5 | 19.798 / 19.798 / 18.968 / 18.012 / 18.012; **min 18.012** | 17.899 / 17.023 / 17.544 / 15.453 / 14.054; **min 14.054** |
| `--g-ink-2` | `#52525b` | `#a1a1aa` | Secondary text / all five surfaces | 4.5 | 7.730 / 7.730 / 7.406 / 7.032 / 7.032; **min 7.032** | 7.676 / 7.301 / 7.524 / 6.628 / 6.028; **min 6.028** |
| `--g-ink-3` | `#6b6b73` | `#8f8f99` | Metadata, inactive navigation, Withdrawn / all five surfaces | 4.5 | 5.282 / 5.282 / 5.060 / 4.805 / 4.805; **min 4.805** | 6.143 / 5.842 / 6.021 / 5.303 / 4.823; **min 4.823** |
| `--g-ink-inverse` | `#ffffff` | `#0a0a0a` | Inverse text / `--g-ink` filled areas, as used by landing components and pinned by the test; same foreground values as `--g-on-primary` for commit fills | 4.5 | 19.798 on ink; primary states below | 18.012 on ink; primary states below |
| `--g-hairline` | `#ebebeb` | `#27272a` | Dividers only, never control edges; example against `--g-surface` | N/A — decorative divider | 1.192 informational | 1.256 informational |
| `--g-control-edge` | `#8a8a8a` | `#8a8a8a` | Inputs, radios, keycaps, rings and grabbers / all five surfaces | 3 | 3.452 / 3.452 / 3.307 / 3.141 / 3.141; **min 3.141** | 5.699 / 5.420 / 5.586 / 4.920 / 4.475; **min 4.475** |
| `--g-primary` | `#0a0a0a` | `#fafafa` | Default commit fill: `--g-on-primary` text on this fill; fill boundary against all five surfaces | Text 4.5; boundary 3 | Text 19.798; boundary min 18.012 | Text 18.968; boundary min 14.800 |
| `--g-primary-hover` | `#262626` | `#e4e4e7` | Hover commit fill: `--g-on-primary` text on this fill; fill boundary against all five surfaces | Text 4.5; boundary 3 | Text 15.134; boundary min 13.768 | Text 15.603; boundary min 12.175 |
| `--g-primary-pressed` | `#404040` | `#d4d4d8` | Pressed commit fill: `--g-on-primary` text on this fill; fill boundary against all five surfaces | Text 4.5; boundary 3 | Text 10.368; boundary min 9.433 | Text 13.395; boundary min 10.452 |
| `--g-on-primary` | `#ffffff` | `#0a0a0a` | Commit label and keycap text / default, hover and pressed primary fills | 4.5 | 19.798 / 15.134 / 10.368; **min 10.368** | 18.968 / 15.603 / 13.395; **min 13.395** |
| `--g-on-primary-edge` | `rgb(255 255 255 / 0.4)` | `rgb(10 10 10 / 0.53)` | Transparent keycap border alpha-composited onto each primary fill, then compared with that same fill | 3 | 3.770 / 3.666 / 3.100; **min 3.100** | 4.067 / 3.871 / 3.710; **min 3.710** |
| `--g-trust` | `#1d4ed8` | `#60a5fa` | Verified badge-check and accompanying text only / `--g-surface` | 4.5 | 6.702 | 7.359 |
| `--g-emerald` | `#047857` | `#34d399` | Referred dot and label only / `--g-surface` | 4.5 | 5.484 | 9.733 |
| `--g-amber` | `#b45309` | `#fbbf24` | Pending dot and label, short clocks / `--g-surface` | 4.5 | 5.022 | 11.208 |
| `--g-crimson` | `#b91c1c` | `#f87171` | Ended-state dot and label, input errors / `--g-surface`; never the referrer queue | 4.5 | 6.470 | 6.764 |
| `--g-warm-1` | `#fce9da` | `#fce9da` | Peach decorative landing-hero gradient stop; light value maintained in dark source; no independent text foreground specified | N/A — decorative background | N/A | N/A |
| `--g-warm-2` | `#f6cfdd` | `#f6cfdd` | Rose decorative landing-hero gradient stop; light value maintained in dark source; no independent text foreground specified | N/A — decorative background | N/A | N/A |
| `--g-warm-3` | `#e7d6f4` | `#e7d6f4` | Lilac decorative landing-hero gradient stop; light value maintained in dark source; no independent text foreground specified | N/A — decorative background | N/A | N/A |
| `--g-mark-1` | `#c9c9c9` | `#3f3f46` | First silhouette in decorative V6-B brand artwork; example against `--g-surface`, not a standalone meaningful control or label | N/A — decorative artwork | 1.656 informational | 1.792 informational |
| `--g-mark-2` | `#8a8a8a` | `#71717a` | Middle V6-B silhouette / `--g-surface`; existing test checks visibility at 3:1 | 3 — existing mark test | 3.452 | 3.872 |
| `--g-mark-3` | `#0a0a0a` | `#f4f4f5` | Foreground V6-B silhouette in decorative brand artwork; example against `--g-surface`, not body text | N/A — decorative artwork | 19.798 informational | 17.023 informational |

The lowest ink ratio is **4.805426:1** in light (`ink-3` on hover/selected) and **4.823433:1** in dark (`ink-3` on selected). Control-edge minima are **3.140765:1** light and **4.474854:1** dark; selected is included even though the existing control-edge test covers only canvas, surface and hover. Trust/status checks here cover `--g-surface` only, matching that test's contract. All listed pairs with a required threshold pass it; this statement excludes every N/A row.

The warm hero keeps its light values as stated by `goalDark.css`; the three stops are backgrounds, not three newly assigned text colours. `GoalBrandMark.tsx` identifies the mark tokens as the V6-B silhouettes and renders their inline SVG artwork with `aria-hidden="true"`. No 4.5:1 text requirement is assigned to that artwork. Compound `--g-shadow-popover`, `--g-shadow-drawer` and `--g-focus-ring` values, plus layout/font/motion tokens, are excluded from the **27 colour tokens** under the existing test contract; this table does not verify focus-ring rendering.

## Calculation and reproduction

Alpha is composited in sRGB channel space first: `C = alpha * foreground + (1 - alpha) * backdrop`, per channel on the 0–255 scale. Do not round blended channels before calculating luminance. For `c = C / 255`, linearise with `c / 12.92` when `c <= 0.04045`, otherwise `((c + 0.055) / 1.055) ** 2.4`. Relative luminance is `Y = 0.2126 * r + 0.7152 * g + 0.0722 * b`; contrast is `(max(Y1, Y2) + 0.05) / (min(Y1, Y2) + 0.05)` ([WCAG relative luminance](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance), [contrast ratio](https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio)).

The light primary keycap edge blends to `rgb(108 108 108)`, `rgb(124.8 124.8 124.8)` and `rgb(140.4 140.4 140.4)` in default/hover/pressed order. The dark edge blends to `rgb(122.8 122.8 122.8)`, `rgb(112.46 112.46 113.87)` and `rgb(104.94 104.94 106.82)`. The example scrim-over-surface blends are `rgb(196.2 196.2 196.2)` light and `rgb(7.2 7.2 8)` dark. These fractional channels are calculation inputs, not new source declarations. The existing test rounds alpha blends to bytes; the default-edge checks still pass using that convention (light **3.770317**, dark **4.055211**), while this table consistently retains fractional channels.

Run from the repository root; the local Node executable used for this evidence is `/usr/local/bin/node`. This command reads the pinned CSS through Git and prints the token inventory, every measured pair and each alpha blend without changing files:

```sh
/usr/local/bin/node --input-type=module <<'NODE'
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const head = 'a3163a91be0394b17200f033d21a0efa53cee263';
const paths = ['client/src/index.css', 'client/src/styles/goalDark.css'];
const palettes = paths.map(path => {
  const css = execFileSync('git', ['show', `${head}:${path}`], { encoding: 'utf8' });
  const entries = [...css.matchAll(/(--g-[a-z0-9-]+)\s*:\s*([^;]+);/g)]
    .map(([, name, value]) => [name, value.trim().replace(/\s+/g, ' ')])
    .filter(([, value]) => /^(#[0-9a-f]{3,8}|rgb\(|rgba\(|hsl\(|hsla\(|oklch\()/i.test(value));
  assert.equal(entries.length, 27);
  assert.equal(new Set(entries.map(([name]) => name)).size, 27);
  return Object.fromEntries(entries);
});
assert.deepEqual(Object.keys(palettes[0]).sort(), Object.keys(palettes[1]).sort());
function parse(value) {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return { rgb: [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)), a: 1 };
  }
  const match = /^rgb\((\d+) (\d+) (\d+) \/ ([0-9.]+)\)$/.exec(value);
  assert(match, `Unsupported colour: ${value}`);
  return { rgb: match.slice(1, 4).map(Number), a: Number(match[4]) };
}
function blend(foreground, backdrop) {
  const f = parse(foreground), b = parse(backdrop);
  assert.equal(b.a, 1);
  return f.rgb.map((c, i) => f.a * c + (1 - f.a) * b.rgb[i]);
}
function luminance(rgb) {
  const [r, g, b] = rgb.map(channel => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(rgb, backdrop) {
  const a = luminance(rgb), b = luminance(parse(backdrop).rgb);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const ratio = (f, b) => contrast(blend(f, b), b);
const surfaces = ['canvas', 'surface', 'surface-sunken', 'surface-hover', 'surface-selected'];
const states = ['primary', 'primary-hover', 'primary-pressed'];
const show = values => values.map(v => v.toFixed(6)).join(' / ');
console.log(`Source ${head}; 27 unique colour tokens per palette; matching sets.`);
for (const [i, palette] of palettes.entries()) {
  const token = name => palette[`--g-${name}`];
  console.log(i === 0 ? 'LIGHT' : 'DARK', palette);
  for (const name of ['ink', 'ink-2', 'ink-3', 'control-edge']) {
    const values = surfaces.map(s => ratio(token(name), token(s)));
    console.log(name, show(values), 'min', Math.min(...values).toFixed(6));
  }
  for (const name of ['trust', 'emerald', 'amber', 'crimson', 'hairline', 'mark-1', 'mark-2', 'mark-3']) {
    console.log(name, 'on surface', ratio(token(name), token('surface')).toFixed(6));
  }
  console.log('inverse on ink', ratio(token('ink-inverse'), token('ink')).toFixed(6));
  for (const state of states) {
    const rgb = blend(token('on-primary-edge'), token(state));
    const fill = surfaces.map(s => ratio(token(state), token(s)));
    console.log(state, 'text', ratio(token('on-primary'), token(state)).toFixed(6),
      'fill min', Math.min(...fill).toFixed(6), 'edge blend', rgb,
      'edge', contrast(rgb, token(state)).toFixed(6),
      'rounded-byte edge', contrast(rgb.map(Math.round), token(state)).toFixed(6));
  }
  const scrim = blend(token('scrim'), token('surface'));
  console.log('scrim on surface', scrim, contrast(scrim, token('surface')).toFixed(6));
}
NODE
```

**Unverified by this table:** browser-computed colours, cascade/opacity overrides, gradients and artwork as rendered, hover/pressed interactions, focus appearance, transient theme-switch contrast, navigation/pre-paint containment, 1280/390 captures, light parity, deployed release and product acceptance. Static declaration calculations do not certify those states or clear the D-230/D-333 owner hold.
