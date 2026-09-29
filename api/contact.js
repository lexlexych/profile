// Vercel Serverless Function: POST /api/contact → сообщение в Telegram.
// Переменные окружения (Vercel → Project → Settings → Environment Variables):
//   TG_BOT_TOKEN — токен бота от @BotFather
//   TG_CHAT_ID   — id чата, куда слать (свой id можно узнать у @userinfobot)

const LIMITS = { email: 200, name: 200, company: 200, message: 3500 };

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  const { TG_BOT_TOKEN, TG_CHAT_ID } = process.env;
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return res.status(500).json({ ok: false, error: 'not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false });

  // Honeypot: скрытое поле, которое заполняют только боты. Отвечаем «ок», но ничего не шлём.
  if (body.website) return res.status(200).json({ ok: true });

  const f = {};
  for (const k of Object.keys(LIMITS)) f[k] = String(body[k] ?? '').trim().slice(0, LIMITS[k]);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email) || f.name.length < 2 || f.message.length < 2) {
    return res.status(400).json({ ok: false });
  }

  const text = [
    '📨 Новое сообщение с сайта',
    '',
    `Имя: ${f.name}`,
    `Email: ${f.email}`,
    f.company ? `Фирма: ${f.company}` : null,
    '',
    f.message,
  ].filter(v => v != null).join('\n');

  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text, disable_web_page_preview: true }),
    });
    if (!r.ok) {
      console.error('telegram', r.status, await r.text());
      return res.status(502).json({ ok: false });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('telegram', e);
    return res.status(502).json({ ok: false });
  }
};
