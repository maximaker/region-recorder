"""Renders the Web Store images into store/:
  screenshot-1..3.png (1280x800) and promo-tile-440x280.png.
Each screenshot runs the real overlay (content.js) on store/demo-page.html with
stubbed extension APIs, then frames that scene in a browser window under a
caption. Run: python store/make-shots.py   (needs Playwright's Chromium)"""
import asyncio, base64, os
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
W, H = 1160, 640  # scene viewport

STUB = """
window.__deliver = null;
window.chrome = {
  runtime: {
    sendMessage: (m) => Promise.resolve(m.type === 'mic-permission' ? { state: 'granted' } : undefined),
    onMessage: { addListener(fn) { window.__deliver = fn; }, removeListener() {} },
    getURL: (p) => p,
  },
  storage: { sync: { get: (d) => Promise.resolve({ ...d, mic: true, tabAudio: true, showClicks: true }), set: () => Promise.resolve() } },
};
"""

def b64(path):
    return base64.b64encode(open(path, "rb").read()).decode()

async def scene(browser, name, steps):
    page = await browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=2)
    await page.add_init_script(STUB)
    await page.goto("file:///" + os.path.join(HERE, "demo-page.html").replace("\\", "/"))
    if steps:
        src = open(os.path.join(ROOT, "content.js"), encoding="utf-8").read().replace("mode: 'closed'", "mode: 'open'")
        await page.add_script_tag(content=src)
        await page.wait_for_timeout(300)
        await steps(page)
    path = os.path.join(HERE, f"_scene-{name}.png")
    await page.screenshot(path=path)
    await page.close()
    return path

def ui(page):
    return page.locator("region-recorder-ui")

async def adjust_state(page):
    await page.mouse.move(250, 150); await page.mouse.down()
    await page.mouse.move(820, 470, steps=10); await page.mouse.up()
    await page.wait_for_timeout(200)
    await ui(page).locator('button[aria-haspopup="menu"]').click()
    await page.wait_for_timeout(200)
    await ui(page).locator('[role="menuitemradio"]', has_text="16:9").hover()

async def recording_state(page):
    await page.mouse.move(250, 120); await page.mouse.down()
    await page.mouse.move(870, 470, steps=10); await page.mouse.up()
    await page.wait_for_timeout(200)
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(300)
    await page.evaluate("() => { for (let i = 0; i < 3; i++) window.__deliver({ type: 'rr-levels', tab: 0.62, mic: 0.84 }); }")
    await ui(page).locator(".time").evaluate("e => e.textContent = '0:42'")
    await page.mouse.move(560, 300)
    await page.mouse.down(); await page.wait_for_timeout(120)
    await page.mouse.up(); await page.wait_for_timeout(60)

FRAME = """<!doctype html><html><head><meta charset="utf-8"><style>
* {{ box-sizing: border-box; margin: 0; }}
body {{ width: 1280px; height: 800px; overflow: hidden; font-family: "Segoe UI", system-ui, sans-serif;
       background: radial-gradient(1200px 500px at 50% -10%, #ffffff 0%, #eef0f4 55%, #e4e7ee 100%); color: #15171c; }}
.cap {{ text-align: center; padding: 34px 0 0; }}
.cap h2 {{ font-size: 34px; font-weight: 700; letter-spacing: -0.02em; }}
.cap p {{ font-size: 17px; color: #4b5160; margin-top: 8px; }}
.win {{ position: absolute; left: 70px; top: 150px; width: 1140px; border-radius: 12px; overflow: hidden; background: #fff;
       box-shadow: 0 30px 70px rgba(20,24,40,.22), 0 2px 6px rgba(20,24,40,.12); }}
.bar {{ height: 40px; background: #e9ebef; display: flex; align-items: center; gap: 8px; padding: 0 14px; }}
.bar i {{ width: 11px; height: 11px; border-radius: 50%; background: #c9ccd3; }}
.url {{ margin-left: 14px; flex: 1; height: 26px; border-radius: 13px; background: #fff; color: #5b6170; font-size: 13px; display: flex; align-items: center; padding: 0 14px; }}
.ext {{ width: 22px; height: 22px; }}
.win img.scene {{ display: block; width: 1140px; }}
.toast {{ position: absolute; right: 52px; bottom: 46px; width: 380px; background: #2b2b2f; color: #fff; border-radius: 10px; padding: 16px;
         box-shadow: 0 16px 40px rgba(0,0,0,.35); display: grid; grid-template-columns: 40px 1fr; gap: 4px 12px; }}
.toast img {{ width: 40px; height: 40px; grid-row: span 2; }}
.toast b {{ font-size: 15px; }} .toast span {{ font-size: 13px; color: #c9c9cf; }}
.toast .btns {{ grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }}
.toast .btns div {{ background: #3d3d43; border-radius: 6px; text-align: center; padding: 7px; font-size: 13px; }}
</style></head><body>
<div class="cap"><h2>{title}</h2><p>{sub}</p></div>
<div class="win"><div class="bar"><i></i><i></i><i></i><div class="url">app.fieldnote.example/overview</div>
<img class="ext" src="data:image/png;base64,{icon}"></div><img class="scene" src="data:image/png;base64,{scene}"></div>
{extra}
</body></html>"""

TOAST = """<div class="toast"><img src="data:image/png;base64,{icon}"><b>Recording saved</b>
<span>Fieldnote · Overview 2026-11-27 17-12-08.mp4</span><div class="btns"><div>Open</div><div>Show in folder</div></div></div>"""

PROMO = """<!doctype html><html><head><meta charset="utf-8"><style>
* {{ box-sizing: border-box; margin: 0; }}
body {{ width: 440px; height: 280px; overflow: hidden; font-family: "Segoe UI", system-ui, sans-serif;
       background: radial-gradient(520px 300px at 20% 0%, #ffffff 0%, #eef0f4 60%, #e2e5ec 100%); color: #15171c;
       display: flex; flex-direction: column; justify-content: center; padding: 0 40px; }}
img {{ width: 80px; height: 80px; margin: -8px 0 16px -8px; }}
h1 {{ font-size: 32px; font-weight: 700; letter-spacing: -0.02em; }}
p {{ font-size: 17px; color: #4b5160; margin-top: 6px; }}
</style></head><body><img src="data:image/png;base64,{icon}"><h1>Region Recorder</h1><p>Record any part of a web page.</p></body></html>"""

async def main():
    icon = b64(os.path.join(ROOT, "icons", "128.png"))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        shots = [
            ("1", adjust_state, "Pick exactly what to record",
             "Drag over any part of a page. Free shape, 16:9, 4:3, 1:1, 9:16 or the full view.", ""),
            ("2", recording_state, "Your voice and the page's sound",
             "Turn the mic and tab sound on or off. Live bars show sound is coming in.", ""),
            ("3", None, "Saved straight to your folder",
             "No save dialog. An MP4 lands in Downloads, with Open and Show in folder.", TOAST.format(icon=icon)),
        ]
        for name, steps, title, sub, extra in shots:
            s = await scene(b, name, steps)
            page = await b.new_page(viewport={"width": 1280, "height": 800}, device_scale_factor=1)
            await page.set_content(FRAME.format(title=title, sub=sub, icon=icon, scene=b64(s), extra=extra))
            await page.wait_for_timeout(200)
            await page.screenshot(path=os.path.join(HERE, f"screenshot-{name}.png"))
            await page.close()
            os.remove(s)
        page = await b.new_page(viewport={"width": 440, "height": 280}, device_scale_factor=1)
        await page.set_content(PROMO.format(icon=icon))
        await page.screenshot(path=os.path.join(HERE, "promo-tile-440x280.png"))
        await b.close()
    print("store images written")

asyncio.run(main())
