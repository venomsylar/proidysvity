# Сервер «Пройдисвітів»

Акаунти, спільна статистика між пристроями й загальний борд. Це Cloudflare Worker із базою D1 —
на безкоштовному тарифі Cloudflare цього з великим запасом вистачає.

Гра шукає сервер за адресою `https://proidysvity-api.sylar11111.workers.dev`
(див. `API_URL` у `js/account.js`). Поки сервер не розгорнуто, гра працює як раніше,
а у вікні «Акаунт» пише, що сервер недоступний.

## Варіант А — через сайт Cloudflare (без терміналу)

1. **База.** Storage & Databases → D1 SQL Database → Create → назва `proidysvity`.
   Відкрий її → вкладка **Console** → встав увесь вміст `schema.sql` → Execute.
2. **Worker.** Workers & Pages → Create → Start with Hello World → назва `proidysvity-api` → Deploy.
   Далі **Edit code** → заміни весь код вмістом `src/index.js` → Deploy.
3. **Звʼязати.** У цього Worker: Settings → Bindings → Add → D1 database →
   Variable name: `DB`, база: `proidysvity` → Save (Worker перезапуститься сам).
4. Перевір: відкрий `https://proidysvity-api.sylar11111.workers.dev` — має бути `{"ok":true,...}`.

## Варіант Б — через термінал (потрібен Node.js)

```
cd ~/projects/proidysvity/server
npx wrangler login
npx wrangler d1 create proidysvity          # скопіюй database_id у wrangler.toml
npx wrangler d1 execute proidysvity --remote --file=schema.sql
npx wrangler deploy
```

## Як влаштовано

- **Акаунт:** імʼя + пароль (пароль зберігається лише як хеш PBKDF2). Пошта не потрібна.
- **Статистика:** пристрій надсилає лише прирости з останньої синхронізації (з унікальним id —
  повторний запит не додасть двічі). Тому гра на кількох пристроях складається, а не перезаписується.
- **Загальний борд:** господар партії через інтернет отримує від сервера номер партії й список
  учасників з акаунтами (щонайменше двоє). Після гри кожен учасник окремо надсилає, хто переміг.
  Результат зараховується, коли його підтвердила більшість (і не менше двох), і лише для партій
  довших за 4 хвилини. Незавершені партії «протухають» за 8 годин.
