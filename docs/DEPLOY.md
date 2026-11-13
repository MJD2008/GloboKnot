# Putting Globoknot online

The site is static: `npm run build` writes plain files into `dist/`, and Cloudflare serves them for free.
Cloudflare recommends Workers for new projects (Pages still works, but it is the older route), so these steps
use Workers. The repository already has the settings file it needs, `wrangler.jsonc`.

## 1. Connect the repository (once, about 5 minutes)

1. Log in at dash.cloudflare.com (a free account is enough).
2. Go to **Compute > Workers & Pages** and choose **Create application**.
3. Under **Import a repository**, connect your GitHub account and pick **MJD2008/GloboKnot**.
4. Set **Build command** to `npx astro build` and **Deploy command** to `npx wrangler deploy`.
   Production branch: `main`.
5. Choose **Save and Deploy**. After a minute or two the site is live on an address like
   `globoknot.<your-account>.workers.dev`.

From then on, every merge into `main` rebuilds and publishes the site by itself.

## 2. Use globoknot.com (once, then a wait of minutes to a few hours)

Cloudflare can only attach a domain it manages, so the domain moves its DNS to Cloudflare first. You keep
it registered where you bought it; only the nameservers change.

1. In the Cloudflare dashboard choose **Add a domain**, enter `globoknot.com`, pick the **Free** plan.
2. Cloudflare shows two nameservers (like `xxx.ns.cloudflare.com`). At the shop where you bought the
   domain, replace its nameservers with those two.
3. Wait until Cloudflare marks the domain **Active** (it emails you).
4. Open the `globoknot` Worker, then **Settings > Domains & Routes > Add > Custom domain**, and add
   `globoknot.com`. Add `www.globoknot.com` the same way.

The dashboard's labels change now and then; if one doesn't match, the same steps are in Cloudflare's
Workers docs under "Custom Domains".

## 3. Before the public launch

The preview is hidden from search engines on purpose. When the site should be found:

- `src/layouts/Base.astro`: set `PREVIEW` to `false` (removes the noindex tag and the "preview" badge).
- `public/robots.txt`: replace `Disallow: /` with `Allow: /`.

## Checking a build on your own computer

```
npm install
npm run dev      # the site at http://localhost:4321, reloads as you edit
npm run build    # the files Cloudflare will serve, in dist/
npm run preview  # serves dist/ to check the real build
```
