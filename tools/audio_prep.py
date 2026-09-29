#!/usr/bin/env python3
# 배경 음악·효과음 준비: CC0 원본을 받아 앞뒤 무음을 자르고, 음량을 맞춰 MP3 로 바꾸고,
# 루프 지점을 game/src/data/audiomap.js 에 적는다. 원본 출처·라이선스는 docs/assets/audio/CREDITS.md.
# 사용법: python3 tools/audio_prep.py <원본 폴더>   (ffmpeg, numpy, soundfile 필요)
#   원본 폴더에 아래 SRC 의 파일을 받아 둔다(없으면 URL 에서 받는다).
import json, os, subprocess, sys, urllib.parse, urllib.request, zipfile
import numpy as np
import soundfile as sf

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'docs', 'assets', 'audio')  # 배포 폴더에 바로 둔다 (개발용 game/index.html 은 ../docs/assets/audio 를 읽는다)
MANIFEST = os.path.join(ROOT, 'game', 'src', 'data', 'audiomap.js')
OGA = 'https://opengameart.org/sites/default/files/'

# 묶음 파일(zip) → 받을 이름
ZIPS = {
    'junkala_action': '5 Action Chiptunes By Juhani Junkala.zip',
    'junkala_adv': 'Juhani Junkala [Chiptune Adventures] OGG.zip',
    'nes': 'WAV.zip',  # SketchyLogic - NES Shooter Music (5 tracks, 3 jingles)
    'sfx': 'The Essential Retro Video Game Sound Effects Collection [512 sounds].zip',
}
SINGLES = ['8-bit_perilous_dungeon_0.mp3', '8-bit_slay_the_evil_0.ogg', 'Great Boss_0.ogg',
           'qubodup-yd-DarkShrineLoop-OpenGameArt.ogg', 'n3535n5n335n35nj.ogg']

JA = 'junkala_action/Juhani Junkala [Retro Game Music Pack] '
JV = 'junkala_adv/Juhani Junkala [Chiptune Adventures] '
# 곡 id → (원본, 목표 음량 LUFS). 조용한 곡은 일부러 낮게 둔다
BGM = {
    'title': (JA + 'Title Screen.wav', -15),
    'select': (JV + '4. Stage Select.ogg', -15),
    'a1': (JA + 'Level 1.wav', -15), 'a1b': (JV + '1. Stage 1.ogg', -15),
    'a2': (JA + 'Level 2.wav', -15), 'a2b': (JV + '2. Stage 2.ogg', -15),
    'a3': ('8-bit_perilous_dungeon_0.mp3', -15), 'a3b': (JA + 'Level 3.wav', -15),
    'a4': ('nes/Venus.wav', -15), 'a4b': ('nes/Mars.wav', -15),
    'elite': ('nes/BossMain.wav', -14),
    'boss1': (JV + '3. Boss Fight.ogg', -14),
    'boss3': ('8-bit_slay_the_evil_0.ogg', -14),
    'god': ('Great Boss_0.ogg', -14),
    'shop': ('nes/Mercury.wav', -16),
    'rest': ('n3535n5n335n35nj.ogg', -19),
    'event': ('qubodup-yd-DarkShrineLoop-OpenGameArt.ogg', -18),
    'lose': (JA + 'Ending.wav', -17),
    'winJingle': ('nes/Win Jingle.wav', -14),
}
SX = 'sfx/The Essential Retro Video Game Sound Effects Collection [512 sounds] By Juhani Junkala/'
G, W, E, M = SX + 'General Sounds/', SX + 'Weapons/', SX + 'Explosions/', SX + 'Movement/'
# 효과음 이름 → 원본 목록(여럿이면 번갈아 무작위)
SFX = {
    'click': [G + 'Menu Sounds/sfx_menu_move2.wav'],
    'error': [G + 'Negative Sounds/sfx_sounds_error10.wav'],
    'summon': [G + 'Positive Sounds/sfx_sounds_powerup15.wav'],
    'rare': [G + 'Positive Sounds/sfx_sounds_powerup5.wav'],
    'merge': [G + 'Positive Sounds/sfx_sounds_powerup3.wav'],
    'legend': [G + 'Positive Sounds/sfx_sounds_powerup12.wav'],
    'upgrade': [G + 'Positive Sounds/sfx_sounds_powerup10.wav'],
    'kill': [E + 'Shortest/sfx_exp_shortest_soft7.wav', E + 'Shortest/sfx_exp_shortest_soft8.wav'],
    'big': [E + 'Short/sfx_exp_short_soft1.wav'],
    'leak': [G + 'Negative Sounds/sfx_sounds_damage1.wav'],
    'coin': [G + 'Coins/sfx_coin_single3.wav'],
    'wave': [G + 'Menu Sounds/sfx_menu_select2.wav'],
    'boss': [SX + 'General Sounds/Weird Sounds/sfx_sound_poweron.wav'],
    'bomb': [E + 'Medium Length/sfx_exp_medium7.wav'],
    'freeze': [G + 'High Pitched Sounds/sfx_sounds_high3.wav'],
    'lose': [G + 'Weird Sounds/sfx_sound_shutdown1.wav'],
    'glue': [G + 'Interactions/sfx_sounds_interaction16.wav'],
    'shield': [M + 'Portals and Transitions/sfx_movement_portal4.wav'],
    'shieldBreak': [G + 'Impacts/sfx_sounds_impact12.wav'],
    'blink': [M + 'Portals and Transitions/sfx_movement_portal5.wav'],
    'charge': [M + 'Portals and Transitions/sfx_movement_portal6.wav'],
    'seal': [G + 'Weird Sounds/sfx_sound_shutdown2.wav'],
    'cast': [G + 'Simple Bleeps/sfx_sounds_Blip5.wav'],
    'doze': [G + 'Neutral Sounds/sfx_sound_neutral3.wav'],
    'unseal': [G + 'Positive Sounds/sfx_sounds_powerup2.wav'],
    'crit': [G + 'Simple Damage Sounds/sfx_damage_hit4.wav'],
    'atk_knight': [W + 'Melee/sfx_wpn_sword1.wav', W + 'Melee/sfx_wpn_sword2.wav'],
    'atk_rogue': [W + 'Melee/sfx_wpn_dagger.wav', W + 'Melee/sfx_wpn_punch1.wav'],
    'atk_archer': [W + 'Lasers/sfx_wpn_laser10.wav'],
    'atk_mage': [E + 'Shortest/sfx_exp_shortest_soft1.wav', E + 'Shortest/sfx_exp_shortest_soft8.wav'],
    'atk_frost': [G + 'High Pitched Sounds/sfx_sounds_high3.wav', G + 'High Pitched Sounds/sfx_sounds_high4.wav'],
}


def safe_extract(zpath, dst):
    # 받은 zip 안의 경로가 폴더 밖(../ 나 절대 경로)을 가리키면 풀지 않는다 (zip-slip 방지)
    root = os.path.realpath(dst)
    with zipfile.ZipFile(zpath) as zf:
        for m in zf.namelist():
            target = os.path.realpath(os.path.join(root, m))
            if target != root and not target.startswith(root + os.sep):
                raise ValueError(f'zip 안에 폴더 밖 경로가 있다: {m}')
        zf.extractall(root)


def fetch(src):
    os.makedirs(src, exist_ok=True)
    for key, name in ZIPS.items():
        d = os.path.join(src, key)
        if os.path.isdir(d):
            continue
        z = os.path.join(src, name)
        if not os.path.exists(z):
            urllib.request.urlretrieve(OGA + urllib.parse.quote(name), z)
        safe_extract(z, d)
    for name in SINGLES:
        p = os.path.join(src, name)
        if not os.path.exists(p):
            urllib.request.urlretrieve(OGA + urllib.parse.quote(name), p)


def load(path):
    raw = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', '44100', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def lufs(y):
    tmp = '/tmp/_lufs.wav'
    sf.write(tmp, y, 44100)
    out = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-i', tmp, '-af', 'ebur128', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    vals = [l for l in out.splitlines() if l.strip().startswith('I:')]
    return float(vals[-1].split()[1])


THR = 1e-3


def lead_of(y):
    nz = np.nonzero(np.abs(y).max(1) > THR)[0]
    return int(nz[0]) if len(nz) else 0


def encode(y, dst, mono, kbps):
    tmp = '/tmp/_enc.wav'
    sf.write(tmp, y, 44100, subtype='PCM_16')
    args = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', tmp]
    if mono:
        args += ['-ac', '1']
    subprocess.run(args + ['-codec:a', 'libmp3lame', '-b:a', f'{kbps}k', dst], check=True)


def main():
    src = sys.argv[1]
    fetch(src)
    os.makedirs(os.path.join(OUT, 'bgm'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'sfx'), exist_ok=True)
    man = {'bgm': {}, 'sfx': {}}
    for tid, (rel, target) in BGM.items():
        y = load(os.path.join(src, rel))
        # 앞뒤 무음(인코더 여백·끝의 빈 꼬리)만 자른다: 곡 안의 쉼표는 그대로
        amp = np.abs(y).max(1)
        nz = np.nonzero(amp > THR)[0]
        a = nz[0] if nz[0] < 44100 * 0.12 else 0
        b = nz[-1] + 1
        y = y[a:b]
        g = 10 ** ((target - lufs(y)) / 20)
        y = np.clip(y * g, -0.98, 0.98)
        encode(y, os.path.join(OUT, 'bgm', tid + '.mp3'), False, 112)
        man['bgm'][tid] = {'dur': round(len(y) / 44100, 5), 'lead': round(lead_of(y) / 44100, 5)}
        print(f'bgm {tid:10s} {len(y) / 44100:6.1f}s gain {20 * np.log10(g):+5.1f}dB')
    for name, rels in SFX.items():
        man['sfx'][name] = []
        for k, rel in enumerate(rels):
            y = load(os.path.join(src, rel))
            amp = np.abs(y).max(1)
            nz = np.nonzero(amp > THR)[0]
            y = y[nz[0]:nz[-1] + 1]
            y = y / max(1e-6, np.abs(y).max()) * 0.7  # 봉우리를 맞추고, 크기는 게임 쪽 gain 으로
            fn = f'{name}{k}.mp3'
            encode(y, os.path.join(OUT, 'sfx', fn), True, 64)
            man['sfx'][name].append({'f': fn, 'dur': round(len(y) / 44100, 4), 'lead': round(lead_of(y) / 44100, 5)})
    with open(MANIFEST, 'w') as f:
        f.write('// tools/audio_prep.py 가 만든다. 곡 길이(dur)와 첫 소리 위치(lead)로 루프 지점을 맞춘다\n')
        f.write('(function (RS) {\n  RS.AUDIO_MANIFEST = ' + json.dumps(man, separators=(',', ':')) + ';\n})((globalThis.RS = globalThis.RS || {}));\n')
    total = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fs in os.walk(OUT) for fn in fs)
    print(f'합계 {total / 1e6:.1f}MB')


if __name__ == '__main__':
    main()
