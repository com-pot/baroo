# lizard.kous.at — the standalone counter

The lizard toy is served from the same build and the same node process as `baroo.kous.at`.
`src/hooks.ts` claims `/` for the hosts listed in `COUNTER_HOSTS` and rewrites it to `/gzt`;
everything else falls through untouched, so `/gzt` stays reachable on the main host for
testing.

Nothing in the app is host-aware beyond that hook. There is no second build, no second pm2
process, and no env var to set — `adapter-node` already derives each request's origin from
the incoming `Host` header, which is what makes the hook see the real hostname.

> Do **not** set `ORIGIN`. It pins the origin for every host, which breaks the hook and
> makes form POSTs on the second host fail the CSRF check.

## PocketBase

One-off, per instance:

1. Import the `counter_contributions` collection from `data/pb_schema.json`
   (Admin UI → Settings → Import collections; merge, do not wipe).
2. Make sure `counters` has a row with `name = "lizard"`. `createRule` is superuser-only, so
   it has to be created by hand — `/api/counters/lizard` returns 404 until it exists.

`counter_contributions` carries public create/update rules, the same as `counters`, because
the anonymous client behind `/api/counters` is what writes it.

Note PocketBase's automigrate writes a `data/pb_migrations/*.js` file when a collection is
created through the admin UI or the API. The repo does not track those — delete it, or leave
it be; `data/pb_schema.json` is the schema of record.

## pm2

Unchanged, with one constraint: keep the app in **fork** mode. `src/lib/counters/counters.server.ts`
serialises counter pushes in-process, and under `cluster` that queue would be per-worker.
The increments themselves use PocketBase's `+` field modifier, so the total stays correct
either way — but the per-device contribution upsert could double-create.

## Caddy

An allowlist rather than a blocklist: a blocklist eventually lets `/backstage/something-new`
through.

```caddy
lizard.kous.at {
    encode zstd gzip

    rewrite /manifest.webmanifest /manifest.lizard.webmanifest

    @counter path / /en /gzt /gzt/* \
                  /_app/* /assets/* \
                  /manifest.webmanifest /manifest.lizard.webmanifest \
                  /service-worker.js /robots.txt \
                  /api/counters/lizard
    handle @counter {
        reverse_proxy 127.0.0.1:3000
    }

    handle {
        respond "Not found" 404
    }
}
```

`/_app/*` and `/assets/*` are not optional. `src/service-worker.ts` precaches
`[...build, ...files]` with `cache.addAll`, which is all-or-nothing, and SvelteKit registers
the worker on every SSR'd page. If Caddy 404s a single precached file the install rejects
and the worker never activates — silently, because the page itself still works. As of this
writing the precache is 118 entries: `/_app/*`, `/assets/*`, both manifests and
`/robots.txt`.

`/api/counters/lizard` rather than `/api/counters/*` keeps the other counters private.
`/storage` is deliberately absent — it is proxied straight into the PocketBase container on
the main host and has no business being reachable here.

## Verification

Before Caddy, straight against the node process — this is the whole proof that per-host
rerouting works:

```sh
curl -s -H 'Host: lizard.kous.at' http://127.0.0.1:3000/ | grep -c btn-lizard   # the counter
curl -s http://127.0.0.1:3000/ | grep -c landing                                # the landing
```

After Caddy:

- `https://lizard.kous.at/` serves the counter; `/backstage`, `/bar/x`, `/enroll`, `/login`
  and `/storage/...` all 404 from Caddy.
- `https://baroo.kous.at/` is unchanged, and a `/login` POST still succeeds — that POST is
  the canary for any origin regression.
- On lizard, DevTools → Application → Service Workers reads **activated**, not an install
  error.
- Clicking on lizard and on a bar kiosk move the same total.
