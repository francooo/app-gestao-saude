"""Mixa narracao + trilha (com ducking) + SFX em mix.wav, na duracao do video."""
import os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
DUR = 53.6
VO = [(1, .40), (2, 3.60), (3, 7.85), (4, 11.90), (5, 18.60), (6, 22.95), (7, 27.20),
      (8, 29.10), (9, 33.40), (10, 38.10), (11, 44.50), (12, 49.40)]

sfx = [('impactSoft_medium_001.ogg', .30, .6), ('card-slide-1.ogg', 2.90, .55),
       ('drop_001.ogg', 8.05, .6), ('bong_001.ogg', 15.25, .6), ('switch_002.ogg', 24.10, .7),
       ('impactBell_heavy_000.ogg', 26.30, .5), ('impactBell_heavy_003.ogg', 49.30, .55)]
sfx += [('click_003.ogg', t, .6) for t in (5.0, 6.55, 11.3, 13.55, 14.85, 17.3, 20.1, 20.75, 25.6, 31.0, 34.3, 39.45, 42.1)]
sfx += [('rollover2.ogg', t, .45) for t in (11.55, 17.55, 20.35)]
sfx += [('drop_001.ogg', t, .5) for t in (29.4, 33.6, 38.3, 41.15)]
# teclas: uma a cada dois caracteres, alternando os arquivos
keys = ['keypress-0%02d.wav' % n for n in (1, 3, 5, 7, 9, 11, 13, 15)]
k = 0
for t0, t1, n in [(5.2, 6.45, 19), (6.6, 7.35, 8), (13.75, 14.6, 19), (20.9, 21.55, 15),
                  (21.65, 22.3, 19), (22.35, 22.75, 8), (22.95, 23.45, 8)]:
    for i in range(0, n, 2):
        sfx.append((keys[k % len(keys)], t0 + (t1 - t0) * (i + .5) / n, .32)); k += 1

args = ['ffmpeg', '-y', '-loglevel', 'error', '-i', 'music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3']
for n, _ in VO:
    args += ['-i', f'vo/{n:02d}.wav']
for f, _, _ in sfx:
    args += ['-i', f'sfx/{f}']

fc = [f'[0:a]atrim=0:{DUR},asetpts=N/SR/TB,volume=0.28,afade=t=in:d=0.4,afade=t=out:st={DUR-2.2}:d=2.2,aformat=sample_rates=48000:channel_layouts=stereo[mus]']
for i, (_, t) in enumerate(VO, 1):
    ms = int(t * 1000)
    fc.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[v{i}]')
fc.append(''.join(f'[v{i}]' for i in range(1, len(VO) + 1)) + f'amix=inputs={len(VO)}:normalize=0,apad=whole_dur={DUR},asplit=2[vo][vosc]')
base = len(VO) + 1
for j, (_, t, vol) in enumerate(sfx):
    ms = int(t * 1000)
    fc.append(f'[{base+j}:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},adelay={ms}|{ms}[s{j}]')
fc.append(''.join(f'[s{j}]' for j in range(len(sfx))) + f'amix=inputs={len(sfx)}:normalize=0,apad=whole_dur={DUR}[sfx]')
fc.append('[mus][vosc]sidechaincompress=threshold=0.02:ratio=9:attack=30:release=450:makeup=1[duck]')
fc.append(f'[duck][vo][sfx]amix=inputs=3:normalize=0,atrim=0:{DUR},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[out]')
args += ['-filter_complex', ';'.join(fc), '-map', '[out]', '-c:a', 'pcm_s16le', 'mix.wav']
subprocess.run(args, cwd=HERE, check=True)
print('ok mix.wav', len(sfx), 'sfx')
