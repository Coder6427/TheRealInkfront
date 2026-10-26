# Put Inkfront online with Render

This version needs a **Node Web Service and a Postgres database**. Uploading only `index.html`, or using GitHub Pages / a Render Static Site, cannot run accounts or multiplayer.

## 1. Upload the new files to GitHub

Extract **inkfront-online-render.zip** first. Upload the **contents**, including both folders. Do not upload the ZIP itself.

The top level of your repository should look like this:

```text
package.json
package-lock.json       ← REQUIRED for npm ci
render.yaml
.node-version
.gitignore
.env.example            ← example only, no real passwords
README.md
DEPLOY-RENDER.md
dist/
  index.html
  styles.css
  arsenal.js
  game.js
  online.js
server/
  index.mjs
  rooms.mjs
  engine.mjs
  store.mjs
test/
  online.test.mjs
  client.test.mjs
```

Keep the folder structure. On GitHub, use **Add file → Upload files**, drag in the extracted files and folders, then commit. If hidden files are not shown by your file picker, the two JSON files plus `dist` and `server` are the essential runtime files; upload the rest too when possible.

## 2. Give accounts somewhere permanent to live

In Render, use an existing Postgres database or choose **New → Postgres**. Put it in the same region as your Web Service. Copy its **Internal Database URL** into the Web Service's Environment settings as:

```text
DATABASE_URL = your internal Postgres connection URL
```

This URL includes database credentials. Keep it only in Render's secret environment settings. Do not put it in GitHub, game JavaScript, screenshots, or chat.

The server automatically creates its account/session tables; no SQL commands are needed. If the database contains unrelated apps, use a separate database for this game to avoid table-name conflicts.

Render's free Postgres option expires after 30 days; choose a non-expiring database for lasting accounts and enable backups appropriate to your plan. Nothing in this project creates or purchases a database automatically. See [Render's free service limitations](https://render.com/docs/free).

## 3. Set up the Web Service

Use your existing **Node Web Service** or choose **New → Web Service** and connect the GitHub repository.

| Setting | Value |
| --- | --- |
| Language/runtime | Node |
| Root Directory | Leave blank if `package.json` is at the repository's top level |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Number of instances | **1** |
| Environment: `NODE_VERSION` | `24.22.1` |
| Environment: `NODE_ENV` | `production` |
| Environment: `DATABASE_URL` | Your Postgres Internal Database URL |

If you uploaded a containing folder instead of its contents, set **Root Directory** to that folder's repository-relative path, the one containing **both** JSON files. Never set it to `dist` or `server`.

You can alternatively use the included `render.yaml` as a Render Blueprint. It requests the database URL, defines one free Web Service, and does not provision a database. Creating a Blueprint alongside an existing service may create a second service: use manual settings for your existing one.

Render provides `PORT` and `RENDER_EXTERNAL_URL` automatically. The server listens on `0.0.0.0` and uses the same port for HTTP and WebSockets. If you use a custom domain, also set `APP_ORIGIN` to the exact public HTTPS origin, such as `https://play.example.com`, without a trailing path.

## 4. Deploy, then play

After the GitHub commit and environment settings are saved, deploy the latest commit. Wait for the log line **Inkfront Arena ready** and a successful health check.

Open the **Web Service's HTTPS URL**, not your old local file or GitHub Pages URL. Click **Play online**, create a player account, and create a room. A friend opens the same website, creates their own account, and enters your room code. Everyone picks an upgrade and readies up; the leader clicks **Deploy squad**. Bots fill unused slots.

Free web services sleep when idle and can take around a minute to wake. A running server restart/redeploy closes rooms and active matches; accounts, sessions, and saved results remain in Postgres. This release uses one in-memory match server, so do not enable multiple instances or cluster workers. See [Render WebSockets](https://render.com/docs/websocket) and [Node version settings](https://render.com/docs/node-version).

## Your `npm ci` / EUSAGE error

That means the build folder has no usable `package-lock.json`.

1. Check **GitHub**, not just your computer: both `package.json` and `package-lock.json` must be committed side by side.
2. Check Render's **Root Directory** points to that same folder.
3. Deploy the latest commit after uploading this new package.

The lockfile is already included and generated. You do not need Yarn. Changing the command cannot make the old static-only upload support multiplayer.

Other messages:

- **DATABASE_URL is required:** add the Postgres secret in Render's Environment settings, then redeploy.
- **Database connection fails:** check the URL, the database status, and that the service/database are in the same region. Do not disable certificate verification as a workaround.
- **Cannot find server/index.mjs:** upload the `server` folder or correct Root Directory.
- **Accounts available at the game's Render URL:** you are opening the offline file/static host; use the Web Service URL.
- **Connection rejected on a custom domain:** set `APP_ORIGIN` to the exact HTTPS origin you are visiting.

## Local testing

With Node 24 installed, open a terminal in the extracted folder:

```sh
npm ci
npm test
npm start
```

Visit `http://127.0.0.1:3000`. Local accounts use the ignored `data/inkfront.sqlite` file and survive restarts. For local network/phone testing, set `APP_ORIGIN` to the exact LAN address you will visit, for example `http://192.168.1.10:3000`; all players must use that same address. LAN HTTP is for trusted local testing, not public deployment. Public accounts must use HTTPS.

## Account and hosting scope

Passwords are salted and hashed with scrypt, sessions use HttpOnly cookies, and signup/sign-in are rate-limited. Users can change their password while signed in, which invalidates their older sessions. No email is collected and no password-by-email recovery is included. Keep a database backup and keep hosting dependencies updated.

This is a private-room multiplayer first release, not global matchmaking or a horizontally scaled/ranked service. Test latency and capacity with your chosen Render plan before inviting a large audience.
