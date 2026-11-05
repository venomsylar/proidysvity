// Сервер «Пройдисвітів»: акаунти, спільна статистика між пристроями й загальний борд.
// Cloudflare Worker + база D1 (прив'язка DB). Розгортання — див. server/README.md.

const MIN_GAME_MS = 4 * 60 * 1000;      // коротші партії на борд не йдуть
const GAME_TTL_MS = 8 * 60 * 60 * 1000; // незавершена партія «протухає» за 8 годин
const MODES = ['ffa', 'teams', 'coop'];
const ACH_IDS = /^[a-z_]{2,24}$/;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });
const fail = (error, status = 400) => json({ error }, status);
const now = () => Date.now();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));

async function hashPass(pass, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 10000 }, key, 256));
}
function sameStr(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

/* --- статистика: порожня, перевірка пакета змін, додавання --- */
const emptyStats = () => ({ modes: { ffa: { p: 0, w: 0 }, teams: { p: 0, w: 0 }, coop: { p: 0, w: 0 } }, kills: 0, helps: 0, best: null, ach: {} });
const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
function normStats(s) {
  const o = emptyStats(); if (!s || typeof s !== 'object') return o;
  for (const m of MODES) if (s.modes && s.modes[m]) { o.modes[m].p = int(s.modes[m].p, 1e6); o.modes[m].w = Math.min(o.modes[m].p, int(s.modes[m].w, 1e6)); }
  o.kills = int(s.kills, 1e7); o.helps = int(s.helps, 1e7);
  if (s.best && typeof s.best === 'object') o.best = { lvl: int(s.best.lvl, 99), name: String(s.best.name || '').slice(0, 40) };
  if (s.ach && typeof s.ach === 'object') for (const [k, t] of Object.entries(s.ach)) if (ACH_IDS.test(k)) o.ach[k] = int(t, 9e15) || now();
  return o;
}
// пакет змін з одного пристрою: лише додатні прирости, з розумною межею на один пакет
function normDelta(d) {
  const o = normStats(d), cap = (v, m) => Math.min(v, m);
  for (const m of MODES) { o.modes[m].p = cap(o.modes[m].p, 2000); o.modes[m].w = cap(o.modes[m].w, o.modes[m].p); }
  o.kills = cap(o.kills, 20000); o.helps = cap(o.helps, 20000);
  return o;
}
function addStats(a, d) {
  const o = normStats(a);
  for (const m of MODES) { o.modes[m].p += d.modes[m].p; o.modes[m].w += d.modes[m].w; }
  o.kills += d.kills; o.helps += d.helps;
  if (d.best && (!o.best || d.best.lvl > o.best.lvl)) o.best = d.best;
  for (const [k, t] of Object.entries(d.ach)) if (!o.ach[k] || t < o.ach[k]) o.ach[k] = t;
  return o;
}

async function body(req) { try { return await req.json(); } catch (e) { return {}; } }
async function auth(req, env) {
  const h = req.headers.get('Authorization') || '', token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return env.DB.prepare('SELECT u.id, u.name, u.stats FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').bind(token).first();
}
const pubUser = u => ({ id: u.id, name: u.name });
const userStats = u => normStats(JSON.parse(u.stats || '{}'));

async function newSession(env, userId) {
  const token = randHex(32);
  await env.DB.prepare('INSERT INTO sessions (token, user_id, created) VALUES (?, ?, ?)').bind(token, userId, now()).run();
  return token;
}
const nameKey = n => n.toLocaleLowerCase('uk').replace(/ё/g, 'е');
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.\-]{1,14}[\p{L}\p{N}]$/u;

/* --- маршрути --- */
const routes = {
  'POST /auth/register': async (req, env) => {
    const b = await body(req), name = String(b.name || '').trim().replace(/\s+/g, ' '), pass = String(b.pass || '');
    if (!NAME_RE.test(name)) return fail('bad_name');
    if (pass.length < 6 || pass.length > 64) return fail('bad_pass');
    const exists = await env.DB.prepare('SELECT id FROM users WHERE name_key = ?').bind(nameKey(name)).first();
    if (exists) return fail('name_taken', 409);
    const salt = randHex(16), hash = await hashPass(pass, salt);
    const r = await env.DB.prepare('INSERT INTO users (name, name_key, pass, salt, stats, created) VALUES (?, ?, ?, ?, ?, ?)').bind(name, nameKey(name), hash, salt, JSON.stringify(emptyStats()), now()).run();
    const id = r.meta.last_row_id, token = await newSession(env, id);
    return json({ token, user: { id, name }, stats: emptyStats() });
  },
  'POST /auth/login': async (req, env) => {
    const b = await body(req), name = String(b.name || '').trim().replace(/\s+/g, ' '), pass = String(b.pass || '');
    const u = await env.DB.prepare('SELECT * FROM users WHERE name_key = ?').bind(nameKey(name)).first();
    if (!u || !sameStr(await hashPass(pass, u.salt), u.pass)) return fail('bad_login', 401);
    const token = await newSession(env, u.id);
    return json({ token, user: pubUser(u), stats: userStats(u) });
  },
  'POST /auth/logout': async (req, env) => {
    const h = req.headers.get('Authorization') || '';
    if (h.startsWith('Bearer ')) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(h.slice(7)).run();
    return json({ ok: true });
  },
  'GET /me': async (req, env, u) => json({ user: pubUser(u), stats: userStats(u) }),
  // пакет змін статистики з пристрою (той самий id двічі не додається)
  'POST /stats/push': async (req, env, u) => {
    const b = await body(req), id = String(b.id || '');
    if (!/^[0-9a-f]{16,40}$/.test(id)) return fail('bad_id');
    const seen = await env.DB.prepare('SELECT id FROM pushes WHERE id = ?').bind(id).first();
    let stats = userStats(u);
    if (!seen) {
      stats = addStats(stats, normDelta(b.delta));
      await env.DB.batch([
        env.DB.prepare('INSERT INTO pushes (id, user_id, at) VALUES (?, ?, ?)').bind(id, u.id, now()),
        env.DB.prepare('UPDATE users SET stats = ? WHERE id = ?').bind(JSON.stringify(stats), u.id)
      ]);
    }
    return json({ stats });
  },
  'POST /stats/reset': async (req, env, u) => {
    await env.DB.prepare('UPDATE users SET stats = ? WHERE id = ?').bind(JSON.stringify(emptyStats()), u.id).run();
    return json({ stats: emptyStats() });
  },
  // господар починає партію через інтернет: сервер видає їй номер і запамʼятовує учасників
  'POST /game/start': async (req, env, u) => {
    const b = await body(req), mode = MODES.includes(b.mode) ? b.mode : 'ffa';
    const ids = [...new Set((Array.isArray(b.participants) ? b.participants : []).map(Number).filter(Number.isInteger))].slice(0, 6);
    if (!ids.includes(u.id)) return fail('host_not_in_game');
    if (ids.length < 2) return fail('need_two_accounts');
    const found = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).first();
    if (found.n !== ids.length) return fail('unknown_user');
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM games WHERE host_id = ? AND started > ?').bind(u.id, now() - 24 * 3600 * 1000).first();
    if (recent.n >= 60) return fail('too_many_games', 429);
    const id = randHex(12);
    await env.DB.prepare('INSERT INTO games (id, host_id, mode, participants, started) VALUES (?, ?, ?, ?, ?)').bind(id, u.id, mode, JSON.stringify(ids), now()).run();
    return json({ gameId: id, participants: ids, mode });
  },
  // кожен учасник окремо повідомляє, хто переміг; зараховується, коли більшість (не менше двох) кажуть одне й те саме
  'POST /game/result': async (req, env, u) => {
    const b = await body(req), id = String(b.gameId || '');
    const g = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(id).first();
    if (!g) return fail('no_game', 404);
    const parts = JSON.parse(g.participants);
    if (!parts.includes(u.id)) return fail('not_participant', 403);
    if (g.status === 'done') return json({ status: 'confirmed', result: g.result });
    if (g.status !== 'open') return json({ status: g.status });
    const t = now();
    if (t - g.started > GAME_TTL_MS) { await env.DB.prepare("UPDATE games SET status = 'expired' WHERE id = ?").bind(id).run(); return json({ status: 'expired' }); }
    if (t - g.started < Number(env.MIN_GAME_MS ?? MIN_GAME_MS)) return json({ status: 'too_short' });
    const winners = [...new Set((Array.isArray(b.winners) ? b.winners : []).map(Number).filter(x => parts.includes(x)))].sort((a, c) => a - c);
    const result = winners.join(',');
    await env.DB.prepare('INSERT OR IGNORE INTO votes (game_id, user_id, result, at) VALUES (?, ?, ?, ?)').bind(id, u.id, result, t).run();
    const { results: vs } = await env.DB.prepare('SELECT result, COUNT(*) AS n FROM votes WHERE game_id = ? GROUP BY result').bind(id).all();
    const need = Math.max(2, Math.floor(parts.length / 2) + 1);
    const top = vs.sort((a, c) => c.n - a.n)[0];
    if (!top || top.n < need) return json({ status: 'pending', votes: vs.reduce((s, x) => s + x.n, 0), need });
    // підтверджено: оновлюємо борд усім учасникам
    const won = new Set(top.result ? top.result.split(',').map(Number) : []), coop = g.mode === 'coop';
    const upd = await env.DB.prepare("UPDATE games SET status = 'done', result = ?, finished = ? WHERE id = ? AND status = 'open'").bind(top.result, t, id).run();
    if (upd.meta.changes) { // лише той, хто першим закрив партію, оновлює борд — без подвійного рахунку
      await env.DB.batch(parts.map(pid => env.DB.prepare(`INSERT INTO board (user_id, games, wins, coop_games, coop_wins, updated) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET games = games + excluded.games, wins = wins + excluded.wins, coop_games = coop_games + excluded.coop_games, coop_wins = coop_wins + excluded.coop_wins, updated = excluded.updated`)
        .bind(pid, coop ? 0 : 1, !coop && won.has(pid) ? 1 : 0, coop ? 1 : 0, coop && won.has(pid) ? 1 : 0, t)));
    }
    return json({ status: 'confirmed', result: top.result });
  },
  'GET /board': async (req, env, u) => {
    const { results } = await env.DB.prepare(`SELECT b.user_id AS id, u.name, b.games, b.wins, b.coop_games, b.coop_wins
      FROM board b JOIN users u ON u.id = b.user_id WHERE b.games + b.coop_games > 0
      ORDER BY b.wins + b.coop_wins DESC, (b.wins + b.coop_wins) * 1.0 / (b.games + b.coop_games) DESC, b.updated ASC LIMIT 50`).all();
    let me = null;
    if (u) me = await env.DB.prepare('SELECT games, wins, coop_games, coop_wins FROM board WHERE user_id = ?').bind(u.id).first();
    return json({ top: results, me });
  }
};
const OPEN = new Set(['POST /auth/register', 'POST /auth/login', 'POST /auth/logout', 'GET /board']);

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url), key = `${req.method} ${url.pathname.replace(/\/+$/, '') || '/'}`;
    const h = routes[key];
    if (!h) return key === 'GET /' ? json({ ok: true, name: 'proidysvity-api' }) : fail('not_found', 404);
    try {
      const u = await auth(req, env);
      if (!u && !OPEN.has(key)) return fail('auth', 401);
      return await h(req, env, u);
    } catch (e) {
      return fail('server', 500);
    }
  }
};
