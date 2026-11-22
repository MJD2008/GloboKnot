# Tops up countries left with fewer than 3 photos after review: the photos (Wikidata P18) of their regions (P150),
# filtered like the first pass and against satellite pictures, downloaded the same way. Appends to plan.json; new
# entries carry "new": true so they can be reviewed on their own.
# Usage: python3 -I topup.py <repo> <outdir>
import json, os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
REPO, OUT = sys.argv[1], sys.argv[2]
sys.argv = [sys.argv[0], REPO, OUT]
import importlib.util
spec = importlib.util.spec_from_file_location('fp', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fetch_photos.py'))

UA = 'GloboknotBuild/1.0 (https://globoknot.com; country photos with credits)'
import urllib.request, urllib.error


def get(url, binary=False, tries=8):
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
                data = r.read()
            time.sleep(0.6)
            return data if binary else json.loads(data)
        except urllib.error.HTTPError as e:
            print('http', e.code, e.headers.get('Retry-After'), url[:90], flush=True)
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(min(int(e.headers.get('Retry-After') or 0) or 10 * (attempt + 1), 90)); continue
            raise
        except Exception as e:
            print('err', repr(e)[:120], url[:90], flush=True); time.sleep(5 * (attempt + 1))
    raise RuntimeError('gave up: ' + url)


BAD = re.compile(r'flag|map|harta|karte|carte|mapa|coat.of.arms|locator|emblem|seal|logo|montage|collage|satellite|space|sentinel|'
                 r'copernicus|astronaut|landsat|modis|\boli\b|_oli_|topo|relief|\bESA\d|nasa|\biss\d|sts-\d|_lrg|lrg\.|'
                 r'\.svg$|\.gif$|\.tiff?$|\.png$|\.webm$|\.ogv$|\.pdf$', re.I)
plan = json.load(open(os.path.join(OUT, 'plan.json')))
skip = set(json.load(open(os.path.join(OUT, 'skip.json'))))
cache = json.load(open(os.path.join(OUT, 'cache.json')))
info = cache.setdefault('_info', {})
import csv
countries = {c['id']: c for c in csv.DictReader(open(os.path.join(REPO, 'data/countries/countries.csv')))}

need = {}
for cid, lst in plan.items():
    kept = [i for i in range(len(lst)) if f'{cid.lower()}-{i + 1}' not in skip]
    if len(kept) < 3: need[cid] = 3 - len(kept)
print('countries to top up', len(need), flush=True)

regions = cache.setdefault('_regions', {})
for cid in need:
    q = countries[cid]['wikidata'].rsplit('/', 1)[-1]
    if q in regions: continue
    try:
        d = get(f'https://www.wikidata.org/wiki/Special:EntityData/{q}.json')
    except Exception as e:
        print('miss', cid, e, flush=True); continue
    e = next(iter(d['entities'].values()))
    ids = [s['mainsnak']['datavalue']['value']['id'] for s in e.get('claims', {}).get('P150', [])
           if s['mainsnak'].get('datavalue') and s.get('rank') != 'deprecated' and not s.get('qualifiers', {}).get('P582')]
    imgs = []
    for r in ids[:24]:
        try:
            rd = get(f'https://www.wikidata.org/wiki/Special:EntityData/{r}.json')
        except Exception:
            continue
        re_ = next(iter(rd['entities'].values()))
        label = re_.get('labels', {}).get('en', {}).get('value', '')
        for s in re_.get('claims', {}).get('P18', [])[:1]:
            if s['mainsnak'].get('datavalue'): imgs.append([s['mainsnak']['datavalue']['value'], label])
    regions[q] = imgs
    json.dump(cache, open(os.path.join(OUT, 'cache.json'), 'w'))
    print('regions', cid, len(ids), 'images', len(imgs), flush=True)

files = sorted({f for cid in need for f, _ in regions.get(countries[cid]['wikidata'].rsplit('/', 1)[-1], []) if not BAD.search(f)} - set(info))
for k in range(0, len(files), 40):
    chunk = files[k:k + 40]
    d = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size|mime',
        'iiurlwidth': 960, 'titles': '|'.join('File:' + f for f in chunk)}))
    norm = {n['to']: n['from'] for n in d['query'].get('normalized', [])}
    for p in d['query']['pages'].values():
        ii = (p.get('imageinfo') or [{}])[0]
        m = ii.get('extmetadata', {})
        val = lambda k: re.sub(r'<[^>]+>', '', m.get(k, {}).get('value', '')).strip()
        name = norm.get(p['title'], p['title'])[5:]
        info[name] = {'thumb': ii.get('thumburl'), 'w': ii.get('width'), 'h': ii.get('height'), 'mime': ii.get('mime'),
                      'page': ii.get('descriptionurl'), 'artist': val('Artist'), 'license': val('LicenseShortName'), 'restrict': val('Restrictions')}
    json.dump(cache, open(os.path.join(OUT, 'cache.json'), 'w'))
    print('info', k + len(chunk), '/', len(files), flush=True)

added = 0
for cid, n in need.items():
    have = {p['file'] for p in plan[cid]}
    extra = []
    for f, label in regions.get(countries[cid]['wikidata'].rsplit('/', 1)[-1], []):
        i = info.get(f, {})
        if f in have or BAD.search(f) or not i.get('thumb') or (i.get('w') or 0) < 1000 or (i.get('h') or 0) < 560: continue
        if i['w'] / i['h'] < 1.2: continue
        lic = i['license']
        if not lic or 'fair use' in lic.lower() or 'non-free' in lic.lower(): continue
        dest = os.path.join(OUT, 'raw', re.sub(r'[^\w.-]', '_', f))
        if not os.path.exists(dest) or os.path.getsize(dest) == 0:
            try:
                got = get('https://commons.wikimedia.org/w/thumb.php?' + urllib.parse.urlencode({'f': f, 'w': min(1280, i['w'] - 1)}), binary=True, tries=4)
            except Exception as e:
                print('miss', f[:60], flush=True); continue
            if len(got) < 20000: continue
            open(dest, 'wb').write(got)
        extra.append({'file': f, 'raw': dest, 'what': label, 'artist': i['artist'][:120], 'license': lic, 'page': i['page'], 'new': True})
        if len(extra) == n + 2: break  # two spare, for the review
    plan[cid] += extra
    added += len(extra)
    print('topped', cid, len(extra), flush=True)
json.dump(plan, open(os.path.join(OUT, 'plan.json'), 'w'), indent=1, ensure_ascii=False)
print('added', added)
