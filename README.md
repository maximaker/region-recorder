# Region Recorder

A Chrome extension that records a part of the page you pick and saves the video by itself.

## Use

1. Click the toolbar icon, or press **Alt+Shift+R**.
2. Drag over the area you want. **Enter** records the whole view right away, **Esc** cancels.
3. Fine-tune it: drag inside to move, drag the handles to resize, or nudge with the arrow keys (Shift for 10 px). Pick a shape (**Free, 16:9, 1:1, 9:16**) to lock the proportions. Drag outside the area to draw a new one.
4. Press **Record** (or Enter). A red frame and a **Stop** button sit just outside the area, so they don't end up in the video. The icon badge shows the time.
5. A ring follows your cursor inside the area and each click leaves a ripple, so viewers can see what you did. Chrome's tab recording leaves out the real pointer. You can turn this off in Options.
6. Stop with the button, the icon, or **Alt+Shift+R**. The video saves straight to `Downloads/Region Recordings/` with no dialog, named after the page and the time. A notification confirms it, with **Open** and **Show in folder** buttons.

Closing the tab mid-recording saves what you have so far.

## Settings

Right-click the icon → **Options**:

- **Save to folder**: a folder inside Chrome's downloads folder, with `/` for subfolders. Chrome only lets extensions save inside the downloads folder. To save somewhere else entirely, change Chrome's download location under Settings → Downloads.
- **Video format**: MP4 (default, when Chrome supports it) or WebM.
- **Sound**: records the tab's audio and keeps playing it to you.
- **Cursor and clicks**: draws the cursor ring and click ripples into the video. They can't follow the pointer inside embedded frames from other sites.

## Install (unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Pin the icon. The shortcut can be changed at `chrome://extensions/shortcuts`.

## How it works

- `background.js` handles the icon, gets a tab-capture stream id, and saves the finished file with `chrome.downloads`.
- `content.js` draws the selection and adjust overlay, then the frame, Stop button, cursor ring and click ripples.
- `offscreen.js` holds the tab stream, crops each frame to the area with WebCodecs (`VideoFrame` `visibleRect`), and records with `MediaRecorder` at 8 Mbps.
- `test/crop-test.html` checks the crop and record pipeline, and `test/overlay-test.html` runs the overlay with stubbed extension APIs. Open either one from disk in Chrome.

Needs Chrome 116 or newer. Pages Chrome keeps off-limits to extensions (`chrome://`, the Web Store) can't be recorded.
