# Landmark, culture, nature and food photos per country (James, 22 Nov 2026: "too many city pictures, the pictures
# should show some more culture, for example Día de Muertos for Mexico, or the Grand Canyon for the US"; 23 Nov 2026:
# "another nature-themed image ... if there isn't one yet) and/or a food-themed image"). For every subject in
# subjects.py (English Wikipedia titles), the image Wikidata gives the subject (P18), or else a chosen photo from its
# Commons category, with author and licence from Commons, downloaded at 960 px (1280 for a panorama) for review.
# Only landscape photos, at least 1000 px wide, under a free licence.
# Writes <outdir>/culture.json: per country, its photos in sheet order (see[0], do[0], see[1], wild[0] when neither
# landmark is nature, eat[0]), each {file, what, title, kind, artist, license, page, raw}; the other usable subjects
# are spares, looked up but not downloaded.
# Photos turned down on review (culture-skip.json: "CODE:Commons file name", a file name alone for every country, or
# "CODE:~words" for every file of that country whose name holds the words, such as Korean nurungji filed with Iran's
# tahdig) count as unusable, so a subject whose own image was turned down gets its category's next best, and the next
# one moves up; run again after each review. Answers are kept in <outdir>/culture-cache.json, so a run only asks what
# is new.
# Usage: python3 -I fetch_culture.py <repo> <outdir> [culture-skip.json]
import csv, json, os, re, subprocess, sys, time, urllib.parse, urllib.request, urllib.error

REPO, OUT = sys.argv[1], sys.argv[2]
SKIP = set(json.load(open(sys.argv[3], encoding='utf-8'))) if len(sys.argv) > 3 else set()
SKIP_WORDS = [(s.split(':~', 1)[0], s.split(':~', 1)[1].lower()) for s in SKIP if ':~' in s]


def skipped(cid, f):
    return f in SKIP or f'{cid}:{f}' in SKIP or any(c == cid and w in f.replace('_', ' ').lower() for c, w in SKIP_WORDS)



UA = 'GloboknotBuild/1.0 (https://globoknot.com; country photos with credits)'
os.makedirs(os.path.join(OUT, 'raw'), exist_ok=True)
CACHE = os.path.join(OUT, 'culture-cache.json')
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {'titles': {}, 'files': {}}
ns = {}
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'subjects.py'), encoding='utf-8').read(), ns)
SUBJECTS, CAPTIONS = ns['SUBJECTS'], ns.get('CAPTIONS', {})
EAT, WILD, NATURE = ns.get('EAT', {}), ns.get('WILD', {}), ns.get('NATURE', set())


def lists_of(cid):
    """A country's subjects by kind, in sheet order: landmarks, culture, food, nature."""
    return {'see': SUBJECTS[cid]['see'], 'do': SUBJECTS[cid]['do'], 'eat': EAT.get(cid, []), 'wild': WILD.get(cid, [])}


def get(url, tries=8):
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
                data = r.read()
            time.sleep(0.6)
            return json.loads(data)
        except urllib.error.HTTPError as e:
            print('http', e.code, e.headers.get('Retry-After'), url[:100], flush=True)
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(min(int(e.headers.get('Retry-After') or 0) or 10 * (attempt + 1), 900)); continue
            raise
        except Exception as e:
            print('err', repr(e)[:120], url[:100], flush=True); time.sleep(5 * (attempt + 1))
    raise RuntimeError('gave up: ' + url)


def chunks(names, size=50, room=5000):
    """Batches of at most `size` file names whose request stays short (a long one gets 431, as on 23 Nov 2026)."""
    batch, length = [], 0
    for f in names:
        n = len(urllib.parse.quote('File:' + f)) + 3
        if batch and (len(batch) == size or length + n > room):
            yield batch; batch, length = [], 0
        batch.append(f); length += n
    if batch: yield batch


PACE = [4.0]  # seconds between downloads: slower after a 429, easing back as files come


def get_file(url, dest):
    # curl, not urllib (Python's requests got 429s where curl's, with the same User-Agent, did not; 23 Nov 2026).
    # One file at a time; a 429's Retry-After is waited out, and the pace slows down.
    part = dest + '.part'
    for attempt in range(40):
        r = subprocess.run(['curl', '-sS', '-m', '90', '-A', UA, '-D', '-', '-o', part, url], capture_output=True, text=True)
        codes = re.findall(r'^HTTP/[\d.]+ (\d{3})', r.stdout, re.M)
        code = int(codes[-1]) if codes else 0
        if code == 200 and os.path.exists(part) and os.path.getsize(part) > 0:
            os.replace(part, dest)
            time.sleep(PACE[0]); PACE[0] = max(4.0, PACE[0] * 0.97)
            return True
        wait = re.findall(r'^retry-after: *(\d+)', r.stdout, re.M | re.I)
        print(time.strftime('%H:%M:%S'), 'http', code, wait[-1] if wait else None, 'pace', round(PACE[0], 1), url[:90], r.stderr.strip()[:80], flush=True)
        if os.path.exists(part): os.remove(part)
        if code == 429:
            PACE[0] = min(60.0, PACE[0] * 1.5)
            time.sleep(min(int(wait[-1]) if wait else 60, 900)); continue
        if code in (0, 500, 502, 503, 504) and attempt < 2: time.sleep(10 * (attempt + 1)); continue
        return False
    return False


def norm_title(t):
    t = t.replace('_', ' ').strip()
    return t[:1].upper() + t[1:]


def save():
    json.dump(cache, open(CACHE, 'w'), ensure_ascii=False)


# 1. Every title to its Wikidata item's images (P18), 50 titles a request.
titles = sorted({norm_title(t) for cid in SUBJECTS for ts in lists_of(cid).values() for t in ts})
need = [t for t in titles if t not in cache['titles']]
for i in range(0, len(need), 50):
    batch = need[i:i + 50]
    q = urllib.parse.urlencode({'action': 'wbgetentities', 'format': 'json', 'sites': 'enwiki', 'titles': '|'.join(batch),
                                'props': 'claims|sitelinks', 'sitefilter': 'enwiki'})
    d = get('https://www.wikidata.org/w/api.php?' + q)
    for qid, e in d.get('entities', {}).items():
        if 'missing' in e:
            cache['titles'][norm_title(e.get('title', ''))] = None; continue
        t = norm_title(e.get('sitelinks', {}).get('enwiki', {}).get('title', ''))
        imgs = [c['mainsnak']['datavalue']['value'] for c in e.get('claims', {}).get('P18', [])
                if c['mainsnak'].get('datavalue') and c.get('rank') != 'deprecated']
        cache['titles'][t] = {'qid': qid, 'images': imgs}
    for t in batch: cache['titles'].setdefault(t, None)  # not found under that title
    save()
    print('titles', min(i + 50, len(need)), '/', len(need), flush=True)

# 1b. A title not found is mostly a redirect ("Nyiragongo" for "Mount Nyiragongo", 122 of 952 titles on 23 Nov 2026):
# asked again one at a time with normalize, which follows it on Wikipedia (only for a single title). Kept under the
# title asked, with the article's own title as 'as'.
cache.setdefault('resolved', [])
need = [t for t in titles if cache['titles'].get(t) is None and t not in cache['resolved']]
for n, t in enumerate(need):
    d = get('https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'wbgetentities', 'format': 'json', 'sites': 'enwiki', 'titles': t, 'normalize': 1,
        'props': 'claims|sitelinks', 'sitefilter': 'enwiki'}))
    for qid, e in d.get('entities', {}).items():
        if 'missing' in e or not qid.startswith('Q'): continue
        imgs = [c['mainsnak']['datavalue']['value'] for c in e.get('claims', {}).get('P18', [])
                if c['mainsnak'].get('datavalue') and c.get('rank') != 'deprecated']
        cache['titles'][t] = {'qid': qid, 'images': imgs, 'as': norm_title(e.get('sitelinks', {}).get('enwiki', {}).get('title', t))}
    cache['resolved'].append(t)
    time.sleep(1.5)
    if n % 20 == 19 or n == len(need) - 1:
        save(); print('titles followed', n + 1, '/', len(need), 'found', sum(1 for x in need[:n + 1] if cache['titles'].get(x)), flush=True)

# 2. Every image's size, type, licence and author from Commons, 50 files a request.
def info(ii):
    m = ii.get('extmetadata', {})
    val = lambda k: re.sub(r'<[^>]+>', '', str(m.get(k, {}).get('value', ''))).strip()
    return {'w': ii.get('width'), 'h': ii.get('height'), 'mime': ii.get('mime'), 'thumb': ii.get('thumburl'),
            'page': ii.get('descriptionurl'), 'artist': val('Artist'), 'license': val('LicenseShortName'),
            'nonfree': val('NonFree'), 'restrictions': val('Restrictions')}


BAD_NAME = re.compile(r'\b(map|flag|logo|coat of arms|emblem|seal|locator|location|diagram|relief|topograph\w*|satellite|svg'
                      r'|nasa|iss\d*|sts-?\d+|landsat|sentinel-?2|modis|astronaut|view of earth|apollo ?\d+|satview'  # space photos too
                      r'|info ?board|signboard|notice ?board|signpost)\b', re.I)
files = sorted({f for v in cache['titles'].values() if v for f in v['images']})
need = [f for f in files if f not in cache['files']]
for i in range(0, len(need), 50):
    batch = need[i:i + 50]
    q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size|mime',
                                'iiurlwidth': 1280, 'titles': '|'.join('File:' + f for f in batch)})
    d = get('https://commons.wikimedia.org/w/api.php?' + q)
    back = {n['to']: n['from'] for n in d.get('query', {}).get('normalized', [])}
    for p in d.get('query', {}).get('pages', {}).values():
        name = back.get(p['title'], p['title'])[5:]
        ii = (p.get('imageinfo') or [None])[0]
        cache['files'][name] = info(ii) if ii else None
    for f in batch: cache['files'].setdefault(f, None)
    save()
    print('files', min(i + 50, len(need)), '/', len(need), flush=True)

FREE = re.compile(r'^(CC0|CC BY(-SA)? [1-4]\.0|Public domain|PD\b|Attribution|FAL)', re.I)


def usable(f, cid=None):
    i = cache['files'].get(f)
    if not i or skipped(cid, f) or BAD_NAME.search(f.replace('_', ' ')): return None
    if i['mime'] not in ('image/jpeg', 'image/png', 'image/webp', 'image/tiff') or not i['thumb']: return None
    if (i['w'] or 0) < 1000 or (i['w'] or 0) < 1.15 * (i['h'] or 1): return None  # landscape only: the sheet crops to 16:9
    if i['nonfree'] or not FREE.search(i['license'] or ''): return None
    return i


def what(title, cid):
    return CAPTIONS.get(cid, {}).get(title) or re.sub(r'\s*\([^)]*\)$', '', title)  # "Blue Eye (Albania)": "Blue Eye"


def own(t, cid):
    """The subject's own image from Wikidata, if one will do."""
    hit = cache['titles'].get(norm_title(t))
    return next((f for f in (hit['images'] if hit else []) if usable(f, cid)), None)


# 2b. A subject whose own image will not do (none, too small, upright, not free, turned down): a photo from its Commons
# category (Wikidata's P373, or the item's Commons link) that someone chose too: one its English Wikipedia article
# shows, else one Commons marks as featured, quality or valued. For a custom ("Yurt", "Dhow"), one from the category's
# subcategory for the country ("Yurts in Kazakhstan") comes first; one from elsewhere needs the article or the country's
# name on it, and is left out when it names another country instead, so a dhow in Zanzibar is not shown for Bahrain.
# Also left out: TIFF scans, photos taken before 1990, and paintings, drawings, maps and old photographs (by their
# Commons categories). With none, the earlier photos fill the place. Tried first on 23 Nov 2026: Commons' search (about
# six queries a minute, and its quality images too often of something else), the Wikipedia article's own list of photos
# (en.wikipedia.org is not reachable from here), and a category's biggest photos (old slides, licence plates, trains).
countries = {r['id']: r for r in csv.DictReader(open(os.path.join(REPO, 'data/countries/countries.csv'), encoding='utf-8'))}
for k in ('cat', 'members', 'usage'): cache.setdefault(k, {})
QCATS = {'Category:Featured pictures on Wikimedia Commons': 0, 'Category:Quality images': 1, 'Category:Valued images': 2}
MIMES = ('image/jpeg', 'image/png', 'image/webp')  # not TIFF: those are mostly archive scans


def land(cid):
    c = countries[cid]
    return [n for n in [c['name'], *c['aliases'].split('|')] if len(n) >= 4 or (len(n) >= 3 and n.isupper())]


def named(text, words):
    return any(re.search(r'\b' + re.escape(w), text, re.I) for w in words)


def wanted(cid):
    # Only subjects that can reach the sheet: along each list, those before the places it has on the sheet (see: two,
    # do, eat and wild: one) are taken by subjects with a usable image of their own.
    lists = lists_of(cid)
    for kind, room in (('see', 2), ('do', 1), ('eat', 1), ('wild', 1)):
        got = 0
        for t in lists[kind]:
            if got >= room: break
            if own(t, cid): got += 1
            else: yield cid, kind, norm_title(t)


todo = sorted({w for cid in SUBJECTS for w in wanted(cid)})
need = sorted({t for _, _, t in todo if t not in cache['cat'] and (cache['titles'].get(t) or {}).get('qid')})
for i in range(0, len(need), 50):
    batch = need[i:i + 50]
    d = get('https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'wbgetentities', 'format': 'json', 'ids': '|'.join(sorted({cache['titles'][t]['qid'] for t in batch})),
        'props': 'claims|sitelinks', 'sitefilter': 'commonswiki'}))
    for t in batch:
        e = d.get('entities', {}).get(cache['titles'][t]['qid'], {})
        p373 = [c['mainsnak']['datavalue']['value'] for c in e.get('claims', {}).get('P373', []) if c['mainsnak'].get('datavalue')]
        link = e.get('sitelinks', {}).get('commonswiki', {}).get('title', '')
        cache['cat'][t] = p373[0] if p373 else (link[9:] if link.startswith('Category:') else None)
    save(); print('categories', min(i + 50, len(need)), '/', len(need), flush=True)


def members(cat):
    """A Commons category's files ({name: [w, h, mime, quality]}) and subcategories, from one request."""
    if cat not in cache['members']:
        d = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
            'action': 'query', 'format': 'json', 'generator': 'categorymembers', 'gcmtitle': 'Category:' + cat,
            'gcmtype': 'file|subcat', 'gcmlimit': 500, 'prop': 'imageinfo|categories', 'iiprop': 'size|mime',
            'clcategories': '|'.join(QCATS), 'cllimit': 'max'}))
        files, subcats = {}, []
        for pg in d.get('query', {}).get('pages', {}).values():
            if pg.get('ns') == 14: subcats.append(pg['title'][9:]); continue
            ii = (pg.get('imageinfo') or [None])[0]
            if ii: files[pg['title'][5:]] = [ii.get('width'), ii.get('height'), ii.get('mime'),
                                            min([QCATS[c['title']] for c in pg.get('categories', []) if c['title'] in QCATS] or [3])]
        cache['members'][cat] = {'files': files, 'subcats': subcats}
    return cache['members'][cat]


def pool(cid, kind, t):
    """A subject's candidate files: {name: (0 from the country's subcategory else 1, quality mark 0-3, -pixels)}."""
    cat = cache['cat'].get(t)
    if not cat: return {}
    m = members(cat)
    pools = [(0, members(sc)['files']) for sc in m['subcats'] if kind in ('do', 'eat') and named(sc, land(cid))] + [(1, m['files'])]
    out = {}
    for p, files in pools:
        for f, (w, h, mime, q) in files.items():
            if not w or w < 1000 or w < 1.15 * (h or 1) or mime not in MIMES or BAD_NAME.search(f.replace('_', ' ')): continue
            if skipped(cid, f): continue
            out.setdefault(f, (p, q, -(w * h)))
    return out


def shortlist(cid, kind, t):
    return [f for f, _ in sorted(pool(cid, kind, t).items(), key=lambda kv: kv[1])[:150]]


for n, (cid, kind, t) in enumerate(todo):
    pool(cid, kind, t)
    if n % 50 == 49 or n == len(todo) - 1: save(); print('subjects looked into', n + 1, '/', len(todo), flush=True)

# Where each shortlisted photo is used: English Wikipedia articles, as "wiki|Title".
need, done = sorted({f for w in todo for f in shortlist(*w)} - set(cache['usage'])), 0
for k, batch in enumerate(chunks(need)):
    cont, got = {}, {}
    for _ in range(8):
        d = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
            'action': 'query', 'format': 'json', 'prop': 'globalusage', 'gunamespace': 0, 'gulimit': 500, 'gusite': 'enwiki',
            'titles': '|'.join('File:' + f for f in batch), **cont}))
        back = {x['to']: x['from'] for x in d.get('query', {}).get('normalized', [])}
        for pg in d.get('query', {}).get('pages', {}).values():
            got.setdefault(back.get(pg['title'], pg['title'])[5:], []).extend(
                f"{u['wiki']}|{u['title'].replace('_', ' ')}" for u in pg.get('globalusage', []))
        if 'continue' not in d: break
        cont = d['continue']
    for f in batch: cache['usage'][f] = got.get(f, [])
    done += len(batch)
    if k % 10 == 9 or done == len(need): save(); print('photo uses looked up', done, '/', len(need), flush=True)


def ranked(cid, kind, t):
    """Shortlisted photos someone chose (the article, or Commons' marks), best first, as (key, name)."""
    out, cands = [], pool(cid, kind, t)
    article = 'en.wikipedia.org|' + (cache['titles'].get(t) or {}).get('as', t)
    for f in shortlist(cid, kind, t):
        p, q, px = cands[f]
        uses = cache['usage'].get(f, [])
        in_article = article in uses
        if in_article or q < 3: out.append(((0 if in_article else 1, p, q, -len(uses), px), f))
    return sorted(out)


def info_more(ii):
    m = ii.get('extmetadata', {})
    val = lambda k: re.sub(r'<[^>]+>', '', str(m.get(k, {}).get('value', ''))).strip()
    year = re.search(r'\b(1[89]\d\d|20\d\d)\b', val('DateTimeOriginal'))
    return {**info(ii), 'cats': val('Categories'), 'desc': val('ImageDescription')[:400], 'year': int(year.group(1)) if year else None}


want, done = sorted({f for w in todo for _, f in ranked(*w)[:6] if 'year' not in (cache['files'].get(f) or {})}), 0
for k, batch in enumerate(chunks(want)):
    d = get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size|mime', 'iiurlwidth': 1280,
        'titles': '|'.join('File:' + f for f in batch)}))
    back = {x['to']: x['from'] for x in d.get('query', {}).get('normalized', [])}
    for pg in d.get('query', {}).get('pages', {}).values():
        ii = (pg.get('imageinfo') or [None])[0]
        if ii: cache['files'][back.get(pg['title'], pg['title'])[5:]] = info_more(ii)
    done += len(batch)
    if k % 10 == 9 or done == len(want): save(); print('photos looked up', done, '/', len(want), flush=True)

ART = re.compile(r'(^|\|)(Paintings|Drawings|Engravings|Lithographs|Etchings|Woodcuts|Watercolou?r|Illustrations|Maps|Plans|'
                 r'Diagrams|Postcards|Stamps|Black and white photographs|Sepia|Photochrom|Old photographs|Historical images)\b', re.I)
OTHER = {cid: [c['name'] for k, c in countries.items() if k != cid and len(c['name']) >= 4] for cid in countries}


def best(t, cid, kind):
    """The best photo from the subject's Commons category, if one will do."""
    for (not_in_article, p, *_), f in ranked(cid, kind, norm_title(t))[:6]:
        i, in_article = usable(f, cid), not not_in_article
        if not i or 'year' not in i or ART.search(i['cats']) or (i['year'] or 9999) < 1990: continue
        if kind in ('do', 'eat') and p == 1:  # a custom or a dish: the country's own, not one from elsewhere
            text = ' '.join((f, i['desc'], i['cats']))
            here = named(text, land(cid))
            if (in_article and not here and named(text, OTHER[cid])) or (not in_article and not here): continue
        return f
    return None


# 3. Per country: see[0], do[0], see[1], then wild[0] when neither landmark photo is nature, then eat[0] (each the
# first usable title along its list); the rest are spares.
NATURE = {norm_title(t) for t in NATURE}
out = {}
for cid in sorted(SUBJECTS):
    lists = {k: [] for k in ('see', 'do', 'eat', 'wild')}
    for kind, ts in lists_of(cid).items():
        for t in ts:
            f = own(t, cid) or best(t, cid, kind)
            if f:
                lists[kind].append({'file': f, 'what': what(norm_title(t), cid), 'title': norm_title(t), 'kind': kind, **usable(f, cid)})
    see, do, eat, wild = lists['see'], lists['do'], lists['eat'], lists['wild']
    slots = see[:1] + do[:1] + see[1:2]
    if not any(p['title'] in NATURE for p in slots):
        slots += [p for p in wild if p['file'] not in {q['file'] for q in slots}][:1]
    slots += [p for p in eat if p['file'] not in {q['file'] for q in slots}][:1]
    seen, picks = set(), []
    for k, p in enumerate(slots + see[2:] + do[1:] + eat[1:] + wild):
        if p['file'] in seen: continue
        seen.add(p['file']); picks.append({**p, 'slot': k < len(slots)})
    out[cid] = picks

# 4. Downloads, 960 px wide or 1280 for a panorama (so the 16:9 crop keeps 540 px of height), through Commons'
# thumb.php as for the first photos (fetch_photos.py): upload.wikimedia.org answered with 429 and Retry-After 600
# after about 20 files (23 Nov 2026).
def sources(p):
    name = p['file'].replace(' ', '_')
    page = {'page': 1} if p.get('mime') == 'image/tiff' else {}  # a TIFF's first page
    thumb = lambda w: 'https://commons.wikimedia.org/w/thumb.php?' + urllib.parse.urlencode({'f': name, 'w': w, **page})
    out = [thumb(w) for w in ((1280, 960) if p['w'] > 1.78 * p['h'] else (960,)) if w < p['w']]
    # last, the copy Commons gave for 1280 px (or the file itself, when no wider), from the upload host
    return out + [re.sub(r'\?.*$', '', p['thumb']).replace('https://thumb.wikimedia.org/', 'https://upload.wikimedia.org/')]


for cid, picks in out.items():
    for p in picks:
        dest = os.path.join(OUT, 'raw', re.sub(r'[^\w.-]', '_', p['file']))
        p['raw'] = dest
        if not p['slot']: p['raw'] = None; continue  # a spare: fetched once a photo on the sheet is turned down
        if os.path.exists(dest) and os.path.getsize(dest) > 0: continue
        for url in sources(p):
            if get_file(url, dest): break
            print('size refused', cid, p['file'], flush=True)
        else:
            print('download miss', cid, p['file'], flush=True); p['raw'] = None; continue
    out[cid] =[{k: p[k] for k in ('file', 'what', 'title', 'kind', 'artist', 'license', 'page', 'raw', 'w', 'h')} for p in picks if p['raw']]
json.dump(out, open(os.path.join(OUT, 'culture.json'), 'w'), indent=1, ensure_ascii=False)
short = {c: len(v) for c, v in out.items() if len(v) < 3}
print('countries', len(out), 'photos', sum(len(v) for v in out.values()), 'with fewer than 3:', len(short), short, flush=True)
