import { sign, verify, getCookie, cookie, json, safeEqual } from '../lib/auth.mjs';
import { db, getSetting, setSetting, getAllSettings, dropSettingsCache, tooMany, registerFail } from '../lib/db.mjs';

export const config = { path: '/api/*' };

const env = (k) => (typeof Netlify !== 'undefined' ? Netlify.env.get(k) : process.env[k]);
const bodyOf = async (req) => { try { return await req.json(); } catch { return null; } };
const ipOf = (req, ctx) => (ctx && ctx.ip) || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'local';
const CUR = new Set(['ARS', 'USD']);
const SETTING_KEYS = ['terms', 'hero_title', 'hero_subtitle', 'hero_image', 'logo', 'banner', 'store_open', 'closed_msg'];
const publicConfig = (s) => ({
  terms: s.terms || '', terms_version: Number(s.terms_version || 1), hero_title: s.hero_title || '', hero_subtitle: s.hero_subtitle || '',
  hero_image: s.hero_image || '', logo: s.logo || '', banner: s.banner || '', store_open: s.store_open !== '0', closed_msg: s.closed_msg || '',
});

export default async (req, ctx) => {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, '');
  const m = req.method;
  const SECRET = env('SESSION_SECRET');

  if (m !== 'GET') {
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'Origen no permitido' }, 403);
  }

  try {
    /* ---------- públicas ---------- */
    if (p.startsWith('/api/img/') && m === 'GET') return await serveImage(p.slice(9));
    if (p === '/api/branding' && m === 'GET') {
      const s = await getAllSettings();
      return json({ logo: s.logo || '' }, 200, { 'Cache-Control': 'public, max-age=60' });
    }
    if (p === '/api/login' && m === 'POST') {
      const ip = ipOf(req, ctx);
      if (await tooMany(ip, 'u')) return json({ error: 'Demasiados intentos. Esperá unos minutos.' }, 429);
      const b = await bodyOf(req); if (!b) return json({ error: 'Solicitud inválida' }, 400);
      const code = String(b.code || '').trim();
      const real = await getSetting('access_code', 0);
      if (!code || !real || !safeEqual(code.toLowerCase(), String(real).toLowerCase())) { await registerFail(ip, 'u'); return json({ error: 'Clave incorrecta' }, 401); }
      const v = await getSetting('access_version', 0);
      const token = await sign(SECRET, { r: 'u', v, exp: Date.now() + 30 * 86400000 });
      return json({ ok: true }, 200, { 'Set-Cookie': cookie('pa_u', token, 30 * 86400) });
    }
    if (p === '/api/logout') {
      const h = new Headers({ 'Content-Type': 'application/json' });
      h.append('Set-Cookie', cookie('pa_u', '', 0)); h.append('Set-Cookie', cookie('pa_a', '', 0));
      return new Response(JSON.stringify({ ok: true }), { headers: h });
    }
    if (p === '/api/admin/login' && m === 'POST') {
      const ip = ipOf(req, ctx);
      if (await tooMany(ip, 'a')) return json({ error: 'Demasiados intentos. Esperá 15 minutos.' }, 429);
      const b = await bodyOf(req); if (!b) return json({ error: 'Solicitud inválida' }, 400);
      const AP = env('ADMIN_PASSWORD');
      if (!AP || !safeEqual(String(b.password || ''), String(AP))) { await registerFail(ip, 'a'); return json({ error: 'Contraseña incorrecta' }, 401); }
      const token = await sign(SECRET, { r: 'a', exp: Date.now() + 12 * 3600 * 1000 });
      return json({ ok: true }, 200, { 'Set-Cookie': cookie('pa_a', token, 12 * 3600) });
    }

    /* ---------- administrador ---------- */
    if (p.startsWith('/api/admin/')) {
      const t = await verify(SECRET, getCookie(req, 'pa_a'));
      if (!t || t.r !== 'a') return json({ error: 'No autorizado' }, 401);
      return await admin(p, m, url, req);
    }

    /* ---------- empleados ---------- */
    const t = await verify(SECRET, getCookie(req, 'pa_u'));
    const ver = await getSetting('access_version');
    if (!t || t.r !== 'u' || String(t.v) !== String(ver)) return json({ error: 'No autorizado' }, 401);

    if (p === '/api/catalog' && m === 'GET') {
      const [products, s] = await Promise.all([
        db().sql`SELECT sku, name, category, description, price, currency, image, featured FROM products WHERE active ORDER BY featured DESC, name`,
        getAllSettings(),
      ]);
      return json({ products, config: publicConfig(s) }, 200, { 'Cache-Control': 'private, no-cache' });
    }
    if (p === '/api/orders' && m === 'POST') return await createOrder(req);
    return json({ error: 'No encontrado' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: 'Error del servidor' }, 500);
  }
};

/* ---------- imágenes ---------- */
function sniff(buf) {
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG') return 'image/png';
  return null;
}
async function serveImage(id) {
  if (!/^[a-f0-9]{16,40}t?$/.test(id)) return new Response('No encontrado', { status: 404 });
  const rows = await db().sql`SELECT mime, data FROM images WHERE id = ${id}`;
  if (!rows.length) return new Response('No encontrado', { status: 404 });
  return new Response(rows[0].data, { headers: {
    'Content-Type': rows[0].mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Netlify-CDN-Cache-Control': 'public, max-age=31536000, durable',
    'X-Content-Type-Options': 'nosniff',
  } });
}

/* ---------- pedidos ---------- */
const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(3))).map((b) => b.toString(36).toUpperCase().padStart(2, '0')).join('').slice(0, 4);
const orderNumber = () => 'PED-' + new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '') + '-' + rnd();

async function createOrder(req) {
  const s = await getAllSettings(5000);
  if (s.store_open === '0') return json({ error: s.closed_msg || 'La tienda está cerrada.' }, 409);
  const b = await bodyOf(req); if (!b) return json({ error: 'Solicitud inválida' }, 400);
  const c = b.customer || {};
  const name = String(c.name || '').trim(), legajo = String(c.legajo || ''), dni = String(c.dni || ''), email = String(c.email || '').trim(), phone = String(c.tel || '');
  if (name.length < 3 || name.length > 120 || !/^\d{1,10}$/.test(legajo) || !/^\d{6,9}$/.test(dni) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120 || !/^\d{6,15}$/.test(phone))
    return json({ error: 'Datos del empleado inválidos' }, 400);
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length || items.length > 50) return json({ error: 'Pedido vacío o demasiado grande' }, 400);
  const skus = [...new Set(items.map((i) => String(i.sku)))];
  const found = await db().sql`SELECT sku, name, price, currency FROM products WHERE active AND sku = ANY(${skus})`;
  const map = new Map(found.map((r) => [r.sku, r]));
  let totalArs = 0, totalUsd = 0; const lines = [];
  for (const i of items) {
    const p = map.get(String(i.sku)), qty = Number(i.qty);
    if (!p) return json({ error: 'Un producto ya no está disponible. Actualizá la página.' }, 409);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) return json({ error: 'Cantidad inválida' }, 400);
    if (i.accepted !== true) return json({ error: 'Falta aceptar los términos y condiciones' }, 400);
    if (p.currency === 'USD') totalUsd += p.price * qty; else totalArs += p.price * qty;
    lines.push({ p, qty });
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = orderNumber();
    const client = await db().pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO orders (number, created_at, status, name, legajo, dni, email, phone, total, total_usd, terms_version) VALUES ($1,$2,\'nuevo\',$3,$4,$5,$6,$7,$8,$9,$10)',
        [number, Date.now(), name, legajo, dni, email, phone, totalArs, totalUsd, Number(s.terms_version || 1)]);
      for (const { p, qty } of lines) await client.query('INSERT INTO order_items (order_number, sku, name, qty, price, currency, terms_accepted) VALUES ($1,$2,$3,$4,$5,$6,true)', [number, p.sku, p.name, qty, p.price, p.currency]);
      await client.query('COMMIT');
      return json({ number, total_ars: totalArs, total_usd: totalUsd });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      if (e && e.code !== '23505') throw e;
    } finally { client.release(); }
  }
  return json({ error: 'No se pudo generar el número de pedido' }, 500);
}

/* ---------- administración ---------- */
async function admin(p, m, url, req) {
  const D = db();

  if (p === '/api/admin/stats' && m === 'GET') {
    const [byStatus, units, top, perDay] = await Promise.all([
      D.sql`SELECT status, COUNT(*)::int AS c, COALESCE(SUM(total),0)::float8 AS ars, COALESCE(SUM(total_usd),0)::float8 AS usd FROM orders GROUP BY status`,
      D.sql`SELECT COALESCE(SUM(oi.qty),0)::int AS u FROM order_items oi JOIN orders o ON o.number = oi.order_number WHERE o.status <> 'cancelado'`,
      D.sql`SELECT oi.sku, oi.name, SUM(oi.qty)::int AS units FROM order_items oi JOIN orders o ON o.number = oi.order_number WHERE o.status <> 'cancelado' GROUP BY oi.sku, oi.name ORDER BY units DESC LIMIT 5`,
      D.sql`SELECT to_char(to_timestamp(created_at / 1000) AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD') AS d, COUNT(*)::int AS c FROM orders WHERE created_at > ${Date.now() - 14 * 86400000} AND status <> 'cancelado' GROUP BY 1 ORDER BY 1`,
    ]);
    return json({ byStatus, units: units[0].u, top, perDay });
  }

  if (p === '/api/admin/orders' && m === 'GET') {
    const st = url.searchParams.get('status') || 'todos';
    const orders = st === 'todos'
      ? await D.sql`SELECT * FROM orders ORDER BY created_at DESC LIMIT 3000`
      : await D.sql`SELECT * FROM orders WHERE status = ${st} ORDER BY created_at DESC LIMIT 3000`;
    const nums = orders.map((o) => o.number);
    const items = nums.length ? await D.sql`SELECT order_number, sku, name, qty, price, currency, terms_accepted FROM order_items WHERE order_number = ANY(${nums})` : [];
    const by = {}; items.forEach((i) => (by[i.order_number] ||= []).push(i));
    return json({ orders: orders.map((o) => ({ ...o, items: by[o.number] || [] })) });
  }
  if (p === '/api/admin/status' && m === 'POST') {
    const b = await bodyOf(req); if (!b) return json({ error: 'Solicitud inválida' }, 400);
    const nums = Array.isArray(b.numbers) ? b.numbers.map(String).slice(0, 3000) : [];
    if (!['nuevo', 'exportado', 'cancelado'].includes(b.status) || !nums.length) return json({ error: 'Datos inválidos' }, 400);
    await D.sql`UPDATE orders SET status = ${b.status} WHERE number = ANY(${nums})`;
    return json({ ok: true });
  }

  if (p === '/api/admin/products') {
    if (m === 'GET') return json({ products: await D.sql`SELECT sku, name, category, description, price, currency, image, active, featured FROM products ORDER BY name` });
    if (m === 'DELETE') {
      const sku = url.searchParams.get('sku'); if (!sku) return json({ error: 'Falta el código' }, 400);
      await D.sql`DELETE FROM products WHERE sku = ${sku}`; return json({ ok: true });
    }
    if (m === 'POST') {
      const b = await bodyOf(req); if (!b) return json({ error: 'Solicitud inválida' }, 400);
      const rows = Array.isArray(b.rows) ? b.rows : [];
      if (!rows.length || rows.length > 2000) return json({ error: 'El archivo debe tener entre 1 y 2000 filas' }, 400);
      const map = new Map(), errors = [];
      rows.forEach((r, i) => {
        const sku = String(r.sku ?? '').trim(), name = String(r.name ?? '').trim(), price = Number(r.price);
        const cur = String(r.currency ?? '').trim().toUpperCase();
        if (!sku || sku.length > 40 || !name || name.length > 160 || !Number.isFinite(price) || price < 0 || (cur && !CUR.has(cur))) { errors.push(`Fila ${i + 2}: código, nombre, precio o moneda inválidos`); return; }
        map.set(sku, [sku, name, String(r.category ?? '').trim().slice(0, 60), String(r.description ?? '').slice(0, 400), price, String(r.image ?? '').trim().slice(0, 300), cur, r.active !== false, Date.now()]);
      });
      if (errors.length) return json({ error: errors.slice(0, 5).join(' · ') + (errors.length > 5 ? ` · (+${errors.length - 5} más)` : '') }, 400);
      const v = [...map.values()], col = (i) => v.map((x) => x[i]);
      const args = [col(0), col(1), col(2), col(3), col(4), col(5), col(6), col(7), col(8)];
      const T = 'unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::text[], $7::text[], $8::boolean[], $9::float8[]) AS t(sku, name, category, description, price, image, currency, active, ts)';
      const c = await D.pool.connect();
      try {
        await c.query('BEGIN');
        await c.query(`UPDATE products p SET name = t.name, category = t.category, description = t.description, price = t.price,
          image = CASE WHEN t.image = '' THEN p.image ELSE t.image END, currency = CASE WHEN t.currency = '' THEN p.currency ELSE t.currency END,
          active = t.active, updated_at = t.ts FROM ${T} WHERE p.sku = t.sku`, args);
        await c.query(`INSERT INTO products (sku, name, category, description, price, image, currency, active, updated_at)
          SELECT sku, name, category, description, price, image, COALESCE(NULLIF(currency, ''), 'ARS'), active, ts FROM ${T} ON CONFLICT (sku) DO NOTHING`, args);
        await c.query('COMMIT');
      } catch (e) { try { await c.query('ROLLBACK'); } catch {} throw e; } finally { c.release(); }
      return json({ ok: true, count: v.length });
    }
  }
  if (p === '/api/admin/product' && m === 'POST') {
    const b = await bodyOf(req); if (!b) return json({ error: 'Solicitud inválida' }, 400);
    const sku = String(b.sku ?? '').trim(), name = String(b.name ?? '').trim(), price = Number(b.price), cur = String(b.currency || 'ARS').toUpperCase();
    if (!sku || sku.length > 40 || !name || name.length > 160 || !Number.isFinite(price) || price < 0 || !CUR.has(cur)) return json({ error: 'Revisá código, nombre, precio y moneda.' }, 400);
    const image = String(b.image ?? '').trim().slice(0, 300);
    await D.sql`INSERT INTO products (sku, name, category, description, price, currency, image, active, featured, updated_at)
      VALUES (${sku}, ${name}, ${String(b.category ?? '').trim().slice(0, 60)}, ${String(b.description ?? '').slice(0, 400)}, ${price}, ${cur}, ${image}, ${b.active !== false}, ${b.featured === true}, ${Date.now()})
      ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, description = EXCLUDED.description, price = EXCLUDED.price,
        currency = EXCLUDED.currency, image = EXCLUDED.image, active = EXCLUDED.active, featured = EXCLUDED.featured, updated_at = EXCLUDED.updated_at`;
    return json({ ok: true });
  }
  if (p === '/api/admin/product-flag' && m === 'POST') {
    const b = await bodyOf(req); if (!b || !b.sku) return json({ error: 'Solicitud inválida' }, 400);
    if (typeof b.active === 'boolean') await D.sql`UPDATE products SET active = ${b.active}, updated_at = ${Date.now()} WHERE sku = ${String(b.sku)}`;
    if (typeof b.featured === 'boolean') await D.sql`UPDATE products SET featured = ${b.featured}, updated_at = ${Date.now()} WHERE sku = ${String(b.sku)}`;
    return json({ ok: true });
  }

  if (p === '/api/admin/image' && m === 'POST') {
    const b = await bodyOf(req); if (!b || !b.full || !b.thumb) return json({ error: 'Solicitud inválida' }, 400);
    const full = Buffer.from(String(b.full.data || ''), 'base64'), thumb = Buffer.from(String(b.thumb.data || ''), 'base64');
    if (!full.length || !thumb.length || full.length > 900000 || thumb.length > 300000) return json({ error: 'Imagen demasiado grande' }, 413);
    const mf = sniff(full), mt = sniff(thumb); if (!mf || !mt) return json({ error: 'Formato de imagen no válido' }, 400);
    const id = Array.from(crypto.getRandomValues(new Uint8Array(8))).map((x) => x.toString(16).padStart(2, '0')).join('');
    const now = Date.now();
    await D.sql`INSERT INTO images (id, mime, data, created_at) VALUES (${id}, ${mf}, ${full}, ${now}), (${id + 't'}, ${mt}, ${thumb}, ${now})`;
    return json({ id });
  }

  if (p === '/api/admin/settings') {
    if (m === 'GET') {
      const s = await getAllSettings(0);
      return json({ ...publicConfig(s), access_code: s.access_code || '' });
    }
    if (m === 'POST') {
      const b = await bodyOf(req); const v = b && b.values; if (!v || typeof v !== 'object') return json({ error: 'Solicitud inválida' }, 400);
      const cur = await getAllSettings(0);
      for (const k of SETTING_KEYS) {
        if (!(k in v)) continue;
        let val = String(v[k] ?? '');
        if (k === 'terms') {
          val = val.slice(0, 20000);
          if (val !== (cur.terms || '')) await setSetting('terms_version', Number(cur.terms_version || 1) + 1);
        }
        if (k === 'store_open') val = v[k] === false || v[k] === '0' ? '0' : '1';
        if (['hero_title', 'hero_subtitle', 'banner', 'closed_msg'].includes(k)) val = val.slice(0, 300);
        if (['hero_image', 'logo'].includes(k) && val && !/^img:[a-f0-9]{16}$/.test(val)) continue;
        await setSetting(k, val);
      }
      if ('access_code' in v) {
        const code = String(v.access_code || '').trim();
        if (code.length < 6 || code.length > 40) return json({ error: 'La clave debe tener entre 6 y 40 caracteres' }, 400);
        if (code !== cur.access_code) { await setSetting('access_code', code); await setSetting('access_version', Number(cur.access_version || 1) + 1); }
      }
      dropSettingsCache();
      return json({ ok: true });
    }
  }
  return json({ error: 'No encontrado' }, 404);
}
