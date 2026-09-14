// HR app share endpoints — Cloudflare Worker + KV.
//
// Tenant-scoped paths so multiple customers can share the same
// Worker without their data ever colliding:
//   POST /t/:tenant/rsvp/:eventId/:guestId      → store RSVP
//   GET  /t/:tenant/rsvp/:eventId               → list all RSVPs for event
//   POST /t/:tenant/training/:assignmentId      → store training progress
//   GET  /t/:tenant/training/:assignmentId      → read training progress
//
// (The pre-tenant paths /rsvp/... and /training/... are kept as a
// legacy alias — they route to the "fura" tenant for old links.)
//
// Anyone with an event id / assignment id can read + write on their
// own tenant — the "secret" is the unguessable id, same threat model
// as an unlisted GDrive link. There is no PII on these endpoints
// beyond a name + a comment the recipient types in.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    const url = new URL(request.url);
    let path = url.pathname.replace(/\/$/, '');

    // Legacy alias: routes without /t/:tenant map to the fura tenant.
    if (path.startsWith('/rsvp/') || path.startsWith('/training/')) {
      path = '/t/fura' + path;
    }

    // POST /t/:tenant/rsvp/:eventId/:guestId
    let m = path.match(/^\/t\/([a-z0-9_-]{1,40})\/rsvp\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/);
    if (m) {
      const [, tenant, eventId, guestId] = m;
      if (request.method === 'POST') {
        const body = await safeJson(request);
        if (!body) return err(400, 'bad json');
        await env.HR.put(`t:${tenant}:rsvp:${eventId}:${guestId}`, JSON.stringify({
          rsvp: str(body.rsvp),
          name: str(body.name),
          comment: str(body.comment),
          at: str(body.at) || new Date().toISOString(),
        }));
        return json({ ok: true });
      }
      return err(405, 'method not allowed');
    }

    // GET /t/:tenant/rsvp/:eventId
    m = path.match(/^\/t\/([a-z0-9_-]{1,40})\/rsvp\/([A-Za-z0-9_-]+)$/);
    if (m) {
      const [, tenant, eventId] = m;
      if (request.method === 'GET') {
        const prefix = `t:${tenant}:rsvp:${eventId}:`;
        const list = await env.HR.list({ prefix });
        const entries = await Promise.all(list.keys.map(async k => {
          const v = await env.HR.get(k.name);
          if (!v) return null;
          return [k.name.slice(prefix.length), JSON.parse(v)];
        }));
        const out = {};
        for (const e of entries) if (e) out[e[0]] = e[1];
        return json(out);
      }
      return err(405, 'method not allowed');
    }

    // /t/:tenant/training/:assignmentId  (GET or POST)
    m = path.match(/^\/t\/([a-z0-9_-]{1,40})\/training\/([A-Za-z0-9_-]+)$/);
    if (m) {
      const [, tenant, aid] = m;
      const key = `t:${tenant}:train:${aid}`;
      if (request.method === 'POST') {
        const body = await safeJson(request);
        if (!body) return err(400, 'bad json');
        await env.HR.put(key, JSON.stringify({
          done_items: Array.isArray(body.done_items) ? body.done_items.map(String) : [],
          updated_at: str(body.updated_at) || new Date().toISOString(),
        }));
        return json({ ok: true });
      }
      if (request.method === 'GET') {
        const v = await env.HR.get(key);
        return json(v ? JSON.parse(v) : null);
      }
      return err(405, 'method not allowed');
    }

    if (path === '' || path === '/') {
      return json({ service: 'hr-app-share', ok: true });
    }
    return err(404, 'not found');
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}
function err(status, msg) {
  return json({ error: msg }, status);
}
async function safeJson(req) {
  try { return await req.json(); } catch (_) { return null; }
}
function str(v) {
  return typeof v === 'string' ? v.slice(0, 4000) : '';
}
