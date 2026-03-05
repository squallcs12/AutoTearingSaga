# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

AutoTearingSaga is a game automation tool that farms stat upgrades in a PS1 game (SLPS-03177) running inside the DuckStation emulator on an Android emulator. It uses WebdriverIO + Appium to automate controller inputs, capture screenshots, and use image analysis (via `sharp`) to detect level-up screens and evaluate whether stat gains meet desired conditions. The goal is to automate RNG manipulation for optimal level-up stat rolls.

## Commands

```bash
# Install dependencies
yarn install

# Run all tests (uses wdio.conf.js)
npm run wdio

# Run level-up farming automation
npm run level
# or: npx wdio --spec test/specs/levelup.e2e.js

# Run arena automation
npm run arena
# or: npx wdio --spec test/specs/arena.e2e.js

# Run level-up with 4 retries before playing audio
npm run run4

# Sync save file from physical phone to emulator
node sync-phone.js

# Pull save from physical phone to laptop
node pull-phone.js

# Push save from emulator back to phone
node restore-phone.js
```

## Prerequisites

Before running, ensure:
1. Android emulator is running at `emulator-5554` (or physical device `R3CN203BDKN`) on Android 12
2. DuckStation app (`com.github.stenzek.duckstation`) is installed and the game loaded
3. Appium server is accessible on `localhost:4723` (started automatically by wdio via `services: ['appium']`)
4. Save state must be pre-loaded at the correct game point before running automation
5. `test/specs/levelup.js` exists (it is gitignored — must be created locally)

## Local Config File (gitignored)

`test/specs/levelup.js` must be created manually and exports:
- `forceRandom` — string of movement steps for RNG manipulation before battle
- `fight` — string of battle action steps
- `isBoss` — boolean, whether the enemy is a boss (longer finish wait)
- `goodCondition` — object or array of objects defining required stat increases
- `syncGithub` — boolean, whether to auto-commit+push the save file on success

Example:
```js
const forceRandom = `up\ndown\n...`; // input sequence for RNG manipulation
const fight = `O\nO\n...`;           // input sequence through battle menus
const isBoss = false;                 // true for boss fights (longer finish wait)
const goodCondition = { count: 3, 1: 1, 3: 1 }; // e.g. need strength+speed + 1 more
// or array: [{ count: 3, 1: 1 }, { count: 4 }]
const syncGithub = false;             // set true to auto-commit save on success
module.exports = { forceRandom, fight, isBoss, goodCondition, syncGithub };
```

## Architecture

### Core Loop (`test/specs/levelup.e2e.js`)

The main loop:
1. Reload from save state (`PlayingPage.reload()`)
2. Execute steps from `forceRandom` + `fight` via `PlayingPage.perform(step)`
3. Wait for level-up screen (`wait-level-up`)
4. Save to slot 1
5. Analyze screenshots to check if stat increases meet `goodCondition`
6. If good: break and optionally commit save; otherwise repeat indefinitely

### Step DSL (`test/pageobjects/playing.page.js`)

`PlayingPage.perform(step)` parses string commands like:
- Movement: `up`, `down`, `left`, `right`, `up-left`, `up-right`, `down-left`, `down-right`
- Buttons: `O`, `X`, `2O` (double O), `square`, `triangle`
- Actions: `confirm` (spam O), `save`, `save1`, `finish`, `boss`, `wait`, `pic`, `wait-level-up`
- Steps can include a repeat count: `"down 3"` moves down 3 times

### Level-Up Detection (`scene-detection/check-level.js`)

1. Takes 7 screenshots during the level-up screen
2. Crops the level-up panel region (pixels `[140,227]` to `[920,657]`)
3. Converts to grayscale, matches pixel colors against `sample-color.json` palette — if ≥50% match, it's a level-up screen
4. Scans specific pixel regions for green pixels (RGB thresholds) to detect which of 9 stats increased
5. Stats 1–5 are in the left column (starting at x=420), stats 6–9 in the right column (x=700)
6. Evaluates result against `goodCondition`: `count` sets minimum total increases; individual stat keys use `1` (must increase) or `-1` (must NOT increase)
7. On success + `syncGithub=true`: auto-pulls save file via adb and git commits/pushes

### Arena Detection (`scene-detection/check-arena.js`)

Compares screenshot colors against `arena-color.png` reference image with a 98%+ match threshold to detect the arena confirmation screen.

### Save File Sync Scripts

- `pull-phone.js` — ADB pull save from physical phone
- `sync-phone.js` — Sync save between phone and emulator
- `restore-phone.js` — Push emulator save back to phone

### Calibration Scripts (`example/`)

- `example/level-up/level-up-examinate.js` — Generates `sample-color.json` by sampling the level-up panel

## Key Files

| File | Purpose |
|------|---------|
| `test/specs/levelup.e2e.js` | Main level-up automation loop |
| `test/specs/arena.e2e.js` | Arena battle automation loop |
| `test/specs/levelup.js` | **Local config** (gitignored) — battle steps and win conditions |
| `test/pageobjects/playing.page.js` | Game controller abstraction (Page Object) |
| `scene-detection/check-level.js` | Screenshot analysis for level-up stat detection |
| `scene-detection/check-arena.js` | Screenshot analysis for arena screen detection |
| `scene-detection/check-hp.js` | Screenshot analysis for HP detection |
| `wdio.conf.js` | WebdriverIO/Appium config (port 4723, emulator-5554, Android 12) |
| `sample-color.json` | Grayscale color palette for level-up UI detection |
| `arena-color.png` | Arena screen reference image for detection |
| `SLPS-03177_0.sav` | Game save file (committed to git on good results) |

## Game UI

### Character

#### Faces

Character face region in screenshots: (450,40) to (666,283)
Saved to `game-logic/characters/faces/<name>.png`

#### Growth

Per-character stat growth data stored in `game-logic/characters/growth/<name>.json`
