# Suncoast Signages

Cloud-based digital signage (like AbleSign.TV): upload images and videos once,
then display them on any TV or browser at any location via a simple link.
Runs entirely on Cloudflare:

- **Cloudflare Workers** — hosts the admin app, the player, and the API
- **Cloudflare D1** — database (screens, groups, playlists, content metadata, reports)
- **Cloudflare R2** — storage for the uploaded image/video files

## How it works

1. Open the admin dashboard (no login required).
2. Upload images/videos in **Content**, add web pages in **Websites**.
3. Create a **Screen** for each TV/location and build its playlist
   (or put screens in a **Group** to control many screens with one playlist).
4. On each TV, open the screen's player link in any browser:

   ```
   https://<your-worker>.workers.dev/play/<screen-id>
   ```

   That's it — the TV now plays that screen's playlist. Players check in every
   30 seconds, so playlist changes appear on all locations within ~30s and the
   dashboard shows live Online/Offline status for every screen.

Works on anything with a browser: smart TVs, Fire TV/Android TV browsers,
a Raspberry Pi in kiosk mode, or a PC plugged into a TV.

## Deploy to Cloudflare (one-time setup)

Prerequisites: a free Cloudflare account and Node.js.

```bash
npm install

# 1. Log in to Cloudflare
npx wrangler login

# 2. Create the D1 database, then paste the printed database_id
#    into wrangler.jsonc (replace REPLACE_WITH_YOUR_D1_DATABASE_ID)
npx wrangler d1 create suncoast-dashsign

# 3. Create the R2 bucket for media files
npx wrangler r2 bucket create suncoast-dashsign-media

# 4. Build and deploy
npm run deploy
```

Wrangler prints your app URL (e.g. `https://suncoast-dashsign.<you>.workers.dev`).
Open it and start adding screens. The database tables are created automatically
on first use — no manual SQL needed.

> **Note:** the app has no login — anyone with the URL can manage your screens
> and content. That's fine on a private network; for a public Cloudflare
> deployment, consider putting [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
> in front of the admin URL (free for small teams) if you need to restrict it.

You can attach a custom domain later in the Cloudflare dashboard
(Workers & Pages → your worker → Settings → Domains & Routes).

## Run locally

```bash
npm install
npm start
```

Then open http://localhost:8787 — no login needed. `npm start` builds the app
and runs it with local D1/R2 emulation; data persists in the `.wrangler`
folder between restarts.

The server listens on your network too, so a TV or phone on the same Wi-Fi
can open `http://<your-computer-ip>:8787/play/<screen-id>`. For screens at
other locations, deploy to Cloudflare (above) — localhost can't be reached
from outside your network.

For frontend development with hot reload, additionally run `npm run dev` in a
second terminal and use http://localhost:3000 (it proxies `/api` and `/media`
to the worker).

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run deploy` | Build the frontend and deploy everything to Cloudflare |
| `npm run dev` / `npm run dev:worker` | Local development (frontend / API) |
| `npm run lint` | Typecheck the frontend and the worker |
| `npm run db:schema` | (Optional) apply `schema.sql` to the remote D1 database |

## Architecture notes

- Uploaded files are stored in **R2** and served from `/media/*` with long-lived
  caching and HTTP range support (so videos can seek/stream). D1 holds only the
  metadata — D1 rows can't hold large video files, which is why R2 is used for
  the bytes; this is the standard Cloudflare pairing.
- All endpoints are public — the player endpoints (`/api/player/*`) and media
  so any TV can display a screen from just its link, and the management API
  so the dashboard works without a login.
- A screen that belongs to a group plays the **group's** playlist; its own
  playlist is used as a fallback when the group playlist is empty.
- A screen counts as **Online** if it has checked in within the last 90 seconds.
