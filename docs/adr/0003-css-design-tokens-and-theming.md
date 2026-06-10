# CSS design tokens and theming

The client (Create React App) styles components with plain CSS files. We decided
theming is done via **CSS custom-property design tokens** defined in
`client/src/index.css` (`:root`), and **component CSS references tokens only — no
raw hex codes**. We chose this over a CSS-in-JS library or a component-framework
theme system (styled-components, Tailwind, MUI) to avoid adding a styling
dependency/build layer to an otherwise plain CRA app; the trade-off is that
theming is convention-enforced rather than type-checked.

## Dark mode

Token *values* are overridden for dark mode — the structural chrome (surfaces,
text, borders, primary/semantic colors) flips automatically because components
reference tokens. Activation is a three-way user choice (Auto / Light / Dark):

- `prefers-color-scheme: dark` drives Auto.
- A `data-theme` attribute on the root element lets the user override the OS
  setting; an explicit Light choice wins even when the OS is dark. The choice is
  persisted in `localStorage`.

So the dark token values are applied both by the media query (Auto) and by
`[data-theme="dark"]` (explicit), and `[data-theme="light"]` forces light.

## Deliberate exemptions

- **Data-visualisation colors are not themed.** The Upgrade-test heatmap's
  pass→fail (red→green) gradient *encodes information*, so it keeps its vivid
  colors in dark mode rather than being muted. Do not "fix" it by tokenising it.
- Decorative tints (status pills, stat-box gradients) *are* tokenised and
  darkened so they sit correctly on dark surfaces.

## Contrast

Text tokens target **WCAG AA** (4.5:1 normal, 3:1 large/secondary) against their
surfaces in both themes.

## Consequences

- New styles must use existing tokens (or add a new token) — not raw hex.
- Adding a CSS-in-JS or theme-library dependency would supersede this ADR.
- A new themeable color must be added as a token with both light and dark values.
