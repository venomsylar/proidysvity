'use strict';

/* ============================== ГОЛОВНИЙ ЕКРАН ==============================
   Повноекранне меню з кумедною сценкою: у двері стукають, а звідти визирають монстри. */
const MENU = { open: false, el: null, timer: 0, step: 0, last: '' };
const PEEK_LINES = [
  'Тук-тук! Пригоди замовляли?', 'Ще пʼять хвилиночок…', 'Ваш рівень — мій!', 'А скарби в тебе є?', 'Я тут зовсім випадково.',
  'Податкова, відчиняйте!', 'Хтось кликав монстра?', 'Мама казала не відчиняти.', 'Сюрприз!', 'Граємо чи боїмося?',
  'Я тільки спитати…', 'Тут кімната вільна?', 'Без мене не починайте!', 'У мене халепа для тебе.', 'Сметану принесли?'
];
const menuPaused = () => MENU.open && NET.role !== 'host' && NET.role !== 'client';

function menuArtPool(kinds) {
  const seen = new Set(), out = [];
  for (const c of [...buildDoorDeck(true), ...buildTreasureDeck()]) {
    if (kinds && !kinds.includes(c.kind)) continue;
    const im = artFor(c); if (!im || seen.has(c.name)) continue;
    seen.add(c.name); out.push({ src: im.src, name: c.name, deck: c.deck });
  }
  return out;
}
const gameRunning = () => G.players.length > 0 && !G.over && G.phase !== 'setup';

function buildMainMenu() {
  const el = document.createElement('div');
  el.id = 'mainmenu'; el.className = 'mm'; el.hidden = true;
  const pool = menuArtPool();
  const fly = Array.from({ length: 9 }, (_, i) => {
    const a = pool.length ? pool[(i * 23 + 7) % pool.length] : null;
    return `<div class="fcard ${a ? a.deck : 'door'}" style="--x:${(i * 11.3 + 4) % 96}%;--d:${16 + (i * 7) % 11}s;--dl:${-(i * 3.1)}s;--r:${(i % 2 ? 1 : -1) * (12 + i * 5)}deg;--s:${.7 + (i % 3) * .18}">${a ? `<img src="${a.src}" alt="">` : ''}</div>`;
  }).join('');
  const title = [...'Пройдисвіти'].map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('');
  el.innerHTML = `<div class="mm-bg" aria-hidden="true">${fly}</div>
    <div class="mm-wrap">
      <div class="mm-left">
        <h1 class="mm-title" aria-label="Пройдисвіти">${title}</h1>
        <p class="mm-sub">настільна гра про похід у підземелля</p>
        <nav class="mm-nav" aria-label="Головне меню">
          <button type="button" class="mm-btn primary" data-mm="continue" hidden>Продовжити гру</button>
          <button type="button" class="mm-btn primary" data-mm="new">Нова гра</button>
          <button type="button" class="mm-btn primary" data-mm="rejoin" hidden>Повернутися в гру</button>
          <button type="button" class="mm-btn" data-mm="join">Приєднатися до гри</button>
          <button type="button" class="mm-btn" data-mm="rules">Правила</button>
          <button type="button" class="mm-btn" data-mm="cards">Усі карти</button>
          <div class="mm-row">
            <button type="button" class="mm-btn small" data-mm="table">Стіл і графіка</button>
            <button type="button" class="mm-btn small" data-mm="sound">Звук</button>
          </div>
        </nav>
        <div class="mm-foot"><button type="button" class="ver setup-ver" data-mm="ver"></button><span data-mm="ver">Що нового</span></div>
      </div>
      <div class="mm-stage" aria-hidden="true">
        <div class="mm-torch l"><i></i></div><div class="mm-torch r"><i></i></div>
        <div class="mm-door">
          <div class="mm-dark"></div>
          <img class="mm-peek" alt="">
          <div class="mm-leaf"><b></b><s></s></div>
          <div class="mm-arch"></div>
        </div>
        <div class="mm-knock">тук-тук!</div>
        <div class="mm-bubble"></div>
        <div class="mm-mat">ЛАСКАВО ПРОСИМО</div>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-mm]'); if (b) { menuAction(b.dataset.mm); return; }
    if (e.target.closest('.mm-door')) { clearTimeout(MENU.timer); peekCycle(true); }
  });
  // поки поверх меню відкрите вікно — зупиняємо анімацію
  new MutationObserver(() => el.classList.toggle('dim', !$('#modal').hidden)).observe($('#modal'), { attributes: true, attributeFilter: ['hidden'] });
  MENU.el = el; MENU.pool = menuArtPool(['monster']);
  return el;
}

function peekCycle(now) {
  if (!MENU.open || !MENU.el) return;
  const st = MENU.el.querySelector('.mm-stage');
  const pool = MENU.pool && MENU.pool.length ? MENU.pool : null;
  const go = () => {
    if (!MENU.open) return;
    if (pool) { let m; do { m = pool[rnd(pool.length)]; } while (pool.length > 1 && m.name === MENU.last); MENU.last = m.name; st.querySelector('.mm-peek').src = m.src; }
    let line; do { line = PEEK_LINES[rnd(PEEK_LINES.length)]; } while (line === MENU.line); MENU.line = line;
    st.querySelector('.mm-bubble').textContent = line;
    st.classList.remove('knock'); st.classList.add('open'); playSfx('door');
    MENU.timer = setTimeout(() => { st.classList.remove('open'); MENU.timer = setTimeout(() => peekCycle(false), 2600); }, 3000);
  };
  if (now) { st.classList.remove('open'); go(); return; }
  st.classList.add('knock'); playSfx('click');
  MENU.timer = setTimeout(go, 900);
}

function openMainMenu() {
  const el = MENU.el || buildMainMenu();
  closeMenu(); hidePeek(); closeModal();
  el.querySelector('[data-mm="continue"]').hidden = !gameRunning();
  el.querySelector('[data-mm="new"]').classList.toggle('primary', !gameRunning());
  el.querySelector('[data-mm="join"]').hidden = NET.role === 'client' && gameRunning();
  const rj = rejoinRec(), rb = el.querySelector('[data-mm="rejoin"]');
  rb.hidden = !rj || NET.role !== 'local' || gameRunning(); if (rj) rb.textContent = `Повернутися в гру · ${rj.code}`;
  const vb = el.querySelector('[data-mm="ver"]'); vb.textContent = 'v' + APP_VERSION; vb.classList.toggle('new', seenVersion() < APP_VERSION);
  el.hidden = false; MENU.open = true; document.body.classList.add('in-menu');
  clearTimeout(MENU.timer); MENU.timer = setTimeout(() => peekCycle(false), 1200);
}
function hideMainMenu() {
  if (!MENU.el) return;
  MENU.el.hidden = true; MENU.open = false; document.body.classList.remove('in-menu');
  clearTimeout(MENU.timer); MENU.el.querySelector('.mm-stage').classList.remove('open', 'knock');
}

function menuAction(a) {
  switch (a) {
    case 'continue': hideMainMenu(); break;
    case 'new':
      if (NET.role === 'client' && gameRunning()) { toast('Нову партію запускає господар кімнати.'); return; }
      if (gameRunning() && G.busy) { G.pendingSetup = true; hideMainMenu(); toast('Нова гра почнеться після цього ходу'); return; }
      openSetup(); break;
    case 'join': openJoin(); break;
    case 'rejoin': manualRejoin(); break;
    case 'rules': openRules(); break;
    case 'cards': openGallery(); break;
    case 'table': openSkins(); break;
    case 'sound': openSound(); break;
    case 'ver': openChangelog(); break;
  }
}

/* ============================== УСІ КАРТИ ==============================
   Окремий екран із головного меню: усі карти гри з фільтрами й пошуком. Клацни карту — збільшиться. */
const GAL = { cat: 'all', q: '', list: null };
const GAL_CATS = [
  ['all', 'Усі'], ['monster', 'Монстри'], ['curse', 'Прокляття'], ['rc', 'Раси й класи'], ['gear', 'Речі'],
  ['shot', 'Разові'], ['fight', 'Для бою'], ['coop', 'Похід на Боса']
];
function galCat(c) {
  if (c.boss || c.guard || ['key', 'alarm', 'horn'].includes(c.kind)) return 'coop';
  if (c.kind === 'monster') return 'monster';
  if (c.kind === 'curse') return 'curse';
  if (['race', 'class', 'dual'].includes(c.kind)) return 'rc';
  if (c.kind === 'gear') return 'gear';
  if (['mod', 'wander'].includes(c.kind)) return 'fight';
  return 'shot';
}
function galleryCards() {
  if (GAL.list) return GAL.list;
  const all = { undead: true, dragon: true };
  const cards = [...buildDoorDeck(true, all), ...buildTreasureDeck(all), ...coopDoorCards(), ...coopTreasureCards()];
  GUARDS.forEach(g => cards.push(mk({ deck: 'door', kind: 'monster', guard: true, name: g.name, art: g.art, lvl: '13–17', treasures: 4, levels: 1, vs: null, flavor: g.flavor, bad: { ...g.bad, text: g.bt } })));
  BOSSES.forEach(b => cards.push(mk({ deck: 'door', kind: 'monster', boss: true, name: b.name, art: b.art, lvl: '★', treasures: 0, levels: 0, dragon: !!b.dragon, undead: !!b.undead, vs: null, flavor: b.flavor, ability: b.ability, bad: { t: 'boss', text: 'Програш: кожен втрачає рівень, Загроза +3.' } })));
  const seen = new Map();
  for (const c of cards) { const k = c.kind + '|' + c.name; if (seen.has(k)) seen.get(k).n++; else seen.set(k, { c, n: 1, cat: galCat(c) }); }
  const order = ['monster', 'curse', 'rc', 'gear', 'shot', 'fight', 'coop'];
  const lv = c => typeof c.lvl === 'number' ? c.lvl : 99;
  const sub = c => c.guard ? 0 : c.boss ? 1 : ['key', 'alarm', 'horn', 'race', 'dual', 'class'].indexOf(c.kind) + 2;
  GAL.list = [...seen.values()].sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat) || sub(a.c) - sub(b.c) || lv(a.c) - lv(b.c) || (b.c.bonus || 0) - (a.c.bonus || 0) || a.c.name.localeCompare(b.c.name, 'uk'));
  return GAL.list;
}
function openGallery() {
  const list = galleryCards();
  const draw = () => {
    const q = GAL.q.trim().toLowerCase();
    const shown = list.filter(x => (GAL.cat === 'all' || x.cat === GAL.cat) && (!q || x.c.name.toLowerCase().includes(q) || cardInfo(x.c).text.toLowerCase().includes(q)));
    const total = n => n === 'all' ? list.length : list.filter(x => x.cat === n).length;
    return `<h2>Усі карти</h2>
      <p class="hint">Кожна карта гри — від монстрів до вартових лігва. Клацни карту, щоб роздивитися ближче. Число в кутику «×2» — скільки таких карт у колоді.</p>
      <div class="gal-bar"><div class="seg wrap" role="group" aria-label="Тип карт">${GAL_CATS.map(([k, l]) => `<button type="button" data-gc="${k}" aria-pressed="${GAL.cat === k}">${l} <small>${total(k)}</small></button>`).join('')}</div>
      <input class="inp gal-q" id="galQ" type="search" placeholder="Пошук за назвою чи текстом…" value="${esc(GAL.q)}" aria-label="Пошук карт"></div>
      <div class="gal-grid" id="galGrid">${shown.map(x => `<div class="gal-it">${cardHTML(x.c)}${x.n > 1 ? `<span class="gal-n">×${x.n}</span>` : ''}</div>`).join('') || '<p class="empty">Нічого не знайдено.</p>'}</div>
      <div class="gal-zoom" id="galZoom" hidden></div>
      <div class="row end"><button class="btn primary" type="button" data-close>Назад</button></div>`;
  };
  showModal(draw(), 'wide gal');
  const sheet = $('#sheet');
  const redraw = () => { const y = sheet.scrollTop; sheet.innerHTML = draw(); sheet.scrollTop = y; bind(); };
  const bind = () => {
    sheet.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
    const qi = $('#galQ'); qi.oninput = () => { GAL.q = qi.value; const pos = qi.selectionStart; redraw(); const n = $('#galQ'); n.focus(); n.setSelectionRange(pos, pos); };
  };
  sheet.onclick = e => {
    const z = $('#galZoom');
    if (e.target.closest('#galZoom')) { z.hidden = true; return; }
    const b = e.target.closest('[data-gc]'); if (b) { GAL.cat = b.dataset.gc; redraw(); return; }
    const card = e.target.closest('.gal-grid .card'); if (!card) return;
    const x = list.find(it => it.c.uid === +card.dataset.uid); if (!x) return;
    z.innerHTML = `<div class="gal-zc">${cardHTML(x.c, 'big')}<p class="hint">${x.n > 1 ? `У колоді: ${x.n} шт. · ` : ''}${GAL_CATS.find(([k]) => k === x.cat)[1]} · клацни будь-де, щоб закрити</p></div>`;
    z.hidden = false;
  };
  sheet.onkeydown = e => { if (e.key === 'Escape' && !$('#galZoom').hidden) { e.stopPropagation(); $('#galZoom').hidden = true; } };
  bind();
}
