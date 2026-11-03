'use strict';

/* ============================== МАНДРІВНИЙ ТОРГОВЕЦЬ ==============================
   Карта дверей. Вибив двері — торговець одразу розкладає три скарби: одну річ можна
   купити за золото або виміняти на дві будь-які карти з руки. Якщо карта прийшла в руку
   (обшук, благодійність), її можна зіграти у свій хід поза боєм. */
const MERCHANT_N = 3;
const buyPrice = c => Math.max(100, c.value || 300);

async function merchantVisit(p, card, m) {
  log(`🧳 ${nameTag(p)} зустрічає <b>Мандрівного торговця</b>.`); sfx('coins');
  const offers = []; for (let i = 0; i < MERCHANT_N; i++) { const c = draw('treasure'); if (c) offers.push(c); }
  if (!offers.length) { say('У торговця порожній мішок…', 1800); await wait(900 * ANIM); if (m) disposeMesh(m); discard(card); return; }
  const n = offers.length + 1;
  const ms = offers.map(c => { const x = cardMesh(c); scene.add(x); return x; });
  await Promise.all([m ? fly(m, poseOf(m), centerPose(0, n), 420, .3) : null, ...ms.map((x, i) => fly(x, deckPose('treasure'), centerPose(i + 1, n), 650 + i * 120, 1.4))]);
  renderUI();
  let pick = null;
  if (p.type === 'bot') { await botDelay(600); pick = botShop(p, offers); }
  else if (p.type === 'remote') pick = await askRemoteShop(p, offers);
  else pick = await shopModal(p, offers.map(cardCopy), p.gold, p.hand);
  // перевірка вибору (від гостя приходить лише номер і uid)
  let item = null, paid = [];
  if (pick && offers[pick.i]) {
    item = offers[pick.i];
    if (pick.pay === 'gold' && p.gold >= buyPrice(item)) {
      p.gold -= buyPrice(item); log(`🧳 ${nameTag(p)} купує <b>${esc(item.name)}</b> за ${buyPrice(item)} зол.`); sfx('coins');
    } else if (pick.pay === 'cards') {
      paid = (pick.cards || []).map(u => p.hand.find(c => c.uid === u)).filter(Boolean).filter((c, i, a) => a.indexOf(c) === i);
      if (paid.length !== 2) { item = null; paid = []; }
      else { paid.forEach(c => { removeFromHand(p, c); discard(c); }); log(`🧳 ${nameTag(p)} вимінює <b>${esc(item.name)}</b> на ${paid.map(c => '«' + esc(c.name) + '»').join(' і ')}.`); sfx('equip'); }
    } else item = null;
  }
  if (!item) log(`🧳 ${nameTag(p)} нічого не бере. Торговець іде далі.`);
  await Promise.all(offers.map((c, i) => c === item ? fly(ms[i], poseOf(ms[i]), toHandOf(p), 600, 1, { owner: p.idx }) : fly(ms[i], poseOf(ms[i]), deckPose('treasure'), 520, 1)));
  ms.forEach(disposeMesh);
  offers.forEach(c => { if (c === item) giveCard(p, c); else G.treasureDeck.unshift(c); }); // решта — під низ колоди
  syncDeck('treasure');
  if (m) disposeMesh(m); discard(card);
  renderUI();
}

/* бот: бере найкориснішу річ — за золото, а як грошей нема, то за дві непотрібні карти */
function botShop(p, offers) {
  const gain = c => c.kind === 'gear' ? (canEquip(p, c) ? (c.bonus || 0) * .4 : gearScore(p, gearAfter(p, c)) - gearScore(p, p.gear)) : c.kind === 'levelup' ? (levelsToWin(p) > 1 ? 3 : 0) : c.kind === 'oneshot' ? Math.abs(c.bonus || 0) * .5 : 0.5;
  const best = offers.map((c, i) => ({ c, i, g: gain(c) })).sort((a, b) => b.g - a.g)[0];
  if (!best || best.g < 1) return null;
  if (p.gold >= buyPrice(best.c) && (p.gold - buyPrice(best.c) >= 0)) return { i: best.i, pay: 'gold' };
  const two = payTwo(p);
  if (two.length === 2 && best.g >= 1.5 && two.every(c => keepScore(p, c) < 260)) return { i: best.i, pay: 'cards', cards: two.map(c => c.uid) };
  return null;
}

function askRemoteShop(p, offers, timeout = 90000) {
  return new Promise(res => {
    const id = ++NET.askSeq; let tm;
    const done = (ok, pick) => { if (!NET.asks.has(id)) return; NET.asks.delete(id); clearTimeout(tm); netSendTo(p.idx, { t: 'askEnd', id }); res(ok && pick && typeof pick === 'object' ? pick : null); };
    done.who = p.idx; NET.asks.set(id, done);
    if (p.offline) { done(false); return; }
    tm = setTimeout(() => done(false), timeout);
    netSendTo(p.idx, { t: 'shopAsk', id, offers: offers.map(cardCopy), gold: p.gold });
  });
}

/* вікно крамниці (бачить лише покупець) */
function shopModal(p, offers, gold, hand) {
  return new Promise(res => {
    let sel = -1, mode = 'pick'; const pay = new Set();
    const it = () => offers[sel];
    const draw = () => {
      if (mode === 'cards') return `<h2>🧳 Обмін на «${esc(it().name)}»</h2><p>Обери <b>дві</b> карти з руки, які віддаси торговцю.</p>
        ${cardRow(hand.map(cardCopy), { sel: pay, key: 'mp', tag: () => 'у руці' })}
        <div class="row end"><button class="btn ghost" type="button" id="shBack">Назад</button><button class="btn primary" type="button" id="shGive" ${pay.size === 2 ? '' : 'disabled'}>Віддати 2 карти${pay.size ? ` (${pay.size}/2)` : ''}</button></div>`;
      const pr = sel >= 0 ? buyPrice(it()) : 0;
      return `<h2>🧳 Мандрівний торговець</h2><p>«Подивись, що маю! Одна річ — твоя: за золото або за дві карти з руки.»</p>
        ${cardRow(offers, { sel: new Set(sel >= 0 ? [it().uid] : []), key: 'mo' })}
        <p class="hint">У тебе ${gold} зол. і ${hand.length} карт у руці. Непотрібні речі торговець забере назад.</p>
        <div class="row end"><button class="btn ghost" type="button" id="shNo">Піти далі</button>
          <button class="btn" type="button" id="shTrade" ${sel >= 0 && hand.length >= 2 ? '' : 'disabled'}>Обміняти на 2 карти…</button>
          <button class="btn primary" type="button" id="shBuy" ${sel >= 0 && gold >= pr ? '' : 'disabled'}>${sel < 0 ? 'Обери річ' : gold >= pr ? `Купити · ${pr} зол.` : `Бракує ${pr - gold} зол.`}</button></div>`;
    };
    const fin = r => { $('#sheet').onclick = null; closeModal(); res(r); };
    showModal(draw(), 'wide'); playSfx('alert');
    $('#sheet').onclick = e => {
      const b = e.target.closest('button, [data-mo], [data-mp]'); if (!b) return;
      if (b.dataset.mo) { const u = +b.dataset.mo; sel = offers.findIndex(c => c.uid === u); }
      else if (b.dataset.mp) { const u = +b.dataset.mp; pay.has(u) ? pay.delete(u) : pay.size < 2 && pay.add(u); }
      else if (b.id === 'shNo') return fin(null);
      else if (b.id === 'shBuy') return fin({ i: sel, pay: 'gold' });
      else if (b.id === 'shTrade') mode = 'cards';
      else if (b.id === 'shBack') { mode = 'pick'; pay.clear(); }
      else if (b.id === 'shGive') return fin({ i: sel, pay: 'cards', cards: [...pay] });
      $('#sheet').innerHTML = draw();
    };
  });
}
// торговець з руки
async function playMerchant(p, c) {
  removeFromHand(p, c); renderUI();
  const m = cardMesh(c); scene.add(m);
  await fly(m, fromHandOf(p), centerPose(0, 1), 700, 1.6, { owner: p.idx });
  await merchantVisit(p, c, m);
}
