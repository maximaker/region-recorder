"""Renders the extension icons (icons/16|32|48|128.png) from one SVG design:
a dark rounded tile, four white crop corners (the chosen area) and a red
record dot. 128 px follows the Web Store rule: 96 px artwork, 16 px clear
padding. Small sizes use thicker strokes so they stay crisp.
Run: python store/make-icons.py   (needs Playwright's Chromium)"""
import asyncio, os
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def svg(size):
    # artwork box: 128 -> 96 with 16 padding; toolbar sizes use ~full canvas
    pad = 16 if size == 128 else round(size * 0.03)
    a = size - 2 * pad                       # artwork size
    r = a * 0.24                             # tile corner radius
    s = max(1.5, a * (0.07 if size <= 16 else 0.055))   # corner stroke
    inset = a * (0.2 if size <= 16 else 0.22)
    arm = a * (0.2 if size <= 16 else 0.17)
    x0, y0, x1, y1 = pad + inset, pad + inset, pad + a - inset, pad + a - inset
    corners = (f"M{x0},{y0+arm} V{y0} H{x0+arm} "
               f"M{x1-arm},{y0} H{x1} V{y0+arm} "
               f"M{x1},{y1-arm} V{y1} H{x1-arm} "
               f"M{x0+arm},{y1} H{x0} V{y1-arm}")
    dot = a * (0.16 if size <= 16 else 0.135)
    c = size / 2
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
  <rect x="{pad}" y="{pad}" width="{a}" height="{a}" rx="{r}" fill="#1c1c21"/>
  <path d="{corners}" fill="none" stroke="#ffffff" stroke-width="{s}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="{c}" cy="{c}" r="{dot}" fill="#ef4444"/>
</svg>'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for size in (16, 32, 48, 128):
            page = await b.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
            await page.set_content(f'<html><body style="margin:0;background:transparent">{svg(size)}</body></html>')
            await page.screenshot(path=os.path.join(ROOT, "icons", f"{size}.png"), omit_background=True)
        # large preview for review
        page = await b.new_page(viewport={"width": 680, "height": 160}, device_scale_factor=1)
        import base64
        b64 = lambda sz: base64.b64encode(open(os.path.join(ROOT, "icons", f"{sz}.png"), "rb").read()).decode()
        tiles = "".join(f'<div style="display:grid;place-items:center;width:128px;height:128px;background:{bg};border-radius:12px"><img src="data:image/png;base64,{b64(sz)}" width="{sz * zoom}" height="{sz * zoom}" style="image-rendering:pixelated"></div>'
                        for sz, bg, zoom in ((128, "#fff", 1), (128, "#202124", 1), (48, "#fff", 1), (16, "#dee1e6", 1), (16, "#202124", 4)))
        await page.set_content(f'<body style="margin:16px;display:flex;gap:0 12px;background:#eee">{tiles}</body>')
        await page.screenshot(path=os.path.join(ROOT, "store", "icon-preview.png"))
        await b.close()
    print("icons written")

asyncio.run(main())
