"""Captura a composicao index.html quadro a quadro e codifica em MP4.

Uso:
  python -I render.py stills 0.5 3.5 ...    -> stills/t_<s>.png
  python -I render.py video <poster_t>      -> video_noaudio.mp4 (quadro 0 = poster)
  python -I render.py audio                 -> music.wav
"""
import asyncio, base64, os, subprocess, sys
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
URL = 'file:///' + os.path.join(HERE, 'index.html').replace('\\', '/')
FFMPEG = 'ffmpeg'
FPS, DUR = 30, 55.0


async def page_ready(pw, url=URL):
    browser = await pw.chromium.launch(channel='chrome')
    page = await browser.new_page(viewport={'width': 1080, 'height': 1920}, device_scale_factor=1)
    await page.goto(url)
    await page.evaluate('window.ready')
    return browser, page


async def stills(ts):
    os.makedirs(os.path.join(HERE, os.environ.get('STILLS', 'stills')), exist_ok=True)
    async with async_playwright() as pw:
        browser, page = await page_ready(pw)
        for t in ts:
            await page.evaluate(f'renderFrame({t})')
            await page.screenshot(path=os.path.join(HERE, os.environ.get('STILLS', 'stills'), f't_{t:06.3f}.png'))
        await browser.close()


async def video(poster_t):
    out = os.path.join(HERE, 'video_noaudio.mp4')
    ff = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS),
                           '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
                           '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', str(FPS), out], stdin=subprocess.PIPE)
    n = int(round(DUR * FPS))
    async with async_playwright() as pw:
        browser, page = await page_ready(pw)
        for i in range(n):
            t = poster_t if i == 0 else i / FPS
            await page.evaluate(f'renderFrame({t})')
            ff.stdin.write(await page.screenshot(type='jpeg', quality=95))
            if i % 150 == 0:
                print(f'frame {i}/{n}', flush=True)
        await browser.close()
    ff.stdin.close()
    ff.wait()
    print('ok', out)


async def audio():
    async with async_playwright() as pw:
        browser, page = await page_ready(pw, URL.replace('index.html', 'music.html'))
        b64 = await page.evaluate('renderMusic()')
        await browser.close()
    with open(os.path.join(HERE, 'music.wav'), 'wb') as f:
        f.write(base64.b64decode(b64))
    print('ok music.wav')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'stills':
        asyncio.run(stills([float(x) for x in sys.argv[2:]]))
    elif cmd == 'video':
        asyncio.run(video(float(sys.argv[2])))
    elif cmd == 'audio':
        asyncio.run(audio())
