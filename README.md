# Region Recorder

A Chrome extension that records a part of the page you pick and saves the video by itself.

## Use

1. Click the toolbar icon, or press **Alt+Shift+R**.
2. Drag over the area you want. **Enter** records the whole view right away, **Esc** cancels.
3. Fine-tune it: drag inside to move, drag the handles to resize, or nudge with the arrow keys (Shift for 10 px). The shape menu locks the proportions (**16:9, 4:3, 1:1, 9:16**) or switches to **Full view**, the whole visible page. Drag outside the area to draw a new one.
4. Press **Record** (or Enter). A red frame and a **Stop** button sit just outside the area, so they don't end up in the video. The icon badge shows the time. Next to the timer, small level bars for each sound source you picked (tab sound, mic) turn green when sound is coming in and stay grey when it's silent.
5. A ring follows your cursor inside the area and each click leaves a ripple, so viewers can see what you did. Chrome's tab recording leaves out the real pointer. Turn it on or off with the cursor button in the toolbar before you press Record. Your choice is remembered, and it's the same setting as the checkbox in Options.
   The next two buttons pick the sound: **tab sound** (what the page plays) and **microphone** (your voice). Use either, both, or neither. Both are mixed into one track. The first time you turn the mic on, Chrome's permission box appears right on the page ("Region Recorder wants to use your microphone"). If that can't work on a site, or the recorder still can't use the mic afterwards, a tab opens next to yours instead: click **Allow microphone**, choose Allow, and you're taken back. Hover the mic button to see which route was used.
6. Stop with the button, the icon, or **Alt+Shift+R**. The video saves straight to `Downloads/Region Recordings/` with no dialog, named after the page and the time. A notification confirms it, with **Open** and **Show in folder** buttons.

Closing the tab mid-recording saves what you have so far.

## Settings

Right-click the icon → **Options**:

- **Save to folder**: a folder inside Chrome's downloads folder, with `/` for subfolders. Chrome only lets extensions save inside the downloads folder. To save somewhere else entirely, change Chrome's download location under Settings → Downloads.
- **Video format**: MP4 (default, when Chrome supports it) or WebM.
- **Tab sound** and **Microphone**: the same choices as the toolbar buttons. The tab keeps playing to you while it records. Sound from other apps on your computer isn't included, since Chrome only gives extensions the tab's own audio.
- **Cursor and clicks**: draws the cursor ring and click ripples into the video. They can't follow the pointer inside embedded frames from other sites.

## Install (unpacked)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Pin the icon. The shortcut can be changed at `chrome://extensions/shortcuts`.

## How it works

- `background.js` handles the icon, gets a tab-capture stream id, and saves the finished file with `chrome.downloads`.
- `content.js` draws the selection and adjust overlay, then the frame, Stop button, cursor ring and click ripples.
- `mic-frame.html` is an invisible frame that shows Chrome's mic prompt on the page; `mic.html` is the fallback tab. Either asks for microphone permission once (the recorder runs hidden and can't show Chrome's prompt itself).
- `offscreen.js` holds the tab stream, mixes in the mic, crops each frame to the area with WebCodecs (`VideoFrame` `visibleRect`), and records with `MediaRecorder` at 8 Mbps.
- `test/crop-test.html` checks the crop and record pipeline, `test/audio-mix-test.html` checks that two sound sources both end up in the file, and `test/overlay-test.html` runs the overlay with stubbed extension APIs. Open either one from disk in Chrome.

Needs Chrome 116 or newer. Pages Chrome keeps off-limits to extensions (`chrome://`, the Web Store) can't be recorded.

## Publishing

- `build.ps1` packages the runtime files into `dist/region-recorder-<version>.zip` for the Chrome Web Store (bump `version` in `manifest.json` first).
- `store/LISTING.md` has the paste-ready store text, permission justifications and privacy answers. `PRIVACY.md` is the privacy policy.
- `store/make-icons.py` and `store/make-shots.py` regenerate the icons, screenshots and promo tile.
