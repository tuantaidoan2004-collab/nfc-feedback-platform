/**
 * Every stylesheet the guest page wears, in order: the page, the skin every template shares, then each template
 * version's frozen look (versions.ts), after skin.css so a version's tokens override the defaults. Every selector in
 * them is scoped to `.guest` (tests/contracts/skin.spec.ts), so any page may load them without being restyled.
 *
 * The dashboard loads them too (pages-panel.tsx): its page list frames the guest page, and under `next dev` a route
 * that brings new global CSS reloads every open page -- the dashboard included -- the first time it is framed.
 */
import './guest-page.css';
import './skin.css';
// Each template version's frozen look (versions.ts). After skin.css, so a version's tokens override the defaults.
import './skins/standard.v1.css';
import './skins/minimal.v1.css';
import './skins/glass.v1.css';
import './skins/deco.v1.css';
import './skins/spotlight.v1.css';
import './skins/big-button.v1.css';
