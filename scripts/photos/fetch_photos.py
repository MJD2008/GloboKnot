# Finds up to 3 free-licensed photos per country on Wikimedia Commons via Wikidata (the country's own image, its
# capital's, its highest point's, and panoramic/aerial views), with author and licence, and downloads 960 px versions.
# Usage: python3 -I fetch_photos.py <repo> <outdir>
import csv, json, os, re, sys, time, urllib.parse, urllib.request, urllib.error

REPO, OUT = sys.argv[1], sys.argv[2]
UA = 'GloboknotBuild/1.0 (https://globoknot.com; country photos with credits)'
os.makedirs(os.path.join(OUT, 'raw'), exist_ok=True)
CACHE = os.path.join(OUT, 'cache.json')
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}


def get(url, binary=False, tries=8):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            time.sleep(0.6)
            return data if binary else json.loads(data)
        except urllib.error.HTTPError as e:
            print('http', e.code, e.headers.get('Retry-After'), url[:90], flush=True)
            if e.code in (429, 500, 502, 503, 504):
                wait = int(e.headers.get('Retry-After') or 0) or 5 * (attempt + 1)
                time.sleep(min(wait, 60 if tries > 2 else 3))
                continue
            raise
        except Exception as e:
            print('err', repr(e)[:120], url[:90], flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('gave up: ' + url)


def entities(ids):
    out = {}
    need = [i for i in ids if i not in cache]
    for i in need:
        # One entity at a time from Special:EntityData (cached by Wikimedia): the batched API gets throttled.
        try:
            d = get(f'https://www.wikidata.org/wiki/Special:EntityData/{i}.json', tries=6)
        except Exception as e:
            print('entity miss', i, e, flush=True); continue
        e = next(iter(d.get('entities', {}).values()), None)
        if not e: continue
        c = e.get('claims', {})
        pick = lambda p: [s['mainsnak']['datavalue']['value'] for s in c.get(p, []) if s['mainsnak'].get('datavalue') and s.get('rank') != 'deprecated']
        cache[i] = {'P18': pick('P18'), 'P36': [v['id'] for v in pick('P36')], 'P610': [v['id'] for v in pick('P610')],
                    'P4291': pick('P4291'), 'P8592': pick('P8592'), 'label': e.get('labels', {}).get('en', {}).get('value', '')}
        json.dump(cache, open(CACHE, 'w'))
    return {i: cache[i] for i in ids if i in cache}


BAD = re.compile(r'flag|map|harta|karte|carte|mapa|coat.of.arms|locator|emblem|seal|logo|montage|collage|\.svg$|\.gif$|\.tiff?$|\.png$|\.webm$|\.ogv$|\.pdf$', re.I)

countries = list(csv.DictReader(open(os.path.join(REPO, 'data/countries/countries.csv'))))
qid = {c['id']: c['wikidata'].rsplit('/', 1)[-1] for c in countries}
E = entities(list(qid.values()))
second = sorted({x for e in E.values() for x in e['P36'][:2] + e['P610'][:1]})
E2 = entities(second)

plan = {}
for c in countries:
    e = E.get(qid[c['id']], {})
    cands = []  # (file, what)
    for f in e.get('P18', []): cands.append((f, c['name']))
    for f in e.get('P4291', []) + e.get('P8592', []): cands.append((f, c['name']))
    for cap in e.get('P36', [])[:1]:
        ce = E2.get(cap, {})
        for f in ce.get('P18', []) + ce.get('P8592', []) + ce.get('P4291', []): cands.append((f, ce.get('label', '')))
    for hp in e.get('P610', [])[:1]:
        he = E2.get(hp, {})
        for f in he.get('P18', []): cands.append((f, he.get('label', '')))
    seen, keep = set(), []
    for f, what in cands:
        if f in seen or BAD.search(f): continue
        seen.add(f); keep.append((f, what))
    plan[c['id']] = keep[:4]

files = sorted({f for v in plan.values() for f, _ in v})
info = cache.setdefault('_info', {})
need = [f for f in files if f not in info]
for k in range(0, len(need), 40):
    chunk = need[k:k + 40]
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
                      'page': ii.get('descriptionurl'), 'artist': val('Artist'), 'license': val('LicenseShortName'),
                      'restrict': val('Restrictions')}
    json.dump(cache, open(CACHE, 'w'))

result = {}
for cid, lst in plan.items():
    out = []
    for f, what in lst:
        i = info.get(f, {})
        if not i.get('thumb') or (i.get('w') or 0) < 800 or (i.get('h') or 0) < 450: continue
        if (i['w'] / i['h']) < 0.9: continue  # portrait: crops badly in a wide frame
        lic = i['license']
        if not lic or 'fair use' in lic.lower() or 'non-free' in lic.lower(): continue
        dest = os.path.join(OUT, 'raw', re.sub(r'[^\w.-]', '_', f))
        if not os.path.exists(dest) or os.path.getsize(dest) == 0:
            # Commons' own thumb.php renders 1280 px without the upload host's throttle on uncached sizes.
            got = None
            try:
                got = get('https://commons.wikimedia.org/w/thumb.php?' + urllib.parse.urlencode({'f': f, 'w': min(1280, i['w'] - 1)}), binary=True, tries=4)
            except Exception as e:
                print('miss', f[:60], repr(e)[:80], flush=True)
            if not got or len(got) < 20000: continue
            open(dest, 'wb').write(got)
            print('got', len(result), f[:60], len(got), flush=True)
        out.append({'file': f, 'raw': dest, 'what': what, 'artist': i['artist'][:120], 'license': lic, 'page': i['page']})
        if len(out) == 3: break
    result[cid] = out
json.dump(result, open(os.path.join(OUT, 'plan.json'), 'w'), indent=1, ensure_ascii=False)
print('countries', len(result), 'photos', sum(map(len, result.values())), 'with none', [k for k, v in result.items() if not v])
