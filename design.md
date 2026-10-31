# Cabal Coffers TV — design notes

A cable-TV style site in one `index.html`. Each channel is a looping lineup of YouTube videos that plays "live": everyone tuning in sees the same program at the same moment. Viewers can pause, rewind or skip ahead a minute, restart the current program, and jump back to live. One admin (you) edits channels from a built-in console and publishes them to a `channels.json` file in your GitHub repo.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole app: viewer, guide, admin console. Six starter channels are embedded as a fallback: NERD//NET (CH 01, AVGN episodes rotated with Scott The Woz, Gaming Historian, LGR, brutalmoose, JonTron, Pat the NES Punk, Jason Graves and Poison Mushroom, spread evenly across the loop in proportion to how many videos each show has, so smaller shows such as Poison Mushroom turn up at even intervals instead of bunching together, and the same show never plays twice in a row, 1,660 videos, about 448 h, after removing off-topic videos (movie reviews, LGR's general computer hardware videos, non-game cameras, audio and office gear, music videos, skits and story episodes, fan contests, board games, store visits and channel updates); the LGR and Pat the NES Punk additions skip channel updates, LGR's mail-opening videos, other creators' uploads and anything under a minute or over an hour, and the Jason Graves additions skip channel updates but keep his feature-length videos), Cabal Coffers TV (CH 02, the Cabal Coffers Trading Cards and Video Game & Toys playlists alternated, 113 videos, about 34 h) Cartoon Theme Songs (CH 03, 149 intros from the "Catchiest Cartoon Theme Songs" playlist, about 3 h, with station IDs off because each program is about a minute), 90's Rock Music Videos (CH 04, 188 videos, about 13 h) 00's Rock Music Videos (CH 05) and Nickelodeon Game Shows (CH 06, 373 full episodes from five fan playlists, rotating GUTS, Nick Arcade, Legends of the Hidden Temple, Wild & Crazy Kids and Double Dare one episode at a time). The two rock channels leave out the source playlists' non-music uploads, fan lyric videos and duplicates. A channel's `aliases` list keeps old links working: `#cards` and `#retro` tune to Cabal Coffers TV, and `c/cards.html` and `c/retro.html` redirect there. |
| `version.json` | Latest app build and lineup revision (see the updates section). |
| `manifest.webmanifest`, `icons/` | Install-as-app metadata and icons. |
| `og/*.jpg`, `c/*.html` | Share preview images and the small per-channel share pages that point to them. |
| `worker/` | Optional Cloudflare Worker for viewer counts and chat (phase 11). |
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
- **Broken videos.** If YouTube refuses a video (removed, private, or embedding disabled), the TV skips straight to the next program with a brief "SKIPPING UNAVAILABLE VIDEO" note. In live mode it remembers how much of the broken slot was left, a per-channel skew in this browser, so the following programs keep playing in order; the viewer runs that many seconds ahead of the shared schedule until the page reloads. Use **Re-check all** in the admin console to remove dead videos for good.

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
      "aliases": [],
      "name": "NERD//NET",
      "tagline": "…",
      "color": "#39ff88",
      "epoch": "2026-10-31T00:00:00Z",
      "shuffle": false,
      "hidden": false,
      "idents": true,
      "breakEvery": 0,
      "videos": [["YaXnmR68Zpc", "Maniac Mansion (NES)", 1048]],
      "bumpers": [],
      "blocks": [
        {"id": "b1", "name": "Saturday Morning", "days": [6], "start": "08:00", "end": "12:00", "shuffle": false, "videos": []}
      ]
    }
  ],
  "settings": {
    "tz": "America/Los_Angeles",
    "guide": {"enabled": true, "number": 0, "name": "THE GRID"},
    "cards": ["avgn", "cabal", "grid"],
    "social": {"url": "", "chat": true}
  }
}
```

Each video is `[youtubeId, title, durationSeconds]`. Data load order on the TV: draft (only when preview is on, in the admin's own browser), then `channels.json`, then the embedded sample.

## Channel tools (phase 8)

- **Whole YouTube channels.** In Add programs, paste a `/channel/UC...` link or a bare channel ID. It is turned into that channel's uploads playlist (`UU...`). An `@handle` can't be resolved from the browser, so the console asks for the channel ID instead (Share, then Copy channel ID). The IFrame API lists at most about 200 videos of a playlist; add older ones by link.
- **Re-check all.** Test-loads every video in the lineup and updates titles and lengths that changed. It lists videos that are now removed, private or blocked from embedding, with a **Remove dead** button. **Stop** cancels part-way. It takes 1–3 s per video, so a 235-video channel needs a few minutes. Timeouts are not counted as dead, since they are usually network hiccups.

## Real-cable features (phase 9)

**Station IDs.** When a new program starts on its own (not when you tune in partway), a three-second ident plays over its first moments: the channel number and name in neon, with a short chime from the browser's audio engine. It doesn't move the schedule. Turn it off per channel with "Station ID between programs".

**Up next.** About 20 seconds before a program ends (for programs over 2 minutes), an "UP NEXT" banner slides in at the lower left with the next program's title.

**Promo breaks.** Each channel has a separate **Promo clips** list (choose it under *Editing*). With "Promo break every N programs" above 0, one clip plays after every N programs, cycling through the list. The pattern is fixed, so every loop is the same length and every viewer still lines up. Promos are labelled PROMO BREAK, and the guides skip them.

**Time blocks.** A block is a named lineup that takes over a channel at set times each week, for example "Saturday Morning", Sat 08:00–12:00.
- Times are **station time**: the time zone in the Station panel. It starts as `America/Los_Angeles` (US Pacific, with daylight saving handled automatically); change it there. Every viewer uses station time, so they stay in sync wherever they are.
- During a block the channel plays the block's lineup from the top (optionally shuffled per airing). A main-loop program still running when a block starts is cut off at the start, like real TV.
- The main loop keeps counting underneath. When the block ends, the channel joins the main program already in progress.
- An end time earlier than the start runs past midnight (23:00–02:00).
- The admin page shows a weekly heat map of a channel's blocks.

Internally, `locate()` checks block instances for the current and previous station day, using `Intl.DateTimeFormat` to turn station-time clock times into UTC, so changes to and from daylight saving time are handled. Otherwise it falls back to the main loop and trims the current item to the next block start. Programs trimmed short end on the schedule, not when YouTube's video ends.

**THE GRID (program guide channel).** A built-in channel, number 000 by default so it sits at the top of the lineup (shown as `000`; type 0 to tune it). Set the name, number or off switch in the Station panel. It shows a full-screen 90-minute guide, starting at the current half hour, for every channel. The current programs are highlighted and a yellow line marks the time. A spotlight box rotates through what's on now with a thumbnail every 7 seconds, and the list scrolls when there are more channels than fit. A quiet synth pad and arpeggio, generated in the browser, plays on this channel.

## Any screen (phase 10)

**Install as an app.** `manifest.webmanifest` and the icons in `icons/` make the site installable. Chrome and Edge show an **Install** button in the top bar when installing is possible; on iPhone use Share, then Add to Home Screen. Installed, it opens full screen without browser chrome. There is deliberately no service worker: the TV is always online, and caching would get in the way of the refresh popup.

**TV mode** (`T` or the TV mode button). Goes full screen, hides the page chrome and floats the now-playing bar and controls over the picture. After 4 s with no input they fade out and the cursor hides; any key, mouse movement or touch brings them back. `T`, Esc or a remote's Back button leaves TV mode.

**Remote controls and D-pads** (smart TVs, Fire TV and game-console browsers):

| Remote key | Action |
| --- | --- |
| Up / Down, Channel +/− | Change channel |
| Left / Right, Rewind / Fast-forward | Back or forward 1 minute |
| OK / Enter, Info | Show the channel info overlay |
| Play/Pause | Pause or resume |
| Guide (or G) | Open the guide. Up/Down moves the yellow highlight, OK tunes, Back closes. |
| Back (Esc, Backspace, webOS 461, Tizen 10009) | Close the guide, or leave TV mode |
| Number keys | Jump to a channel |
| S (or a remote's Subtitle key) | Captions on or off |
| C | Open or close chat (when the social server is set) |

All buttons have a visible yellow focus ring for Tab or D-pad focus navigation. When a button has focus, Enter and Space press it instead of acting as TV keys.

**Share links with previews.** **Share** in the top bar uses the phone's share sheet, or copies the link on desktop. For channels that have a share card, the link is `c/<slug>.html`: a tiny page with Open Graph tags (title, tagline and a 1200×630 card image from `og/`) that sends visitors straight to `index.html#<slug>`. Discord, iMessage, X, Facebook and others show the card. Channels without a card get a plain `index.html#slug` link.

In the admin console, **Publish share cards** draws a card for every on-air channel and THE GRID in the browser (canvas, same fonts as the site). It commits `og/<slug>.jpg` and `c/<slug>.html` (skipping unchanged files) and records the list in `settings.cards`, then publishes the lineup. Run it after adding or renaming channels. If you move to a custom domain, fill in **Site address** so the cards carry the right URLs. The home page itself uses `og/default.jpg`.

## Social: viewer counts and chat (phase 11)

Viewer counts and chat need a tiny always-on server, because GitHub Pages only serves files. `worker/` is a Cloudflare Worker with one Durable Object (`Hub`), which runs on Cloudflare's free plan. The TV works fully without it; social features appear only once you set its address.

**How it works.** Each TV opens one WebSocket to `<worker>/ws` and sends `{t:"join", room:<channel slug>}` whenever it tunes, so the room is the channel.

- **Viewer counts.** The hub tags each socket with its room and broadcasts `{t:"counts"}` (watchers per channel) about a second after anyone joins, leaves or switches. The top bar shows "◉ N WATCHING · M ONLINE", and the guide shows a count per channel.
- **Chat.** `C` or the Chat button opens a panel for the current channel. Messages are plain text (up to 200 characters, handle up to 20) with control and invisible characters removed. Rate limit: one message per 1.2 s and 8 per 20 s per connection. The last 50 messages per channel are stored and sent to newcomers.
- **Connection.** The hub uses Cloudflare's WebSocket hibernation, so idle rooms cost nothing. The client pings every 25 s and reconnects with backoff (1 s up to 30 s).
- **Origin check.** Only pages served from origins in `ALLOWED_ORIGINS` (in `wrangler.toml`, default `https://ianmcgo.github.io`) can connect. Add your custom domain there if you move.

**Deploying (about 5 minutes):**

1. Make a free Cloudflare account.
2. In a terminal: `cd worker && npm install && npx wrangler login && npx wrangler deploy`.
3. Wrangler prints an address like `https://cybercable-social.<you>.workers.dev`.
4. In the admin console's Station panel, paste that into **Social server**, keep **Chat** ticked (untick for counts only), and Publish.

Open TVs pick up the change within about 5 minutes, without a refresh.

Local test: `npx wrangler dev --var ALLOWED_ORIGINS:http://localhost:8000` and set the social server to `http://localhost:8787` in a draft preview.

There is no moderation dashboard. If chat gets abused, untick Chat (counts keep working). To clear a channel's history, delete its `h:<slug>` key or redeploy with a new Durable Object name.

## Captions (build 8)

Captions start **off** (`cc_load_policy: 0`). The **CC** button, `S`, or a remote's Subtitle key switches them on or off, and the choice is saved in the viewer's browser. Switching uses the IFrame player's `captions` module: on loads the module and picks a track in the browser's language, then English, then whatever exists; off unloads it. YouTube can reset captions when a new video loads, so the setting is re-applied each time a program starts. Videos without captions just show none. The `captions` module calls are an undocumented part of the IFrame API; if YouTube changes them, the button stops working but nothing else breaks.

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


The site is branded Cabal Coffers TV everywhere: browser tab, on-screen logo, share text, share pages and cards, home-screen app name and the social hub. It was called CYBER//CABLE before build 30.

CH 07 Internet Cartoons (slug `internet`): 158 MeatCanyon cartoons from the "meatcanyon Animation videos in order" playlist, about 9.6 h, played in release order. The Day Drinkin promo and the Monster Lab Kickstarter announcement are left out. The 25 G.I. Joe PSA parodies (the 2007 Fensler Films redubs, from a fan playlist) are spread evenly between the MeatCanyon cartoons, in order. The Big Lez Show collection (53 videos: seasons 1-4, the three Choomah Island specials, The Mike Nolan Show, Mike Nolan's Long Weekend, On Location with Clarence Claymore and Sassy the Sasquatch) is the third show in the mix, Wabie's 11 cartoons (oldest first, hashtags trimmed from the titles) are the fourth, and David Firth's Fat-Pie Anthology is the fifth: 100 cartoons from his playlist, with duplicate Jerry Jackson uploads and the Plastic Hand director's-cut joke removed, and Salad Fingers, Burnt Face Man, Sock, The World Within A Sock, Health Reminder, Spoilsbury Toast Boy and Panathinaikos Bear episodes put in number order. Kill Frog is the sixth: 9 shorts from a fan playlist (Little Susie Experiments 1-3, the Dumbass Bass pair, the two Easter how-tos, Ultimate Survivor: Outback Attack part 1 and Bad Clues #1), with titles tidied and prefixed "Kill Frog:". Dungeon Soup is the seventh: 32 cartoons from the series playlist, including the 41-minute Chaotic Good Barbarian season 1 compilation, prefixed "Dungeon Soup:"; the 12-hour My Blade extended loop is left out (the normal My Blade is in). All seven are spread evenly by video count and no show plays twice in a row. 388 videos, about 26.6 h in all.

The now-playing bar uses minmax(0,1fr) grid columns and min-width:0 on its children, so a long title is cut off with an ellipsis instead of pushing the title and progress bar past the box on phones.

## Ads and buffering (build 38)

YouTube can play ads before or during a program. While an ad plays, the program itself is stopped, but the channel clock kept running, so when the ad finished the drift check jumped the program ahead to the live position and the viewer lost that stretch of the program. Now `holdTick` (run from `tick`, twice a second) watches the player: when an ad is showing (the player reports a different video id, or a duration that does not match the program's known length) or the program is stalled (playing or buffering but the playback time is not moving), the time is added to `V.hold[slug]`. `liveAbs` subtracts the hold, so the channel waits for the viewer and the program resumes exactly where it stopped. The drift check and the trimmed-program cut-off are skipped while an ad is detected. Tuning to a channel (including GO LIVE) resets that channel's hold, so changing channels or pressing GO LIVE still lands on the true live position.

Build 39 makes this independent of ad detection, which cannot be tested outside a real browser. The channel now follows the viewer's player instead of pulling the player to the clock: if the program falls behind the schedule for any reason (ads, buffering, a slow load), the gap is added to the hold instead of seeking forward, so no part of a program is skipped. When a program ends, the next one always starts from its beginning and the hold is adjusted to match, instead of joining the next program part-way through. Only tuning in or pressing GO LIVE snaps back to the true live point.

Build 40 adds an automatic rewind after ads (`guardTick`). While a program plays normally, the page remembers the last good playback time (`V.good`, starting at the point the program was loaded from). If the playback time suddenly jumps forward by more than a few seconds and the page did not cause the jump itself (its own seeks go through `pSeek`, which marks them), it assumes YouTube moved the program on while an ad was showing and seeks back to the last good time, so the viewer does not miss that part of the program. Removing, hiding or skipping YouTube's ads is not done: YouTube's embed terms don't allow it and the page can't reach inside YouTube's player anyway.

CH 08 YouTube Movies (slug `movies`): 1,871 free-with-ads films from two fan playlists ("Movies FREE w/ads (grouped by genre)" and "YouTube Movies (Free With Ads)"), about 3,100 h, shuffled with a fixed seed so genres mix. The playlist data API returns no items for movie playlists, so the list was read from YouTube's watch-page playlist panel in windows. 222 films were in both playlists and appear once; Spanish-language versions and one exact duplicate are left out. The second playlist claims 2,905 videos but only about 1,180 are still available; the rest have left YouTube's free catalog. Age-restricted (mostly R-rated) films refuse to play in embedded players ("only available on YouTube"), so the channel's lost-signal skip moves past them. Films YouTube removes from the free catalog are skipped the same way.

Build 42 opened a gap in the click shield over the bottom-right corner of the picture (the right third, bottom 30%), which is where YouTube puts its own Skip Ad button, so viewers can press Skip themselves. The shield still covers the rest of the picture. A tap in that corner during a normal program reaches YouTube's player, which pauses it; PLAY or another tap resumes.

Build 43 changes three things:
- The CRT scanline overlay no longer uses `mix-blend-mode: multiply`. The free YouTube movies are copy-protected (DRM). On phones, protected video is drawn on a separate hardware layer, and a blend mode over it forces the browser to read the video's pixels, which it is not allowed to do, so the picture went black while ads, which are not protected, still showed. The scanlines are now plain semi-transparent lines, which look the same.
- The Skip-button gap in the shield is only open while the program looks interrupted (an ad is detected or the playback time has stopped moving for the last couple of seconds). On phones, a tap on YouTube's player during a normal program opens the YouTube app, so the corner is covered again once the program is playing.
- The automatic rewind from build 40 (`guardTick`) is switched off. During a pre-roll ad the player can report the ad's own playing time, which the rewind could mistake for the program's position and then seek the program back to it.

Build 44: when a viewer taps YouTube's player directly (through the Skip gap), YouTube shows its own controls overlay (big pause icon, share and watch-later buttons, YouTube logo). On phones that overlay never hid again, because the shield stops any further taps reaching the player. `ytReset` now runs when a program resumes after a pause or after the player was tapped: it moves focus back to the page and hides the player frame for two animation frames, which clears YouTube's hover state so its overlay goes away.

Build 45: during some ads YouTube reports the program as paused, so the page showed PAUSED, closed the Skip gap and stopped holding the schedule, and the PAUSED badge sat right on top of YouTube's Skip button. Now only the viewer's own PAUSE button counts as a pause (`V.userPause`); any other pause YouTube reports is treated as an interruption (the Skip gap opens and the schedule waits). The PAUSED badge moved from the bottom-right corner to the top centre of the picture so it can never cover Skip.
