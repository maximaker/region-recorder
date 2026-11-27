# Privacy policy: Region Recorder

_Last updated: 27 November 2026_

Region Recorder does not collect, send or sell any data. It has no servers, no accounts, no analytics and no tracking. Everything it records stays on your computer.

## What it records, and where it goes

- **Video of the area you choose on the current tab.** Recording only starts when you click the extension's icon (or press its shortcut), choose an area and press Record. It stops when you press Stop. Nothing is recorded in the background.
- **Sound, only if you turn it on:** the tab's own sound and/or your microphone. You choose both in the toolbar before recording.
- **The finished video is saved straight to your downloads folder** (by default `Downloads/Region Recordings`). It is never uploaded or sent anywhere. While recording, the video is held in your browser's memory, and that memory is freed once the file is saved.

## What it stores

- **Your settings** (save folder, video format, sound choices, cursor highlight). Stored with `chrome.storage.sync`, so Chrome can sync them between your own browsers if you use Chrome sync. Nobody else can see them.

## Permissions

- **Tab capture:** records the current tab after you start a recording.
- **Active tab and scripting:** after you click the icon, shows the area picker and the Stop button on that tab only.
- **Offscreen document:** a hidden extension page that does the cropping and recording, because Chrome's background worker can't record media.
- **Downloads:** saves the finished video to your downloads folder without a save dialog.
- **Open downloads:** the **Open** button in the "Recording saved" notification.
- **Notifications:** tells you when a video is saved, or why a recording couldn't start.
- **Storage:** saves your settings, as described above.
- **Microphone (asked by Chrome, only if you turn the mic on):** Chrome asks you once. The microphone is only used while you record, and only for the video on your computer.

## Contact

Questions: open an issue at https://github.com/maximaker/region-recorder/issues
