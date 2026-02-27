# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

AutoTearingSaga is a game automation tool that farms stat upgrades in a PS1 game (SLPS-03177) running inside the DuckStation emulator on an Android emulator. It uses WebdriverIO + Appium to control the emulator, takes screenshots, and uses image analysis (via `sharp`) to detect level-up results and evaluate whether the stat increases meet a user-defined goal. When a good result is found, it auto-commits the save file to git.

## Running the Automation

```bash
npm run level    # Run level-up farming once (plays happy/sad audio on result)
npm run arena    # Run arena battle farming once
npm run run4     # Run level-up farming up to 4 times until success
npm run wdio     # Run all test specs
```

Run a single spec directly:
```bash
npx wdio --spec test/specs/levelup.e2e.js
npx wdio --spec test/specs/arena.e2e.js
```

## Prerequisites

Before running, ensure:
1. Android emulator is running at `emulator-5554` (Android 12)
2. DuckStation app (`com.github.stenzek.duckstation`) is installed and the game loaded
3. Appium server is accessible on `localhost:4723`
4. `test/specs/levelup.js` exists (it is gitignored — must be created locally)

## Local Config File (gitignored)

`test/specs/levelup.js` must be created manually and exports:
- `forceRandom` — string of movement steps for random positioning before battle
- `fight` — string of battle action steps
- `isBoss` — boolean, whether the enemy is a boss (longer finish wait)
- `goodCondition` — object or array of objects defining required stat increases
- `syncGithub` — boolean, whether to auto-commit+push the save file on success

## Architecture

### Core Loop (`test/specs/levelup.e2e.js`)

The main loop:
1. Reload from save state (`PlayingPage.reload()`)
2. Execute steps from `forceRandom` + `fight` via `PlayingPage.perform(step)`
3. Wait for level-up screen (`wait-level-up`)
4. Save to slot 1
5. Analyze screenshots to check if stat increases meet `goodCondition`
6. If good: break and optionally commit save; otherwise repeat

### Step DSL (`test/pageobjects/playing.page.js`)

`PlayingPage.perform(step)` parses string commands like:
- Movement: `up`, `down`, `left`, `right`, `up-left`, `up-right`, `down-left`, `down-right`
- Buttons: `O`, `X`, `2O` (double O), `square`, `triangle`
- Actions: `confirm` (spam O), `save`, `save1`, `finish`, `boss`, `wait`, `pic`, `wait-level-up`
- Steps can include a repeat count: `"down 3"` moves down 3 times

### Level-Up Detection (`check-level.js`)

1. Takes 7 screenshots during the level-up screen
2. Crops the level-up panel region (pixels `[140,227]` to `[920,657]`)
3. Converts to grayscale, matches pixel colors against `sample-color.json` palette — if ≥50% match, it's a level-up screen
4. Scans specific pixel regions for green pixels (RGB thresholds) to detect which of 9 stats increased
5. Stats 1–5 are in the left column (starting at x=420), stats 6–9 in the right column (x=700)
6. Evaluates result against `goodCondition`: `count` sets minimum total increases; individual stat keys use `1` (must increase) or `-1` (must NOT increase)

### Arena Detection (`check-arena.js`)

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
| `check-level.js` | Screenshot analysis for level-up stat detection |
| `check-arena.js` | Screenshot analysis for arena screen detection |
| `wdio.conf.js` | WebdriverIO/Appium config (port 4723, emulator-5554, Android 12) |
| `sample-color.json` | Grayscale color palette for level-up UI detection |
| `arena-color.png` | Arena screen reference image for detection |
| `SLPS-03177_0.sav` | Game save file (committed to git on good results) |