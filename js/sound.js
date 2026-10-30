'use strict';

/* ============================== ЗВУК: синтез без жодних файлів ============================== */
const SND = { ctx: null, musicVol: .35, sfxVol: .7, muted: false, timer: 0, next: 0, step: 0, skin: null, mel: 7, last: {} };
try { const sv = JSON.parse(localStorage.getItem('pdsv-sound') || '{}'); if (typeof sv.m === 'number') SND.musicVol = sv.m; if (typeof sv.s === 'number') SND.sfxVol = sv.s; if (sv.mute) SND.muted = true; } catch (e) { /* сховище недоступне */ }
function saveSound() { try { localStorage.setItem('pdsv-sound', JSON.stringify({ m: SND.musicVol, s: SND.sfxVol, mute: SND.muted })); } catch (e) { /* сховище недоступне */ } }
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function ensureAudio() {
  if (SND.ctx) { if (SND.ctx.state === 'suspended' && !document.hidden) SND.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  let c; try { c = SND.ctx = new AC(); } catch (e) { return; }
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(c.destination);
  SND.master = c.createGain(); SND.master.connect(comp);
  SND.music = c.createGain(); SND.music.connect(SND.master);
  SND.sfx = c.createGain(); SND.sfx.connect(SND.master);
  const len = Math.floor(c.sampleRate * 2.8), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
  SND.rev = c.createConvolver(); SND.rev.buffer = ir; SND.rev.connect(SND.music);
  SND.send = c.createGain(); SND.send.gain.value = .25; SND.send.connect(SND.rev);
  SND.mout = c.createGain(); SND.mout.connect(SND.music); SND.mout.connect(SND.send);
  SND.sfxSend = c.createGain(); SND.sfxSend.gain.value = .12; SND.sfxSend.connect(SND.rev);
  const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; SND.noise = nb;
  applyVolumes();
  SND.next = c.currentTime + .15; SND.timer = setInterval(scheduleMusic, 80);
}
function applyVolumes() {
  if (!SND.ctx) return; const t = SND.ctx.currentTime;
  SND.master.gain.setTargetAtTime(SND.muted ? 0 : 1, t, .05);
  SND.music.gain.setTargetAtTime(SND.musicVol * 2, t, .1);
  SND.sfx.gain.setTargetAtTime(SND.sfxVol * 1.7, t, .05);
}
/* --- інструменти --- */
function tone(t, f, dur, o = {}) {
  const c = SND.ctx, out = o.out || SND.mout, a = o.a || .006;
  const osc = c.createOscillator(); osc.type = o.type || 'triangle'; osc.frequency.setValueAtTime(f, t);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f * o.glide), t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || .1, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + dur);
  let node = osc;
  if (o.cutoff) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.cutoff, t); if (o.cutTo) fl.frequency.exponentialRampToValueAtTime(o.cutTo, t + dur); fl.Q.value = o.q || .7; osc.connect(fl); node = fl; }
  if (o.vib) { const l = c.createOscillator(); l.frequency.value = o.vibRate || 5; const lg = c.createGain(); lg.gain.value = f * o.vib; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + a + dur + .05); }
  node.connect(g); g.connect(out); if (o.send) g.connect(o.send);
  osc.start(t); osc.stop(t + a + dur + .05);
}
function noise(t, dur, o = {}) {
  const c = SND.ctx, s = c.createBufferSource(); s.buffer = SND.noise; s.loop = true;
  const f = c.createBiquadFilter(); f.type = o.type || 'highpass'; f.frequency.setValueAtTime(o.freq || 6000, t); if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, (o.freq || 6000) * o.sweep), t + dur); f.Q.value = o.q || 1;
  const g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || .1, t + (o.a || .003)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(o.out || SND.sfx); s.start(t, Math.random() * 1.5); s.stop(t + dur + .05);
}
const pluck = (t, f, dur, vol, out) => tone(t, f, dur, { type: 'triangle', vol, cutoff: 2600, cutTo: 700, out });
const bell = (t, f, vol, out) => { tone(t, f, 1.2, { type: 'sine', vol, out }); tone(t, f * 2.76, .5, { type: 'sine', vol: vol * .35, out }); tone(t, f * 5.4, .25, { type: 'sine', vol: vol * .15, out }); };
const kick = (t, vol, out) => tone(t, 120, .28, { type: 'sine', vol, glide: .35, out });
const tom = (t, f, vol, out) => tone(t, f, .35, { type: 'sine', vol, glide: .6, out });
const snare = (t, vol, out) => { noise(t, .16, { type: 'bandpass', freq: 1900, q: .8, vol, out: out || SND.mout }); tone(t, 190, .1, { type: 'triangle', vol: vol * .5, out }); };
const hat = (t, vol, out) => noise(t, .05, { type: 'highpass', freq: 7500, vol, out: out || SND.mout });
const shaker = (t, vol, out) => noise(t, .07, { type: 'bandpass', freq: 5200, q: 1.4, vol, out: out || SND.mout });
function padChord(t, notes, dur, vol, cutoff = 1200, type = 'sawtooth') {
  notes.forEach(n => { [-7, 7].forEach(dt => tone(t, mtof(n), dur, { type, vol: vol / notes.length, a: dur * .3, detune: dt, cutoff })); });
}
const R = (a, b) => { const x = Math.sin(a * 12.9898 + b * 78.233 + 4.17) * 43758.5453; return x - Math.floor(x); };
function walk(scale, root, bar, p, chordTones) {
  const steps = [-2, -1, -1, 1, 1, 2, 0, 3, -3];
  SND.mel = clamp(SND.mel + steps[Math.floor(R(bar, p) * steps.length)], 2, 12);
  let n = root + scale[SND.mel % scale.length] + 12 * Math.floor(SND.mel / scale.length);
  if (p % 8 === 0 && chordTones) { const near = chordTones.map(x => x + 12 * Math.round((n - x) / 12)); n = near.sort((a, b) => Math.abs(a - n) - Math.abs(b - n))[0]; }
  return n;
}
/* --- музика для кожного столу --- */
const MUSIC = {
  tavern: { desc: 'корчемна мелодія з лютнею й бубном', bpm: 104, wet: .22, swing: .1, scale: [0, 2, 3, 5, 7, 8, 10], root: 62,
    prog: [[50, 53, 57], [48, 52, 55], [46, 50, 53], [45, 49, 52]],
    play(st, t, d) {
      const bar = st >> 4, p = st & 15, ch = this.prog[bar % 4];
      if (p % 4 === 0) tone(t, mtof(ch[0] - 12), d * 3.6, { type: 'triangle', vol: .16, cutoff: 800 });
      if (p === 0 || p === 8) tom(t, 95, .2); if (p === 6 || p === 14) tom(t, 150, .08);
      if (p % 2 === 0) shaker(t, p % 4 ? .025 : .04);
      if (p === 0) ch.forEach((n, i) => pluck(t + i * .03, mtof(n + 12), d * 14, .045));
      if (p % 2 === 0 && R(bar, p) < .74) pluck(t, mtof(walk(this.scale, this.root, bar, p, ch)), d * 2.2, .1);
    } },
  newyear: { desc: 'святкові дзвіночки й санні бубонці', bpm: 128, wet: .3, swing: 0, scale: [0, 2, 4, 5, 7, 9, 11], root: 72,
    prog: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    play(st, t, d) {
      const bar = st >> 4, p = st & 15, ch = this.prog[bar % 4];
      if (p % 4 === 0) pluck(t, mtof(ch[p % 8 ? 2 : 0] - 12), d * 3, .14);
      if (p % 2 === 0) shaker(t, p % 4 ? .03 : .05);
      if (p === 0 || p === 8) kick(t, .12);
      if (p === 0) padChord(t, ch, d * 15, .06, 1600, 'triangle');
      if (p % 2 === 0 && R(bar, p) < .7) bell(t, mtof(walk(this.scale, this.root, bar, p, ch)), .06);
    } },
  lamp: { desc: 'тепла лампова мелодія з потріскуванням платівки', bpm: 72, wet: .3, swing: .22, scale: [0, 3, 5, 7, 10], root: 69,
    prog: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]],
    play(st, t, d) {
      const bar = st >> 4, p = st & 15, ch = this.prog[bar % 4];
      if (p === 0 || p === 10) kick(t, .16); if (p === 4 || p === 12) snare(t, .05); if (p % 2 === 0) hat(t, .012);
      if (p === 0 || p === 6) ch.forEach(n => tone(t, mtof(n), d * 7, { type: 'sine', vol: .03, a: .01, vib: .004, vibRate: 4 }));
      if (p === 0) tone(t, mtof(ch[0] - 24), d * 14, { type: 'sine', vol: .14 });
      if (p % 4 === 2 && R(bar, p) < .6) tone(t, mtof(walk(this.scale, this.root, bar, p, ch)), d * 3, { type: 'sine', vol: .06, a: .01, cutoff: 2000 });
      if (R(bar * 7, p) < .35) noise(t + R(bar, p * 3) * d, .012, { type: 'highpass', freq: 3000, vol: .02 + R(p, bar) * .03, out: SND.mout });
    } },
  dungeon: { desc: 'темний гул, луна й краплі води', bpm: 58, wet: .55, swing: 0, scale: [0, 1, 3, 5, 7, 8, 10], root: 50,
    prog: [[38, 45], [38, 44], [36, 43], [37, 44]],
    play(st, t, d) {
      const bar = st >> 4, p = st & 15, ch = this.prog[(bar >> 1) % 4];
      if (p === 0 && bar % 2 === 0) padChord(t, ch, d * 32, .12, 380);
      if (p === 0) tom(t, 62, .22); if (p === 10 && R(bar, 3) < .5) tom(t, 74, .1);
      if (R(bar, p) < .08) tone(t, 1500 + R(p, bar) * 900, .25, { type: 'sine', vol: .04, glide: .55, send: SND.send });
      if ((p === 4 || p === 12) && R(bar * 5, p) < .45) tone(t, mtof(walk(this.scale, this.root + 12, bar, p, ch.map(x => x + 12))), d * 6, { type: 'sine', vol: .05, a: .08, vib: .01, vibRate: 5, cutoff: 1400 });
    } },
  space: { desc: 'космічні арпеджіо й теплі синтезатори', bpm: 96, wet: .45, swing: 0, scale: [0, 2, 4, 6, 7, 9, 11], root: 64,
    prog: [[52, 56, 59, 63], [54, 58, 61, 64], [49, 52, 56, 59], [51, 54, 58, 61]],
    play(st, t, d) {
      const bar = st >> 4, p = st & 15, ch = this.prog[bar % 4];
      if (p === 0) padChord(t, ch, d * 15, .15, 1100);
      if (p % 4 === 0) kick(t, .13);
      if (p === 4 || p === 12) noise(t, .2, { type: 'bandpass', freq: 3000, q: .6, vol: .02, out: SND.mout });
      const arp = ch[[0, 1, 2, 3, 2, 1][p % 6]] + 12;
      tone(t, mtof(arp), d * 1.2, { type: 'sawtooth', vol: .05, cutoff: 900 + 700 * Math.sin(st / 9), q: 4 });
      if (p % 8 === 4 && R(bar, p) < .55) tone(t, mtof(walk(this.scale, this.root + 12, bar, p, ch)), d * 5, { type: 'sine', vol: .05, a: .04, send: SND.send });
    } }
};
function scheduleMusic() {
  const c = SND.ctx; if (!c || c.state !== 'running') return;
  const M = MUSIC[SKIN_ID] || MUSIC.tavern;
  if (SND.skin !== SKIN_ID) {
    if (SND.skin) { SND.music.gain.cancelScheduledValues(c.currentTime); SND.music.gain.setValueAtTime(0.0001, c.currentTime); SND.music.gain.setTargetAtTime(SND.musicVol * 2, c.currentTime + .2, .6); }
    SND.skin = SKIN_ID; SND.step = 0; SND.mel = 7; SND.next = Math.max(SND.next, c.currentTime + .1); SND.send.gain.setTargetAtTime(M.wet, c.currentTime, .3);
  }
  if (SND.next < c.currentTime - .5) SND.next = c.currentTime + .05;
  if (SND.musicVol <= 0 || SND.muted) { SND.next = c.currentTime + .1; return; }
  const sp = 60 / M.bpm / 4;
  while (SND.next < c.currentTime + .3) {
    try { M.play(SND.step, SND.next, sp); } catch (e) { /* пропускаємо крок */ }
    SND.next += sp * (M.swing ? (SND.step % 2 ? 1 - M.swing : 1 + M.swing) : 1); SND.step++;
  }
}
/* --- ефекти --- */
const SFX = {
  whoosh: t => noise(t, .24, { type: 'bandpass', freq: 700, sweep: 3.5, q: .9, vol: .12 }),
  door: t => { tom(t, 85, .5, SND.sfx); noise(t, .14, { type: 'lowpass', freq: 500, vol: .35 }); tone(t + .1, 240, .55, { type: 'sawtooth', vol: .035, glide: .6, cutoff: 900, out: SND.sfx }); },
  roar: t => { tone(t, 115, .8, { type: 'sawtooth', vol: .16, glide: .55, cutoff: 650, vib: .07, vibRate: 11, out: SND.sfx }); noise(t, .7, { type: 'lowpass', freq: 700, sweep: .45, vol: .22 }); },
  defeat: t => [72, 76, 79, 84].forEach((n, i) => tone(t + i * .07, mtof(n), .45, { type: 'triangle', vol: .12, out: SND.sfx, send: SND.sfxSend })),
  levelUp: t => [67, 72, 76, 79].forEach((n, i) => bell(t + i * .09, mtof(n), .1, SND.sfx)),
  levelDown: t => { tone(t, 300, .55, { type: 'square', vol: .08, glide: .45, cutoff: 1100, out: SND.sfx }); tone(t + .12, 220, .5, { type: 'square', vol: .06, glide: .5, cutoff: 900, out: SND.sfx }); },
  hit: t => { tone(t, 170, .3, { type: 'sawtooth', vol: .09, glide: .4, cutoff: 900, out: SND.sfx }); noise(t, .2, { type: 'lowpass', freq: 900, vol: .18 }); },
  dice: t => { for (let i = 0; i < 8; i++) noise(t + i * .07 + Math.random() * .03, .03, { type: 'bandpass', freq: 2200 + Math.random() * 1800, q: 5, vol: .16 }); tom(t + .62, 220, .1, SND.sfx); },
  curse: t => { tone(t, 620, 1.1, { type: 'sine', vol: .08, glide: .35, vib: .03, out: SND.sfx, send: SND.sfxSend }); tone(t, 640, 1.1, { type: 'sine', vol: .06, glide: .33, out: SND.sfx }); },
  coins: t => { for (let i = 0; i < 4; i++) bell(t + i * .065, mtof(86 + (i % 2) * 5), .05, SND.sfx); },
  equip: t => { tone(t, 1300, .1, { type: 'square', vol: .035, cutoff: 3200, out: SND.sfx }); noise(t, .09, { type: 'highpass', freq: 4500, vol: .07 }); },
  help: t => [64, 69, 76].forEach((n, i) => tone(t + i * .1, mtof(n), .35, { type: 'triangle', vol: .1, out: SND.sfx })),
  turn: t => { bell(t, mtof(76), .07, SND.sfx); bell(t + .13, mtof(83), .06, SND.sfx); },
  alert: t => { bell(t, mtof(81), .08, SND.sfx); bell(t + .16, mtof(81), .08, SND.sfx); },
  smoke: t => noise(t, .9, { type: 'lowpass', freq: 2400, sweep: .2, vol: .2 }),
  redirect: t => { noise(t, .35, { type: 'bandpass', freq: 400, sweep: 5, q: .8, vol: .1 }); bell(t + .25, mtof(70), .07, SND.sfx); },
  win: t => [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79, 84]].forEach((ch, i) => ch.forEach(n => tone(t + i * .22, mtof(n), i === 3 ? 1.4 : .25, { type: 'triangle', vol: .07, out: SND.sfx, send: SND.sfxSend }))),
  click: t => tone(t, 1000, .035, { type: 'triangle', vol: .025, out: SND.sfx }),
  deny: t => tone(t, 170, .18, { type: 'square', vol: .07, cutoff: 900, out: SND.sfx })
};
function playSfx(name) {
  if (!SND.ctx || SND.muted || SND.sfxVol <= 0 || SND.ctx.state !== 'running' || !SFX[name]) return;
  const now = performance.now(); if (SND.last[name] && now - SND.last[name] < (name === 'whoosh' ? 50 : 80)) return; SND.last[name] = now;
  try { SFX[name](SND.ctx.currentTime + .01); } catch (e) { /* звук не критичний */ }
}
function sfx(name) { playSfx(name); emitFx('sfx', { n: name }); }
function soundLabel() { const b = $('#btnSound'); if (b) b.textContent = SND.muted ? 'Звук вимк.' : 'Звук'; }
function toggleMute() { ensureAudio(); SND.muted = !SND.muted; applyVolumes(); saveSound(); soundLabel(); toast(SND.muted ? 'Звук вимкнено' : 'Звук увімкнено', 1200); }
function openSound() {
  ensureAudio();
  const M = MUSIC[SKIN_ID] || MUSIC.tavern;
  const draw = () => `<h2>Звук</h2>
    <div class="row" style="margin-top:0"><button class="btn ${SND.muted ? 'primary' : ''}" type="button" id="sndMute">${SND.muted ? 'Увімкнути звук' : 'Вимкнути весь звук'}</button><span class="hint">Клавіша M теж вмикає й вимикає звук.</span></div>
    <label class="lbl2" for="volM">Музика · <span id="volMv">${Math.round(SND.musicVol * 100)}%</span></label>
    <input class="range" type="range" id="volM" min="0" max="100" step="1" value="${Math.round(SND.musicVol * 100)}">
    <label class="lbl2" for="volS">Ефекти гри · <span id="volSv">${Math.round(SND.sfxVol * 100)}%</span></label>
    <input class="range" type="range" id="volS" min="0" max="100" step="1" value="${Math.round(SND.sfxVol * 100)}">
    <p class="hint" style="margin-top:12px">У кожного вигляду столу своя музика. Зараз «${esc(SKIN.name)}»: ${esc(M.desc)}. Змінити стіл можна кнопкою «Стіл».</p>
    <div class="row end"><button class="btn ghost" type="button" id="sndTest">Перевірити ефекти</button><button class="btn primary" type="button" data-close>Готово</button></div>`;
  showModal(draw());
  const bind = () => {
    $('#volM').oninput = e => { SND.musicVol = +e.target.value / 100; $('#volMv').textContent = e.target.value + '%'; applyVolumes(); saveSound(); };
    $('#volS').oninput = e => { SND.sfxVol = +e.target.value / 100; $('#volSv').textContent = e.target.value + '%'; applyVolumes(); saveSound(); };
    $('#volS').onchange = () => playSfx('coins');
    $('#sndMute').onclick = () => { toggleMute(); $('#sheet').innerHTML = draw(); $('#sheet').querySelectorAll('[data-close]').forEach(x => x.onclick = closeModal); bind(); };
    $('#sndTest').onclick = () => { ['door', 'roar', 'dice', 'levelUp'].forEach((n, i) => setTimeout(() => playSfx(n), i * 700)); };
  };
  bind();
}
addEventListener('pointerdown', ensureAudio, { capture: true });
addEventListener('keydown', e => { ensureAudio(); if ((e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') && !e.target.closest('input, textarea, select')) toggleMute(); }, { capture: true });
document.addEventListener('visibilitychange', () => { if (!SND.ctx) return; if (document.hidden) SND.ctx.suspend(); else SND.ctx.resume(); });
document.addEventListener('click', e => { if (e.target.closest('.btn, .card, .slot, .ochip, .skin, .brow, .seg button')) playSfx('click'); });
