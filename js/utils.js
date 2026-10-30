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
const botDelay = ms => wait(ms * botSpeed);
const AF = reduceMotion ? 0.35 : 1; // множник тривалості анімацій
function plural(n, a, b, c) { const m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; }
const EMOJI_FONT = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';
