# The photographer's name for a photo's credit line, out of Commons' author field (make_photos.py, make_culture.py).
import re


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
