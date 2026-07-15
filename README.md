# Suncoast Signages

Cloud-based digital signage (like AbleSign.TV): upload images and videos once,
then display them on any TV or browser at any location via a simple link.
Runs entirely on Cloudflare:

- **Cloudflare Workers** — hosts the admin app, the player, and the API
- **Cloudflare D1** — database (screens, groups, playlists, content metadata, reports)
- **Cloudflare R2** — storage for the uploaded image/video files

## How it works

1. Sign in to the admin dashboard (default account: **admin / Suncoast#1234** —
   change it in Settings → My Account).
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

## Screen on/off schedule + turning the TV off (HDMI-CEC)

Each screen can have daily operating hours ("Screen Hours" on the screen's
page in the admin). Outside those hours the player blacks out and comes back
on by itself — no reloading needed. Overnight ranges (on 18:00 / off 02:00)
work too.

To physically power the TV on/off as well, run the included CEC agent on a
device connected to the TV over HDMI (a Raspberry Pi is ideal — its HDMI
port supports CEC out of the box):

```bash
# On the Raspberry Pi that drives the TV:
sudo apt install cec-utils
chmod +x scripts/pi-cec-agent.sh
./scripts/pi-cec-agent.sh http://<server>:8787 <screen-id> &
```

The agent asks the server `GET /api/player/<screen-id>/power?time=HH:MM`
every minute (answer: `on` or `off`, using the schedule you set in the
admin) and sends the matching HDMI-CEC command to the TV. Add it to
`/etc/rc.local` or a systemd unit to start on boot.

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
Open it, sign in with **admin / Suncoast#1234**, and **change the password
immediately** (Settings → My Account) since the URL is on the public internet.
The database tables and the default admin account are created automatically on
first use — no manual SQL needed.

You can attach a custom domain later in the Cloudflare dashboard
(Workers & Pages → your worker → Settings → Domains & Routes).

## Run locally

```bash
npm install
npm start
```

Then open http://localhost:8787 and sign in with **admin / Suncoast#1234**.
`npm start` builds the app and runs it with local D1/R2 emulation; data
persists in the `.wrangler` folder between restarts.

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
- The player endpoints (`/api/player/*`) and media are public so any TV can
  display a screen from just its link; all management endpoints require a
  signed-in user. Accounts live in D1 (PBKDF2-hashed passwords); **Members**
  can only see and control the screens an admin grants them, while **Admins**
  manage everything including users and workspace settings.
- A screen that belongs to a group plays the **group's** playlist; its own
  playlist is used as a fallback when the group playlist is empty.
- A screen counts as **Online** if it has checked in within the last 90 seconds.
