# Breakwater

A conveyor tower defense game you play in a browser, on a phone or a computer. Fifty levels, no ads, no energy, nothing to buy. Beating a level unlocks the next one, and nothing carries over between levels, so every level plays the same every time.

"Breakwater" is a working title. Change it in `index.html`.

**Play it:** https://jbaseball362.github.io/breakwater/

## Run it

```bash
npm start
```

Then open http://localhost:5173. There is nothing to install, and the only thing that needs Python is this small file server. Any static file server works.

To play on your phone over Wi-Fi, run this instead and open `http://<your-computer's-ip>:5173` on the phone. That shares this folder with everyone on your network while it runs, and your computer has to stay on.

```bash
python3 -m http.server 5173
```

## Play offline

After loading once, the game saves a copy of itself and runs with no connection. Three.js and the fonts are in `vendor/`, so nothing comes from another site.

This also means http://localhost:5173 keeps loading after the server stops, so a page that loads doesn't prove the server is up. While the server is running, edits still show up on a normal reload.

## Install on a phone

Browsers only allow offline play and installing on HTTPS or localhost, so the Wi-Fi address above can't do either. Open https://jbaseball362.github.io/breakwater/ on the phone instead:

- **Android (Chrome):** tap Install game on the title screen, or Install app in the browser menu.
- **iPhone (Safari):** tap Share, then Add to Home Screen.

Give it a few seconds on that first load so it can finish saving its copy.

## How it plays

Drag anywhere to walk, or use WASD or the arrow keys. Your blaster and towers fire on their own.

1. Number plates ride the belts and drop down the pipes into the hydrants.
2. Step into a hydrant's ring to open its valve and collect the parts. A full hydrant stops its belt.
3. Stop on an empty pad and the game pauses until you tap the tower you want, or press 1 to 6 on a keyboard. Walk away to resume without picking. Your parts pay for the tower. Tap a different one before it's finished and you get your parts back.
4. Stand on a finished tower to see what its next level adds. Step off and back on to buy it.
5. Stop the crabs before they reach the pump house. Walking through crabs slows you down.

Colored plates (Chill, Surge, Boom, Patch) fire when you open the valve they landed in, so you choose when to use them.

## Towers and crabs

| Tower | What it's for |
| --- | --- |
| Spitter | A cheap all-rounder that fires at one crab |
| Mortar | Shells that burst across a crowd |
| Foamer | Slows every crab nearby |
| Fire hose | A jet that sprays through crowds, weak against heavy crabs |
| Harpoon | Hunts the biggest crab in range and ignores armor |
| Eel coil | Lightning that jumps from crab to crab |
| Net launcher | Pins the toughest crab in place |
| Signal mast | Makes nearby towers fire faster |
| Bilge pump | Earns parts over time |
| Bench | Upgrades your own blaster (one per level) |

| Crab | What it does |
| --- | --- |
| Scuttler | The basic crab, in big crowds |
| Runner | Twice as fast |
| Flea | Tiny, fast and spread out, so shells waste themselves on it |
| Hermit | Its shell blocks most damage |
| Brood | Bursts into seven scuttlers when killed |
| Molter | Bolts for the gate at half health |
| Medic | Heals the crabs around it |
| Bull | Fast and heavy, and foam barely slows it |
| Jammer | Slows every tower near it |
| King | A boss that does huge damage if it reaches the gate |

## Change it

| To change | Edit |
| --- | --- |
| Levels, roads, pad positions, the difficulty curve | `src/levels.js` |
| Tower, crab and hero stats | `src/content.js` |
| The rules | `src/sim.js` |
| 3D models | `src/render/models.js` |
| Sea, causeway, level color palettes | `src/render/world.js` |
| Menus and HUD | `index.html`, `styles.css`, `src/main.js` |
| App name and install settings | `manifest.webmanifest` |
| App icons | `tools/make_icons.py` (needs Pillow) |
| The list of files saved for offline play | `sw.js` |

## How difficulty works

Each level is one line in `src/levels.js`: its name, road, towers and wave rhythm. The numbers come from three steps:

1. **Economy:** income lets you afford a set share of the level's towers and upgrades, never all of them, so what you buy first matters.
2. **Waves:** each wave is sized to what you could have bought by the time it arrives, so the last waves stay dangerous after you've built up.
3. **Calibration:** an expert bot, trying many tower combinations and build orders, finds the strongest version of each level it can survive. The level is then scaled to leave the room that `targetHeadroom()` asks for: about 2× on level 1, down to almost nothing on level 50. Levels 1–20 are also held to `casualFloor()`, so a casual player can reach the harder ones.

To make the whole game harder or easier, change `targetHeadroom()` and recalibrate. After changing levels, towers or crabs, run both of these:

```bash
npm run calibrate
```

```bash
npm run balance
```

`calibrate` writes `src/level-tuning.js`, and `npm run calibrate -- 12 13` redoes only those levels. It takes about two minutes on 12 CPU cores. `balance` plays every level with three bots and checks each layout for things like a pad sitting in a lane. The idle bot should lose everything, and the expert should always win.

After changing tower or crab stats, also run this. It compares every tower against every kind of wave, and it shows when one tower has become the only sensible choice or a crab needs a new price:

```bash
npm run towers
```

The bots fire special plates as soon as they get them, so a player who times them well can beat the expert. They also never hesitate or misread a level, which a real player will.

Each attempt is recorded in the browser under `breakwater.log.v2`: level, result, time, crabs leaked and what got built. It's for checking the curve against real play, and it's never sent anywhere. Saves and logs belong to one browser, so playing in Chrome and in the app's browser pane gives you two separate sets.

## Offline file list

After adding or removing a file, update the list in `sw.js`. A file missing from the list won't work offline, and a listed file that doesn't exist stops the offline copy from saving at all. This command catches both:

```bash
npm run check:offline
```

## Assets

All geometry and sound are generated in code, so there are no art or audio assets to license. The third-party files in `vendor/` are listed in [vendor/README.md](vendor/README.md).
