# Chrome Web Store listing

Paste-ready text for the developer dashboard. Images are in this folder.

## Package

Upload `dist/region-recorder-<version>.zip` (build it with `build.ps1`).

## Store listing tab

**Name:** Region Recorder

**Summary (132 chars max):**
Record any part of a web page as a video. Pick an area, record with sound, and it saves straight to your folder.

**Category:** Productivity → Tools
**Language:** English

**Description:**

Record just the part of a page you need. No editing afterwards, no save dialog.

HOW IT WORKS
• Click the toolbar icon or press Alt+Shift+R.
• Drag over the area you want. Move it, resize it, or nudge it with the arrow keys.
• Pick a shape: free, 16:9, 4:3, 1:1, 9:16, or the full view.
• Press Record. A thin red frame shows what's being recorded, and a small Stop button sits just outside it, so neither ends up in the video.
• Stop with the button, the icon or the shortcut. The video saves straight to Downloads/Region Recordings, and a notification lets you open it or show it in its folder.

SOUND
• Record the page's own sound, your microphone, both, or neither.
• Live level bars next to the timer show that sound is coming in.

SHOW WHAT YOU DID
• An optional cursor ring and click ripples are drawn into the video, so viewers can follow along. Chrome's tab recording leaves out the real pointer.

ALSO
• MP4 by default (WebM if you prefer), sharp at your screen's resolution.
• Choose your own save folder inside Downloads.
• Closing the tab mid-recording saves what you have so far.

PRIVATE BY DESIGN
No accounts, no servers, no analytics. Your videos never leave your computer.

**Screenshots (1280×800):** screenshot-1.png, screenshot-2.png, screenshot-3.png
**Small promo tile (440×280):** promo-tile-440x280.png
**Store icon:** icons/128.png

## Privacy practices tab

**Single purpose:**
Records a user-selected area of the current tab as a video, optionally with the tab's sound and the user's microphone, and saves it to the user's downloads folder.

**Permission justifications:**
- **tabCapture:** captures the current tab's video (and sound, if the user turns it on) after the user clicks the extension icon or presses its shortcut. The capture is cropped to the area the user drew.
- **activeTab:** gives the extension access to the current tab only when the user invokes it, to show the area picker there and start the tab capture.
- **scripting:** injects the area picker and the recording controls (frame, Stop button) into the tab the user invoked the extension on.
- **offscreen:** runs the cropping and MediaRecorder in an offscreen document (reason USER_MEDIA), because the service worker can't handle media streams.
- **downloads:** saves the finished video to the user's downloads folder without a save dialog.
- **downloads.open:** the "Open" button on the "Recording saved" notification opens the video the extension just saved.
- **notifications:** confirms that a recording was saved (with Open / Show in folder buttons), or explains why a recording couldn't start.
- **storage:** saves the user's settings (save folder, format, sound choices, cursor highlight).
- **Web accessible resource (mic-frame.html):** an invisible extension frame that makes Chrome show its microphone permission prompt on the page, only when the user turns the microphone on.

**Remote code:** No, I am not using remote code. All code is in the package.

**Data usage:** Does not collect or use any user data. (Video and audio are processed and saved on the user's device only and never transmitted. Under the store's definitions, that isn't collection.)
Tick the three certifications: no selling, no unrelated use, no creditworthiness use.

**Privacy policy URL:** https://github.com/maximaker/region-recorder/blob/main/PRIVACY.md
(The repository is public, so this link works.)

## Distribution tab

Public, all regions, free.

## Regenerating the images

- Icons: `python store/make-icons.py`
- Screenshots and promo tile: `python store/make-shots.py`
