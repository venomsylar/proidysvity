'use strict';

/* ============================== КИДОК КАРТИ СВАЙПОМ ==============================
   Лише на сенсорних екранах (телефон, планшет): карту з руки можна провести вгору —
   і вона зіграє свою головну дію. Якщо дій кілька (кому підкинути, на кого прокляття),
   відкривається звичайне меню карти. Дотик без руху — як і раніше, меню.
   Підказка з анімованим пальцем показується, доки гравець не натисне «Зрозуміло». */
const SWIPE_KEY = 'pdsv-swipe-ok';
const SWIPE_MIN = 70; // наскільки вгору провести (px)
const isTouchUI = () => matchMedia('(pointer: coarse)').matches;
let swipeHintOk = (() => { try { return localStorage.getItem(SWIPE_KEY) === '1'; } catch (e) { return false; } })();
document.documentElement.classList.toggle('touch-ui', isTouchUI());
matchMedia('(pointer: coarse)').addEventListener?.('change', () => { document.documentElement.classList.toggle('touch-ui', isTouchUI()); swipeHintCheck(); });

// головна дія карти: єдина «справжня» дія без підменю; інакше — null (тоді меню)
const SWIPE_SKIP = /^(Продати|Скинути|Віддати)/;
function swipeAct(c) {
  const acts = cardActions(c, 'hand').filter(a => !a.dis && !SWIPE_SKIP.test(a.label));
  return acts.length === 1 && acts[0].act && !acts[0].sub ? acts[0] : null;
}

let SW = null, swipeClickBlock = 0;
function swipeCard(el) { const v = viewerP(); return v && v.hand.find(x => x.uid === +el.dataset.uid); }
const SW_FAR = () => Math.max(140, innerHeight * .25);
// рука прокручується вбік і обрізає все, що вище неї, тому тягнемо «привида» карти поверх усього
function swipeGhost(el) {
  const r = el.getBoundingClientRect(), g = el.cloneNode(true);
  g.classList.add('swipe-ghost'); g.classList.remove('fresh');
  Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  document.body.appendChild(g); el.classList.add('swipe-src'); return g;
}
$('#hand').addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch' || !handVisible()) return;
  const el = e.target.closest('.card'); if (!el || !el.classList.contains('playable')) return;
  SW = { el, id: e.pointerId, x0: e.clientX, y0: e.clientY, mode: null, dy: 0, dx: 0, ghost: null };
});
$('#hand').addEventListener('pointermove', e => {
  if (!SW || e.pointerId !== SW.id) return;
  const dx = e.clientX - SW.x0, dy = e.clientY - SW.y0;
  if (!SW.mode) {
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) { SW = null; return; } // це прокрутка руки
    if (dy < -10 && -dy > Math.abs(dx)) { SW.mode = 'drag'; try { SW.el.setPointerCapture(e.pointerId); } catch (er) { } SW.ghost = swipeGhost(SW.el); hideSwipeHint(true); }
    else return;
  }
  e.preventDefault();
  SW.dx = dx; SW.dy = Math.min(0, dy);
  const k = Math.min(1, -SW.dy / SW_FAR());
  SW.ghost.style.transform = `translate(${dx * .35}px, ${SW.dy}px) rotate(${dx * .04}deg) scale(${1 + k * .1})`;
  SW.ghost.classList.toggle('swipe-go', -SW.dy >= SWIPE_MIN);
});
function swipeEnd(e, cancel) {
  if (!SW || e.pointerId !== SW.id) return;
  const s = SW; SW = null; if (!s.mode) return;
  swipeClickBlock = performance.now() + 450;
  const el = s.el, g = s.ghost, c = swipeCard(el);
  const done = ms => setTimeout(() => { g.remove(); el.classList.remove('swipe-src'); }, ms);
  g.classList.remove('swipe-go');
  if (!cancel && c && -s.dy >= SWIPE_MIN) {
    const a = swipeAct(c);
    if (a) {
      g.classList.add('swipe-fly'); g.style.transform = `translate(${s.dx * .5}px, ${-Math.max(260, innerHeight * .45)}px) scale(.55) rotate(${s.dx * .05}deg)`;
      setTimeout(() => dispatch(a.act), 140); done(420);
      return;
    }
    g.remove(); el.classList.remove('swipe-src'); openCardMenu(c, 'hand'); return; // кілька варіантів — меню карти
  }
  g.classList.add('swipe-back'); g.style.transform = ''; done(260);
}
$('#hand').addEventListener('pointerup', e => swipeEnd(e, false));
$('#hand').addEventListener('pointercancel', e => swipeEnd(e, true));
// після свайпу браузер ще надсилає «клік» — його ковтаємо, щоб не відкривалося меню
$('#hand').addEventListener('click', e => { if (performance.now() < swipeClickBlock) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

/* --- підказка з пальцем --- */
function hideSwipeHint(soft) { const h = $('#swipeHint'); if (h) h.classList.toggle('soft', !!soft); }
function swipeHintCheck() {
  let h = $('#swipeHint');
  const el = !swipeHintOk && isTouchUI() && !G.over && handVisible() && $('#modal').hidden && $('#menu').hidden ? [...document.querySelectorAll('#hand .card.playable')].find(x => { const c = swipeCard(x); return c && swipeAct(c); }) : null;
  if (!el) { if (h) h.remove(); return; }
  if (!h) {
    h = document.createElement('div'); h.id = 'swipeHint'; h.className = 'swipe-hint';
    h.innerHTML = `<div class="sh-finger" aria-hidden="true"><span>👆</span><i></i></div><div class="sh-bubble" role="note"><b>Карту можна кинути пальцем</b><span>Проведи карту вгору — і вона зіграє. Просто торкнись — відкриється меню з усіма діями.</span><button type="button" class="btn small primary" id="swipeOk">Зрозуміло</button></div>`;
    document.body.appendChild(h);
    $('#swipeOk').onclick = () => { swipeHintOk = true; try { localStorage.setItem(SWIPE_KEY, '1'); } catch (e) { } h.remove(); };
  }
  h.classList.remove('soft');
  const r = el.getBoundingClientRect(), f = h.querySelector('.sh-finger'), b = h.querySelector('.sh-bubble');
  f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top + r.height * .55) + 'px';
  const dk = $('#dock') && $('#dock').getBoundingClientRect(); // бульбашка — над панеллю, щоб не закривати кнопки
  b.style.bottom = (innerHeight - (dk && dk.height ? dk.top : r.top - 60) + 12) + 'px';
}
// після кожного оновлення панелі — переставити палець на актуальну карту
{ const rd = renderDock; renderDock = function () { rd.apply(this, arguments); swipeHintCheck(); }; }
$('#hand').addEventListener('scroll', () => { if ($('#swipeHint')) swipeHintCheck(); }, { passive: true });
addEventListener('resize', () => { if ($('#swipeHint')) swipeHintCheck(); });
