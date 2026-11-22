# Turns plan.json (fetch_photos.py) into public/photos/<code>-<n>.webp (960x540, cropped to 16:9 from the middle) and
# public/photos/credits.json, at most three per country. Usage: python3 -I make_photos.py <plan.json> <repo> [skip.json]
# The downloads are read from a raw/ folder beside plan.json (fetch_photos.py and topup.py put them there).
import json, os, re, sys
from PIL import Image, ImageOps

plan = json.load(open(sys.argv[1]))
repo = sys.argv[2]
skip = set(json.load(open(sys.argv[3]))) if len(sys.argv) > 3 else set()  # "fra-2" etc. James or I rejected
dest = os.path.join(repo, 'public/photos')
os.makedirs(dest, exist_ok=True)
for f in os.listdir(dest):
    if re.match(r'^[a-z]{3}-\d+\.webp$', f): os.remove(os.path.join(dest, f))
credits, total = {}, 0
import csv
NAMES = {c['id']: c['name'] for c in csv.DictReader(open(os.path.join(repo, 'data/countries/countries.csv')))}


def clean_artist(a):
    """The photographer's name out of Commons' author field ("This image was taken or created by X.", "File.jpg: X
    derivative work: Y", "No machine-readable author provided. X assumed", "X [1]")."""
    a = re.sub(r'\s+', ' ', a).strip()
    m = re.search(r'taken or created by (.+)', a)
    if m: a = re.split(r'\.\s+(?:Please|You|It|This|If)\b', m.group(1))[0]
    m = re.search(r'No machine-readable author provided\. (.+?) assumed', a)
    if m: a = m.group(1)
    a = re.sub(r'^.*?\.(jpe?g|png|tiff?): ', '', a, flags=re.I)
    a = re.split(r'\s*derivative work', a, flags=re.I)[0]
    a = re.split(r'\.\s+(?:To see|Please|See|For more|Contact)\b|\s*This file was uploaded|;\s*The original uploader|\s+&gt;|\s+>|, stitched', a)[0]
    m = re.search(r'(?:The )?[Oo]riginal uploader was (.+?) at (?:English Wikipedia|en\.wikipedia)', a)
    if m: a = m.group(1)
    a = re.sub(r'^(?:Photos? taken by |User:)', '', a)
    a = re.sub(r'\s*\(published under [^)]*\)', '', a)
    a = re.sub(r' employee in the course of.*', '', a)
    m = re.search(r'uploader (\S+) has e-?mail-contact with the photograph\w* \W(.+?)\W*$', a, re.I)
    if m: a = f'{m.group(2)} (via {m.group(1)})'
    a = re.sub(r'\[\d+\]|\s*\((talk|discussion|contribs?)\)', '', a, flags=re.I)
    return a.strip(' .,;:-') or 'Unknown author'


def place(p, cid):
    """What a photo shows: its capital's or peak's name; for the country's own photo, its file name made readable
    ("Paris from the Arc de Triomphe, 17 October 2019.jpg": "Paris from the Arc de Triomphe"), or nothing."""
    what = p['what']
    if what and what != NAMES.get(cid): return what
    t = re.sub(r'\.\w+$', '', p['file']).replace('_', ' ')
    if t.count('.') >= 3: t = t.replace('.', ' ')  # Ciudad.de.Mexico.City...
    t = re.sub(r'\(\d+\)|\b(DSC|IMG|DSCF|P)\s?\d+\b|\b\d{4}-\d\d-\d\d\b', '', t)
    t = re.sub(r',?\s*\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}', '', t)
    t = re.sub(r'[-,(\s]+\d{4}\)?\s*$', '', t)
    t = re.sub(r'\s+', ' ', t).strip(' -,.')
    words = [w for w in re.findall(r'[^\W\d_]{3,}', t)]
    return t if len(words) >= 2 and len(t) <= 70 else ''

for cid, lst in sorted(plan.items()):
    n = 0
    for k, p in enumerate(lst):
        key = f'{cid.lower()}-{k + 1}'
        if key in skip: continue
        if n == 3: break  # at most three per country, in plan order (the country's own photos first)
        try:
            raw = p.get('raw') or os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), 'raw', re.sub(r'[^\w.-]', '_', p['file']))
            im = ImageOps.exif_transpose(Image.open(raw)).convert('RGB')
        except Exception as e:
            print('skip', key, e); continue
        w, h = im.size
        tw, th = 960, 540
        scale = max(tw / w, th / h)
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        x, y = (im.width - tw) // 2, (im.height - th) // 2
        im = im.crop((x, y, x + tw, y + th))
        n += 1
        name = f'{cid.lower()}-{n}'
        im.save(os.path.join(dest, name + '.webp'), 'WEBP', quality=68, method=6)
        total += os.path.getsize(os.path.join(dest, name + '.webp'))
        artist = clean_artist(p['artist'])
        if len(artist) > 60: artist = artist[:57].rstrip() + '...'
        credits[name] = {'place': place(p, cid), 'credit': f"{artist}, {p['license']}", 'link': p['page']}
json.dump(credits, open(os.path.join(dest, 'credits.json'), 'w'), indent=1, ensure_ascii=False)
print('photos', len(credits), 'MB', round(total / 1e6, 1))
