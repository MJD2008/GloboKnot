# James's audio (22 Nov 2026) into the game's slots in public/audio: music evened out to one quiet loudness and trimmed
# of silence at both ends; effects trimmed so they start on the tap, faded at the end, and set to agreed peaks.
# Usage: python3 -I make_audio.py <audio-in dir> <repo>
import json, os, re, subprocess, sys
import numpy as np

SRC, REPO = sys.argv[1], sys.argv[2]
OUT = os.path.join(REPO, 'public/audio')
os.makedirs(OUT, exist_ok=True)

MUSIC = {  # slot: file
    'music-home': 'Music_Background_MainMenuSpace.mp3',
    'music-morning': 'Music_Background_Morning.mp3',
    'music-afternoon': 'Music_Background_Afternoon.mp3',
    'music-evening': 'Music_Background_Evening.mp3',
    'music-night': 'Music_Background_Night.mp3',
    'music-gordian': 'Music_Background_AtlasAllMode_(optional).mp3',
}
# slot: (file, keep seconds, fade-out seconds, peak dBFS, format)
FX = {
    'correct': ('soundEffect_correctAnswer.wav', 0.40, 0.10, -5, 'mp3'),
    'wrong': ('soundEffect_incorrectAnswer.wav', 0.60, 0.12, -5, 'mp3'),
    'start': ('soundEffect_Background_gameStarted.wav', 1.60, 0.40, -6, 'mp3'),
    'low': ('soundEffect_Background_lowScore.wav', 1.60, 0.30, -9, 'mp3'),
    'open': ('soundEffect_openIndex&openExtraDetails.wav', 1.25, 0.30, -10, 'mp3'),
    'select': ('soundEffect_Select(anything).wav', 1.00, 0.003, -12, 'wav'),
}
MUSIC_LUFS = -20


def pcm(path, sr=44100):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<i2').astype(float) / 32768, sr


def bounds(path, floor_db=-50, win=0.02):
    """First and last moment above the floor (seconds)."""
    x, sr = pcm(path)
    hop = int(win * sr)
    env = np.array([np.abs(x[i:i + hop]).max() for i in range(0, len(x) - hop, hop)])
    loud = np.nonzero(env > 10 ** (floor_db / 20))[0]
    return loud[0] * win, (loud[-1] + 1) * win, len(x) / sr


def loudness(path, chain=''):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', (chain + ',' if chain else '') + 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    i = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r)[-1])
    p = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r)[-1])
    return i, p


for f in os.listdir(OUT):
    if re.match(r'^(music-[a-z]+|correct|wrong|start|low|open|select)\.(mp3|wav|ogg|m4a)$', f): os.remove(os.path.join(OUT, f))

report = {}
for slot, name in MUSIC.items():
    src = os.path.join(SRC, name)
    a, b, dur = bounds(src)
    a = max(0, a - 0.02)
    trim = f'atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.04'
    i, p = loudness(src, trim)
    gain = MUSIC_LUFS - i
    if p + gain > -1.5: gain = -1.5 - p  # never clip
    dest = os.path.join(OUT, slot + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', f'{trim},volume={gain:.2f}dB', '-ar', '44100', '-ac', '2',
                    '-c:a', 'libmp3lame', '-b:a', '128k', dest], check=True)
    report[slot] = {'from': name, 'kept': [round(a, 2), round(b, 2)], 'of': round(dur, 1), 'gain dB': round(gain, 1),
                    'now': loudness(dest), 'KB': os.path.getsize(dest) // 1024}

for slot, (name, keep, fade, peak, fmt) in FX.items():
    src = os.path.join(SRC, name)
    a, b, dur = bounds(src, -90 if slot == 'select' else -55, 0.005)
    b = dur if slot == 'select' else min(b, dur)  # a 7.5 ms click: all of it
    end = min(b, a + keep)
    fade = min(fade, (end - a) * 0.4)
    chain = f'atrim={a:.4f}:{end:.4f},asetpts=PTS-STARTPTS,afade=t=out:st={max(0, end - a - fade):.4f}:d={fade:.4f}'
    x = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', src, '-af', chain + ',volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    mx = float(re.findall(r'max_volume: (-?[\d.]+) dB', x)[-1])
    dest = os.path.join(OUT, f'{slot}.{fmt}')
    codec = ['-c:a', 'libmp3lame', '-b:a', '128k'] if fmt == 'mp3' else ['-c:a', 'pcm_s16le']
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', f'{chain},volume={peak - mx:.2f}dB', '-ar', '44100', *codec, dest], check=True)
    report[slot] = {'from': name, 'kept': [round(a, 3), round(end, 3)], 'of': round(dur, 2), 'peak dB': peak, 'now': loudness(dest),
                    'KB': os.path.getsize(dest) // 1024}

print(json.dumps(report, indent=1))
