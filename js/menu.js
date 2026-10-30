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
          <button type="button" class="mm-btn" data-mm="join">Приєднатися до гри</button>
          <button type="button" class="mm-btn" data-mm="rules">Правила</button>
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
    case 'rules': openRules(); break;
    case 'table': openSkins(); break;
    case 'sound': openSound(); break;
    case 'ver': openChangelog(); break;
  }
}
