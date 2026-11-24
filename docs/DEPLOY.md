# Putting Globoknot online

The site is static: `npx astro build` writes plain files into `dist/`, and Cloudflare serves them for free from a
Worker. Since 23 Nov 2026 the same Worker also runs a small server under `/api/`: The Gordian Knot's board and the
count of players online (section 5). The repository already has the settings file it needs, `wrangler.jsonc`, and
`public/_headers` (the build's hashed files are kept by browsers for a year; everything else is checked again on each
visit).

Checked on 16 Nov 2026: a fresh clone of the branch builds on Node 24 (Cloudflare's default) with `npm ci` and
`npx astro build`. Checked on 23 Nov 2026: `npx wrangler deploy --dry-run` accepts the result (778 files, and the
server with its two Durable Objects, BOARD and LIVE).

## 1. Put the site in `main`

Cloudflare publishes the `main` branch. The site itself is in pull request #2 until it is merged; after that, every
merge into `main` rebuilds and publishes the site by itself, in a minute or two.

## 2. Connect the repository (once, about 5 minutes)

1. Log in at dash.cloudflare.com.
2. Go to **Compute > Workers & Pages** and choose **Create application**.
3. Under **Import a repository**, connect your GitHub account and pick **MJD2008/GloboKnot**.
4. Set **Build command** to `npx astro build` and **Deploy command** to `npx wrangler deploy`.
   Production branch: `main`. Leave the Node.js version alone (the default, 24, works).
5. Choose **Save and Deploy**. After a minute or two the site is live on an address like
   `globoknot.<your-account>.workers.dev`.

## 3. Use globoknot.com (once)

The domain is already on Cloudflare (parked), so its nameservers need no change. If it isn't marked **Active** under
**Websites** yet, add it there first (Free plan) and follow the nameserver steps Cloudflare shows.

1. Open the domain's **DNS > Records** and delete the parking records for `globoknot.com` and `www` (the A, AAAA or
   CNAME records that point at the parking page). A Worker's custom domain can't be added over an existing CNAME,
   and Cloudflare makes the records it needs itself.
2. Open the `globoknot` Worker, then **Settings > Domains & Routes > Add > Custom domain**, and add
   `globoknot.com`. Add `www.globoknot.com` the same way. The certificate comes by itself within minutes.
3. Optional, one address for search engines: **Rules > Redirect Rules**, the template **Redirect from WWW to root**.
4. Optional, visitor numbers without cookies or a consent banner: **Analytics & Logs > Web Analytics**, enable it
   for `globoknot.com`.

The dashboard's labels change now and then; if one doesn't match, the same steps are in Cloudflare's Workers docs
under "Custom Domains".

## 4. Before the public launch

The preview is hidden from search engines on purpose. When the site should be found:

- `src/layouts/Base.astro`: set `PREVIEW` to `false` (removes the noindex tag, the "preview" badge, and the photo
  placeholders on the country sheets).
- `public/robots.txt`: replace `Disallow: /` with `Allow: /`.
- `CREDITS.md`: check OHCHR's terms of use for the UDHR quotes (the language texts).

## 5. The server: the board and players online

Nothing to set up for it: `wrangler.jsonc` describes it, and the first deploy of `main` that has it creates it. The
Deploy command stays `npx wrangler deploy`; before it uploads, it runs `node scripts/build-answers.mjs`, which writes
the answer key the server checks a run against (Node 22.18 or newer; Cloudflare's default is newer).

**What it is.** The code is in `worker/`. Two Durable Objects (small, long-lived programs, each with its own little
database), both on Cloudflare's Free plan:

- `BOARD` holds The Gordian Knot's board. A run is noted when it begins; when it ends, every answer is checked against
  the answer key, and the time against the server's own clock (and no faster than 0.7 seconds a question). One place
  per player, at most 50 new places a day. A person who writes a program to fake a run could still get one on; the
  secret below takes it off.
- `LIVE` counts open pages by country. Each page keeps a connection open while it is in view.

**What it costs.** Nothing on the Free plan, within these limits a day: 100,000 requests to Durable Objects, 13,000
GB-seconds of running time, 5 million rows read, 100,000 rows written, 5 GB stored. An open page is about one request,
plus one for each update of the counts (at most one every 8 seconds, for everyone at once); a Gordian Knot is two; the
board is one each time About opens. Over a limit, the board and the glow stop answering until the next day. The quiz
itself keeps working: static files don't count. If the site ever outgrows that, the Workers Paid plan ($5 a month)
lifts the limits.

**One secret, to take a name off the board.** In the Worker's **Settings > Variables and Secrets**, add a **Secret**
named `ADMIN_KEY` with a long random value (a password manager can make one). Or, on your computer:
`npx wrangler secret put ADMIN_KEY`. Then:

```
curl https://globoknot.com/api/board
curl -X DELETE https://globoknot.com/api/board/<id> -H "Authorization: Bearer <ADMIN_KEY>"
```

The first lists the places with their ids (12 characters); the second takes one place off. Without the secret, nothing
can be taken off. A player taken off can come back only with a new run.

**What is kept about players.** For each player: the SHA-256 of a random key made in their browser (the key comes
with each request; only its hash is kept), the name they chose, their time, the date, and the edition of the data. A run begun is kept for 30
days. Their country is Cloudflare's guess from the connection; it is held in memory while their page is open, to count
it, and never written down. No addresses, no cookies. About says this in one line.

**Pull requests.** Cloudflare builds other branches too (the check on a pull request), but makes no preview link for
a Worker with Durable Objects. The site only changes when `main` does.

## Checking a build on your own computer

```
npm install
npm run dev      # the site at http://localhost:4321, reloads as you edit
npm run build    # the files Cloudflare will serve, in dist/
npm run preview  # serves dist/ to check the real build
npx wrangler dev # dist/ and the server, at http://localhost:8787 (run npm run build first)
```
