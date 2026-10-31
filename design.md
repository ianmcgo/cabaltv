# CYBER//CABLE — design notes

A cable-TV style site in one `index.html`. Each channel is a looping lineup of YouTube videos that plays "live": everyone tuning in sees the same program at the same moment. Viewers can pause, rewind or skip ahead a minute, restart the current program, and jump back to live. One admin (you) edits channels from a built-in console and publishes them to a `channels.json` file in your GitHub repo.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app: viewer, guide, admin console. The sample channel (NERD//NET, 235 AVGN episodes, about 62 hours per loop) is embedded as a fallback. |
| `channels.json` | Created the first time you press **Publish to GitHub**. Once it exists, the TV loads it instead of the embedded sample. |

## Hosting

1. Make a GitHub repo (for example `cybercable`) and put `index.html` in it.
2. Repo **Settings → Pages**: deploy from the `main` branch, root folder.
3. Open `https://<you>.github.io/cybercable/`.

YouTube embeds do not play from a file opened straight off disk (`file://`). To test locally, run `python -m http.server` in the folder and open `http://localhost:8000`.

## How "live" works

Nothing streams from a server. Each channel stores an `epoch` (when its loop started) and its video list with durations. Every browser computes:

```
loop     = sum of all durations
position = (now - epoch) mod loop
```

then walks the lineup to find the video that `position` falls in and the offset inside it, and loads that video at that second with the YouTube IFrame API. Because every viewer does the same math against the clock, they all land on the same frame (within a second or two of clock skew).

- **Absolute timeline.** Positions are kept as seconds since the epoch (not wrapped), so rewinding across a video boundary, or across the loop's start, just finds the earlier program.
- **Drift correction.** While live, every half second the player's position is compared to the schedule. If it is more than 4 s off (buffering, an ad, a sleeping tab), it re-seeks, or loads the right video if the schedule has moved on.
- **Shuffle.** Optional per channel. The order is shuffled per loop with a seeded random generator (seed = channel id + loop number), so it is still identical for every viewer.
- **Broken videos.** If YouTube refuses a video (removed, private, or embedding disabled), the screen shows SIGNAL LOST with a countdown to the next program, like dead air, then tunes back in.

## Time-shift controls

| Control | Key | Behaviour |
| --- | --- | --- |
| Pause / Play | Space | Pauses; the pill shows how far behind live you are. |
| Back 1:00 | ← | Jumps back 60 s, into the previous program if needed. |
| Forward 1:00 | → | Jumps ahead 60 s, but never past live. Reaching live snaps you back to LIVE. Disabled while live. |
| Restart | R | Starts the current program from 0:00. |
| Go live | L | Re-tunes to the live point. Pulses red whenever you are behind. |
| Channel up/down | ↑ ↓ / PgUp PgDn | Static burst, then the channel's live point. Changing channel always returns you to live. |
| Number keys | 0–9 | Type a channel number to jump to it. |
| Guide | G | Side panel: each channel's current program, progress and the next four with start times. |
| Mute / Fullscreen | M / F | Double-clicking the screen also toggles fullscreen. |

While behind live, a program that ends rolls into the next one from its start, so you stay the same distance behind, like a DVR. A yellow tick on the progress bar marks where live is.

YouTube's own controls are hidden and a transparent shield covers the video so viewers can't scrub around in it; the time-shift buttons are the only way to move.

## Admin console (`index.html#admin`)

There is no link to it from the TV; open the address by hand.

**Signing in.** The login is a GitHub fine-grained personal access token:

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate.
2. Repository access: **only** the cybercable repo.
3. Permissions: **Contents: Read and write**. Nothing else.
4. Paste it with the repo name (`owner/name`) and press **Sign in**. The console checks the token can write to that repo.

Anyone can open `#admin`, but without a token that can write to your repo they can only make a draft in their own browser. The token is saved in your browser's local storage only; **Sign out** deletes it.

**Editing.**

- Every change is auto-saved as a *draft* in your browser.
- **Preview draft on this browser's TV** shows the draft on your own TV, with a DRAFT PREVIEW tag; other viewers still see what is published. **Watch** does the same and jumps to that channel.
- **Publish to GitHub** commits `channels.json`. GitHub Pages picks it up within a minute or two.
- **Load from GitHub** replaces the draft with what is published. **Discard draft** throws the draft away.
- **Download / Import JSON** are for backups.

**Adding programs.** Paste video links, playlist links or bare IDs, one per line, then press **Scan & add**. A hidden, muted player loads each video to read its title and length and to check it can be embedded. Videos that can't be embedded are listed and skipped, and duplicates are ignored. Playlists are expanded through the IFrame API's `getPlaylist()`, which may stop at 200 videos. For bigger playlists, add them in parts or paste the video links.

**Channel fields.** Number, name, link name (`index.html#slug` opens that channel directly), color (used for the corner brackets, channel bug and guide accents), tagline, shuffle, and off air (hidden from viewers but kept). **Restart loop now** resets the epoch so the lineup starts over from program 1 for everyone. Editing the lineup changes what is on now, just as a station changing its schedule would.

## channels.json format

```json
{
  "version": 1,
  "channels": [
    {
      "id": "ch-avgn",
      "number": 1,
      "slug": "avgn",
      "name": "NERD//NET",
      "tagline": "…",
      "color": "#39ff88",
      "epoch": "2026-10-31T00:00:00Z",
      "shuffle": false,
      "hidden": false,
      "videos": [["YaXnmR68Zpc", "Maniac Mansion (NES)", 1048]]
    }
  ]
}
```

Each video is `[youtubeId, title, durationSeconds]`. Data load order on the TV: draft (only when preview is on, in the admin's own browser), then `channels.json`, then the embedded sample.

## Updates and the refresh popup (phase 7b)

| File | Field | Meaning |
| --- | --- | --- |
| `index.html` | `BUILD` constant | The app build this page is running. Also shown in the footer. |
| `version.json` | `app` | The newest build on GitHub. |
| `version.json` | `data` | Revision stamp for the channel lineup. |

- Every 5 minutes, and whenever the tab becomes visible again after more than a minute away, the page fetches `version.json` with caching bypassed.
- **New app build** (`app` > `BUILD`): a SYSTEM UPDATE card appears in the corner. **Reboot now** reloads with `?v=<build>` to skip stale caches and returns to the same channel. **Later** hides the card for 30 minutes.
- **New lineup** (`data` changed): the page reloads `channels.json` quietly, keeps you on the same channel, re-tunes only if the live program changed, and shows a "LINEUP UPDATED" toast. No refresh needed.
- **Publish to GitHub** in the admin console writes `channels.json` and then `version.json` with a fresh `data` stamp. It never lowers `app`.

**Releasing a new app version:** bump `BUILD` in `index.html` and `app` in `version.json` to the same number in the same commit. Open tabs on the older build see the popup within about 5 minutes of GitHub Pages updating.

## Look

The style is cyberpunk: Orbitron for display text and Share Tech Mono for everything else, from Google Fonts. Cyan and magenta neon sit on near-black, with a scrolling perspective grid, scanlines, a vignette and glitch-split logo text. Each channel's color drives the HUD corner brackets and channel bug. Channel changes show canvas-generated static and play a WebAudio noise-and-blip sound. The layout collapses to stacked controls on phones.

## Known limits

- YouTube may play ads; drift correction re-syncs after them.
- Durations are captured when a video is added. If an uploader later swaps a video, the schedule uses the old length until you re-add it.
- Viewers' clocks set the schedule; a computer clock that is minutes off will show a different point in the loop.
- Autoplay with sound needs one click, hence the **Jack in** screen.
