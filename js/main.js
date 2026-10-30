'use strict';

/* ============================== ВЕРСІЯ ============================== */
const VER_KEY = 'pdsv-seen-ver';
function seenVersion() { try { return +localStorage.getItem(VER_KEY) || 0; } catch (e) { return 0; } }
function markVersionSeen() { try { localStorage.setItem(VER_KEY, String(APP_VERSION)); } catch (e) { /* без сховища */ } }
function renderVersionBtn() {
  const b = $('#btnVer'); if (!b) return;
  const fresh = seenVersion() < APP_VERSION;
  b.textContent = 'v' + APP_VERSION; b.classList.toggle('new', fresh);
  b.title = fresh ? 'Гру оновлено — подивись, що нового' : 'Список змін';
}
function openChangelog() {
  const seen = seenVersion();
  const back = NET.setupOpen ? openSetup : (NET.role === 'client' && NET.lobby && !(G.players.length && NET.gid >= 0 && !G.over)) ? () => showLobby(NET.lobby) : null;
  showModal(`<h2>Що нового</h2><p class="hint">Зараз у тебе версія <b>v${APP_VERSION}</b>.${seen && seen < APP_VERSION ? ` Минулого разу була v${seen} — нове позначено.` : ''}</p>
    <div class="changelog">${CHANGELOG.map(e => `<section class="${e.v === APP_VERSION ? 'cur' : ''}${seen && e.v > seen ? ' fresh' : ''}">
      <h3><span class="vnum">v${e.v}</span> ${esc(e.title)}${e.date ? ` <small>${esc(e.date)}</small>` : ''}${seen && e.v > seen ? ' <em>нове</em>' : ''}</h3>
      <ul>${e.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>`).join('')}</div>
    <div class="row end"><button class="btn primary" type="button" id="clOk">${back ? 'Назад' : 'Зрозуміло'}</button></div>`, 'wide');
  $('#clOk').onclick = () => { if (back) back(); else closeModal(); };
  markVersionSeen(); renderVersionBtn();
}
$('#btnVer').onclick = e => { e.stopPropagation(); openChangelog(); };
renderVersionBtn();

/* ============================== СТАРТ ============================== */
async function boot() {
  loaderSet('Готуємо шрифти…', .2);
  const artP = loadCardArt((d, t) => loaderSet(`Малюємо карти… ${d} з ${t}`, .3 + .6 * d / t));
  try {
    const arts = [...buildDoorDeck(true), ...buildTreasureDeck()].map(c => c.art).join('') + '⚔♂♀★';
    await Promise.race([Promise.all(['32px Underdog', '22px Pangolin', '700 20px Rubik'].map(f => document.fonts.load(f, 'АБВ')).concat([document.fonts.load('40px "Noto Color Emoji"', arts)])), wait(4000)]);
  } catch (e) { /* шрифти недоступні — використовуємо запасні */ }
  await Promise.race([artP, wait(6000)]);
  if (typeof THREE === 'undefined') { $('#status').textContent = 'Не вдалося завантажити 3D-рушій. Перевір зʼєднання й онови сторінку.'; loaderFail('Не вдалося завантажити 3D-рушій. Перевір зʼєднання з інтернетом і спробуй ще раз.'); return; }
  loaderSet('Розкладаємо стіл…', .95);
  try { init3D(); } catch (e) { loaderFail('Цей браузер не зміг запустити 3D-графіку. Спробуй інший браузер.'); throw e; }
  renderUI();
  openSetup();
  loaderSet('Готово!', 1); loaderDone();
}
boot();
