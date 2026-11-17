# Putting Globoknot online

The site is static: `npx astro build` writes plain files into `dist/`, and Cloudflare serves them for free from a
Worker. The repository already has the settings file it needs, `wrangler.jsonc`, and `public/_headers` (the build's
hashed files are kept by browsers for a year; everything else is checked again on each visit).

Checked on 16 Nov 2026: a fresh clone of the branch builds on Node 24 (Cloudflare's default) with `npm ci` and
`npx astro build`, and `npx wrangler deploy --dry-run` accepts the result (220 files, no bindings).

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

## Checking a build on your own computer

```
npm install
npm run dev      # the site at http://localhost:4321, reloads as you edit
npm run build    # the files Cloudflare will serve, in dist/
npm run preview  # serves dist/ to check the real build
```
