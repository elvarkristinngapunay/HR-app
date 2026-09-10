# hr-app-share Worker

Public share endpoints for the HR app (RSVP + training progress).
Runs on Cloudflare Workers, backed by a KV namespace.

## Deploy (5-min, one time)

```bash
cd worker

# 1) Log in (opens browser once)
npx wrangler login

# 2) Create the KV namespace and copy the id it prints
npx wrangler kv namespace create HR

# 3) Paste that id into wrangler.toml (replace REPLACE_WITH_KV_ID)

# 4) Deploy
npx wrangler deploy
```

Wrangler prints the deployed URL, e.g.

```
https://hr-app-share.<your-subdomain>.workers.dev
```

Copy that URL and paste it into `app.js` at the top:

```js
const WORKER_URL = 'https://hr-app-share.<your-subdomain>.workers.dev';
```

Commit and push — GitHub Pages picks it up in ~1 minute.

## Redeploy after changing worker code

```bash
cd worker && npx wrangler deploy
```

## Endpoints

- `POST /rsvp/:eventId/:guestId` `{rsvp, name, comment, at}` — store RSVP
- `GET  /rsvp/:eventId` → `{guestId: {rsvp, name, comment, at}, ...}`
- `POST /training/:assignmentId` `{done_items, updated_at}` — store progress
- `GET  /training/:assignmentId` → `{done_items, updated_at}` or `null`

There is no auth. The "secret" is the opaque event / assignment id
that only whoever holds the share link knows — same threat model as
an unlisted GDrive link.
