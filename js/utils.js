'use strict';

/* ============================== УТИЛІТИ ============================== */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wait = ms => new Promise(r => setTimeout(r, ms));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let botSpeed = 1, ANIM = 1.5;
async function botDelay(ms) { await wait(ms * botSpeed); while (typeof menuPaused === 'function' && menuPaused()) await wait(250); }
const AF = reduceMotion ? 0.35 : 1; // множник тривалості анімацій
function plural(n, a, b, c) { const m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; }
const EMOJI_FONT = '"Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif';
/* маленькі векторні значки — однаково видно на всіх пристроях */
const ICO = {
  sword: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l5-5M15 3h6v6L10 20l-3-3z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M5 14l5 5M3 21l2-2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  m: '<svg class="ico" viewBox="0 0 24 24" aria-label="чоловік"><circle cx="10" cy="14" r="5.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M14 10l6-6M15 4h5v5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  f: '<svg class="ico" viewBox="0 0 24 24" aria-label="жінка"><circle cx="12" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 14.5V22M8.5 18.5h7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
};
