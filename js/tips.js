'use strict';

/* ============================== ПІДКАЗКИ ДЛЯ НОВАЧКА ==============================
   Невеликі підказки, що зʼявляються в потрібний момент гри — кожна лише раз.
   Їх можна вимкнути (і знову ввімкнути чи показати спочатку) в «Стіл і графіка». */
const TIPS_KEY = 'pdsv-tips';
const TIPS = { off: false, seen: new Set(), cur: null, t: 0 };
(function () { try { const d = JSON.parse(localStorage.getItem(TIPS_KEY) || 'null'); if (d) { TIPS.off = !!d.off; TIPS.seen = new Set(d.seen || []); } } catch (e) { } })();
function tipsStore() { try { localStorage.setItem(TIPS_KEY, JSON.stringify({ off: TIPS.off, seen: [...TIPS.seen] })); } catch (e) { } }
function tipsSet(on) { TIPS.off = !on; if (!on) tipHide(); tipsStore(); }
function tipsReset() { TIPS.seen.clear(); TIPS.off = false; tipsStore(); }

// [id, умова, текст] — перевіряються по черзі, показується перша ще не бачена
const TIP_LIST = [
  ['board', v => true, 'Ліворуч — <b>табло</b>: рівні всіх гравців. Підсвічений рядок — чий зараз хід. Клацни рядок, щоб побачити картку персонажа.'],
  ['coop', v => !!G.coop, '<b>Похід на Боса:</b> граєте всі разом проти Підземелля. Шукайте 3 ключі в колоді дверей і стежте за шкалою <b>Загрози</b> на табло — заповниться, і похід провалено.'],
  ['team', v => G.teams && !G.coop, '<b>Командна гра:</b> рівні напарників сумуються. Напарник допомагає безплатно, а будь-яку карту йому можна передати: клацни карту → «Віддати напарнику».'],
  ['prep', v => G.phase === 'prep', 'Перед першим ходом можна зіграти расу, клас і вдягнути речі з руки. Карти, які можна зіграти, мають <b>золоту рамку</b>. Потім тисни «Я спорядився».'],
  ['kick', v => G.phase === 'start' && myTurnHere(), 'Твій хід! Натисни <b>«Вибити двері»</b> або клацни колоду дверей на столі. За дверима — монстр, прокляття або корисна карта.'],
  ['rc', v => !G.combat && v.hand.some(c => c.kind === 'race' || c.kind === 'class'), 'У руці є карта раси чи класу — вона дає вміння. Клацни її → <b>«Стати: …»</b>. Що вміє раса чи клас, написано на самій карті.'],
  ['gear', v => !G.combat && v.hand.some(c => c.kind === 'gear' && !canEquip(v, c)), 'Річ у руці можна вдягнути: клацни карту → <b>«Спорядити»</b>. Сила в бою — це рівень плюс бонуси речей.'],
  ['win', v => G.combat && fighter() === v && sides().win && !G.busy, 'Ти сильніший за монстра! Тисни <b>«Битися!»</b> — отримаєш рівень і скарби. Але суперники ще можуть втрутитися.'],
  ['lose', v => G.combat && fighter() === v && !sides().win && !G.busy, 'Монстр сильніший. Можна зіграти <b>разові карти</b> з руки, <b>покликати на поміч</b> іншого гравця (за частку скарбів) або <b>тікати</b> — треба викинути 5 чи 6 на кубику.'],
  ['window', v => G.window && G.window.humans.includes(v), 'Хтось ось-ось переможе монстра. Можеш зіграти карту, щоб завадити (посилити монстра, підкинути мертвяка), або натиснути <b>«Не втручаюсь»</b>.'],
  ['after', v => G.phase === 'afterKick' && myTurnHere() && !G.busy, 'Монстра не було. Можна <b>шукати пригод</b> — битися з монстром із руки — або <b>обшукати кімнату</b>: узяти ще одну карту дверей.'],
  ['limit', v => v.hand.length > handLimit(v) && myTurnHere() && ['afterKick', 'charity'].includes(G.phase) && !G.busy, 'Карт більше за ліміт (зазвичай 5). Зайві наприкінці ходу доведеться віддати — краще спершу вдягни речі чи продай непотрібні.'],
  ['curse', v => !G.combat && v.hand.some(c => c.kind === 'curse') && myTurnHere(), 'Прокляття з руки можна наслати на суперника: клацни карту → <b>«Наслати прокляття…»</b>.'],
  ['lair', v => G.coop && G.coop.lair, 'Лігво відчинене! Спершу здолайте трьох <b>вартових</b> (кнопка замість дверей), а тоді веди загін на Боса. Прогноз сили видно на табло.']
];
function tipCheck() {
  if (TIPS.off || TIPS.cur || G.over || !G.players.length) return;
  if (!$('#modal').hidden || (typeof MENU !== 'undefined' && MENU.open)) return;
  const v = viewerP(); if (!v || !handVisible() || (NET.role !== 'client' && v.type !== 'human')) return;
  if (performance.now() - TIPS.t < 1800) return;
  for (const [id, cond, text] of TIP_LIST) {
    if (TIPS.seen.has(id)) continue;
    let ok = false; try { ok = !!cond(v); } catch (e) { ok = false; }
    if (ok) { tipShow(id, text); return; }
  }
}
function tipShow(id, html) {
  let el = $('#tip');
  if (!el) {
    el = document.createElement('div'); el.id = 'tip'; el.className = 'tip'; el.setAttribute('role', 'status');
    document.body.appendChild(el);
    el.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.tip === 'off') { tipsSet(false); toast('Підказки вимкнено. Увімкнути: «Стіл» → «Підказки».', 2600); } else tipHide(); };
  }
  TIPS.cur = id; TIPS.seen.add(id); tipsStore();
  el.innerHTML = `<span class="ti" aria-hidden="true">💡</span><div class="tt">${html}</div><div class="tb"><button type="button" class="btn small primary" data-tip="ok">Зрозуміло</button><button type="button" class="btn small ghost" data-tip="off">Вимкнути підказки</button></div>`;
  const d = document.querySelector('.dock'); el.style.bottom = d && innerWidth > 760 ? (innerHeight - d.getBoundingClientRect().top + 12) + 'px' : '';
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function tipHide() { const el = $('#tip'); if (el) el.hidden = true; TIPS.cur = null; TIPS.t = performance.now(); }
