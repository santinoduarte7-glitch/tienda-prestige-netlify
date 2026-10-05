import { sign, verify, getCookie, cookie, json, safeEqual } from '../lib/auth.mjs';
import { db, getSetting, setSetting, tooMany, registerFail } from '../lib/db.mjs';

export const config = { path: '/api/*' };

const PUBLIC = new Set(['/api/login', '/api/admin/login', '/api/logout']);
const env = (k) => (typeof Netlify !== 'undefined' ? Netlify.env.get(k) : process.env[k]);
const bodyOf = async (req) => { try { return await req.json(); } catch { return null; } };
const ipOf = (req, ctx) => (ctx && ctx.ip) || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'local';

let catalogCache = null;

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
      const D = db();

      if (p === '/api/admin/orders' && m === 'GET') {
        const st = url.searchParams.get('status') || 'todos';
        const orders = st === 'todos'
          ? await D.sql`SELECT * FROM orders ORDER BY created_at DESC LIMIT 3000`
          : await D.sql`SELECT * FROM orders WHERE status = ${st} ORDER BY created_at DESC LIMIT 3000`;
        const nums = orders.map((o) => o.number);
        const items = nums.length ? await D.sql`SELECT order_number, sku, name, qty, price, terms_accepted FROM order_items WHERE order_number = ANY(${nums})` : [];
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
        if (m === 'GET') return json({ products: await D.sql`SELECT sku, name, category, description, price, image, active FROM products ORDER BY name` });
        if (m === 'DELETE') {
          const sku = url.searchParams.get('sku'); if (!sku) return json({ error: 'Falta el código' }, 400);
          await D.sql`DELETE FROM products WHERE sku = ${sku}`; catalogCache = null; return json({ ok: true });
        }
        if (m === 'POST') {
          const b = await bodyOf(req); if (!b) return json({ error: 'Solicitud inválida' }, 400);
          const rows = Array.isArray(b.rows) ? b.rows : [];
          if (!rows.length || rows.length > 2000) return json({ error: 'El archivo debe tener entre 1 y 2000 filas' }, 400);
          const map = new Map(), errors = [];
          rows.forEach((r, i) => {
            const sku = String(r.sku ?? '').trim(), name = String(r.name ?? '').trim(), price = Number(r.price);
            if (!sku || sku.length > 40 || !name || name.length > 160 || !Number.isFinite(price) || price < 0) { errors.push(`Fila ${i + 2}: código, nombre o precio inválido`); return; }
            map.set(sku, [sku, name, String(r.category ?? '').trim().slice(0, 60), String(r.description ?? '').slice(0, 400), price, String(r.image ?? '').trim().slice(0, 300), r.active !== false, Date.now()]);
          });
          if (errors.length) return json({ error: errors.slice(0, 5).join(' · ') + (errors.length > 5 ? ` · (+${errors.length - 5} más)` : '') }, 400);
          const v = [...map.values()], col = (i) => v.map((x) => x[i]);
          await D.pool.query(`INSERT INTO products (sku, name, category, description, price, image, active, updated_at)
            SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::text[], $7::boolean[], $8::float8[])
            ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, description = EXCLUDED.description,
              price = EXCLUDED.price, image = EXCLUDED.image, active = EXCLUDED.active, updated_at = EXCLUDED.updated_at`,
            [col(0), col(1), col(2), col(3), col(4), col(5), col(6), col(7)]);
          catalogCache = null;
          return json({ ok: true, count: v.length });
        }
      }
      if (p === '/api/admin/settings') {
        if (m === 'GET') return json({ access_code: await getSetting('access_code', 0) });
        if (m === 'POST') {
          const b = await bodyOf(req); if (!b) return json({ error: 'Solicitud inválida' }, 400);
          const code = String(b.access_code || '').trim();
          if (code.length < 6 || code.length > 40) return json({ error: 'La clave debe tener entre 6 y 40 caracteres' }, 400);
          await setSetting('access_code', code);
          await setSetting('access_version', Number(await getSetting('access_version', 0)) + 1);
          return json({ ok: true });
        }
      }
      return json({ error: 'No encontrado' }, 404);
    }

    /* ---------- empleados ---------- */
    const t = await verify(SECRET, getCookie(req, 'pa_u'));
    const ver = await getSetting('access_version');
    if (!t || t.r !== 'u' || String(t.v) !== String(ver)) return json({ error: 'No autorizado' }, 401);

    if (p === '/api/catalog' && m === 'GET') {
      const headers = { 'Cache-Control': 'private, max-age=30' };
      if (catalogCache && Date.now() - catalogCache.t < 30000) return json(catalogCache.v, 200, headers);
      const products = await db().sql`SELECT sku, name, category, description, price, image FROM products WHERE active ORDER BY name`;
      catalogCache = { t: Date.now(), v: { products } };
      return json(catalogCache.v, 200, headers);
    }
    if (p === '/api/orders' && m === 'POST') return await createOrder(req);
    return json({ error: 'No encontrado' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: 'Error del servidor' }, 500);
  }
};

const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(3))).map((b) => b.toString(36).toUpperCase().padStart(2, '0')).join('').slice(0, 4);
const orderNumber = () => 'PED-' + new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '') + '-' + rnd();

async function createOrder(req) {
  const b = await bodyOf(req); if (!b) return json({ error: 'Solicitud inválida' }, 400);
  const c = b.customer || {};
  const name = String(c.name || '').trim(), legajo = String(c.legajo || ''), dni = String(c.dni || ''), email = String(c.email || '').trim(), phone = String(c.tel || '');
  if (name.length < 3 || name.length > 120 || !/^\d{1,10}$/.test(legajo) || !/^\d{6,9}$/.test(dni) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120 || !/^\d{6,15}$/.test(phone))
    return json({ error: 'Datos del empleado inválidos' }, 400);
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length || items.length > 50) return json({ error: 'Pedido vacío o demasiado grande' }, 400);
  const skus = [...new Set(items.map((i) => String(i.sku)))];
  const found = await db().sql`SELECT sku, name, price FROM products WHERE active AND sku = ANY(${skus})`;
  const map = new Map(found.map((r) => [r.sku, r]));
  let total = 0; const lines = [];
  for (const i of items) {
    const p = map.get(String(i.sku)), qty = Number(i.qty);
    if (!p) return json({ error: 'Un producto ya no está disponible. Actualizá la página.' }, 409);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) return json({ error: 'Cantidad inválida' }, 400);
    if (i.accepted !== true) return json({ error: 'Falta aceptar los términos y condiciones' }, 400);
    total += p.price * qty; lines.push({ p, qty });
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = orderNumber();
    const client = await db().pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO orders (number, created_at, status, name, legajo, dni, email, phone, total) VALUES ($1,$2,\'nuevo\',$3,$4,$5,$6,$7,$8)', [number, Date.now(), name, legajo, dni, email, phone, total]);
      for (const { p, qty } of lines) await client.query('INSERT INTO order_items (order_number, sku, name, qty, price, terms_accepted) VALUES ($1,$2,$3,$4,$5,true)', [number, p.sku, p.name, qty, p.price]);
      await client.query('COMMIT');
      return json({ number, total });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      if (e && e.code !== '23505') throw e;
    } finally { client.release(); }
  }
  return json({ error: 'No se pudo generar el número de pedido' }, 500);
}
