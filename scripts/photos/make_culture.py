# Turns culture.json (fetch_culture.py) into the country sheets' photos: public/photos/<code>-<n>.webp (960x540,
# cropped to 16:9 from the middle) and public/photos/credits.json. Per country, up to five: its landmark, culture,
# nature and food photos in culture.json's order, minus the ones rejected on review (culture-skip.json: "CODE:Commons
# file name", a file name alone for every country, or "CODE:~words" for that country's files whose names hold the
# words); a country left with fewer than three keeps its earlier photos after them (the files and credits already in
# public/photos).
# Run it on the earlier photos, those of commit 44426ca (git checkout 44426ca -- public/photos), never on its own output:
# what it sets aside as earlier would then hold photos turned down since.
# Usage: python3 -I make_culture.py <culture.json> <repo> [culture-skip.json]
import json, os, re, shutil, sys, tempfile
from PIL import Image, ImageOps
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from credit import clean_artist

culture = json.load(open(sys.argv[1]))
repo = sys.argv[2]
skip = set(json.load(open(sys.argv[3]))) if len(sys.argv) > 3 else set()
skip_words = [(s.split(':~', 1)[0], s.split(':~', 1)[1].lower()) for s in skip if ':~' in s]
dest = os.path.join(repo, 'public/photos')
old_credits = json.load(open(os.path.join(dest, 'credits.json')))

# The earlier photos, set aside first: their names are about to be reused.
keep = tempfile.mkdtemp()
for name in old_credits:
    if os.path.exists(os.path.join(dest, name + '.webp')): shutil.copy(os.path.join(dest, name + '.webp'), keep)
for f in os.listdir(dest):
    if re.match(r'^[a-z]{3}-\d+\.webp$', f): os.remove(os.path.join(dest, f))


def page_of(credit):
    link = credit.get('link') if isinstance(credit, dict) else None  # a line of text (one's own photo) has none
    return re.sub(r'^https?://commons\.wikimedia\.org/wiki/', '', link or '').replace(' ', '_')


MAX = 5  # see, do, see, wild (when needed), eat: fetch_culture.py
credits, total, counts = {}, 0, {'culture': 0, 'earlier': 0}
codes = sorted({k.split('-')[0] for k in old_credits} | {c.lower() for c in culture})
for code in codes:
    n, used = 0, set()
    for p in culture.get(code.upper(), []):
        if n == MAX: break
        if p['file'] in skip or f"{code.upper()}:{p['file']}" in skip or not p.get('raw'): continue
        if any(c == code.upper() and w in p['file'].replace('_', ' ').lower() for c, w in skip_words): continue
        try:
            im = ImageOps.exif_transpose(Image.open(p['raw'])).convert('RGB')
        except Exception as e:
            print('skip', code, p['file'], e); continue
        w, h = im.size
        scale = max(960 / w, 540 / h)
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        x, y = (im.width - 960) // 2, (im.height - 540) // 2
        im = im.crop((x, y, x + 960, y + 540))
        n += 1
        name = f'{code}-{n}'
        im.save(os.path.join(dest, name + '.webp'), 'WEBP', quality=68, method=6)
        total += os.path.getsize(os.path.join(dest, name + '.webp'))
        artist = clean_artist(p['artist'])
        if len(artist) > 60: artist = artist[:57].rstrip() + '...'
        credits[name] = {'place': p['what'], 'credit': f"{artist}, {p['license']}", 'link': p['page']}
        used.add(page_of({'link': p['page']}))
        counts['culture'] += 1
    # earlier photos after them, up to three in all (not the same file twice)
    for k in range(1, 10):
        old = f'{code}-{k}'
        if n >= 3 or old not in old_credits: break
        if page_of(old_credits[old]) in used or not os.path.exists(os.path.join(keep, old + '.webp')): continue
        n += 1
        name = f'{code}-{n}'
        shutil.copy(os.path.join(keep, old + '.webp'), os.path.join(dest, name + '.webp'))
        total += os.path.getsize(os.path.join(dest, name + '.webp'))
        credits[name] = old_credits[old]
        counts['earlier'] += 1
shutil.rmtree(keep)
json.dump(credits, open(os.path.join(dest, 'credits.json'), 'w'), indent=1, ensure_ascii=False)
print('photos', len(credits), counts, 'MB', round(total / 1e6, 1))
