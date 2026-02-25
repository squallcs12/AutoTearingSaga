# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an automation tool for the PS1 game **Tear Ring Saga** (SLPS-03177), targeting the DuckStation emulator running on an Android device/emulator. It uses WebdriverIO + Appium to automate controller inputs, capture screenshots, and use image analysis (via `sharp`) to detect level-up screens and evaluate whether stat gains meet desired conditions. The goal is to automate RNG manipulation for optimal level-up stat rolls.

## Commands

```bash
# Install dependencies
yarn install

# Run all tests (uses wdio.conf.js)
yarn wdio

# Run level-up farming automation
yarn level
# or: npx wdio --spec test/specs/levelup.e2e.js

# Run arena automation
yarn arena
# or: npx wdio --spec test/specs/arena.e2e.js

# Run level-up with 4 retries before playing audio
yarn run4

# Sync save file from physical phone to emulator
node sync-phone.js

# Pull save from physical phone to laptop
node pull-phone.js

# Push save from emulator back to phone
node restore-phone.js
```

## Architecture

### Setup Requirements
- Android emulator running at `emulator-5554` (or physical device `R3CN203BDKN`)
- DuckStation app (`com.github.stenzek.duckstation`) installed with the game loaded
- Appium server (started automatically by wdio via `services: ['appium']`) on port 4723
- Save state must be pre-loaded at the correct game point before running automation

### Data Flow

1. **`test/specs/levelup.js`** (gitignored, must be created manually) — exports the run configuration:
   - `forceRandom`: sequence of input steps to trigger RNG manipulation before the fight
   - `fight`: sequence of input steps to navigate to/through the battle
   - `isBoss`: boolean flag for boss vs normal enemy finish timing
   - `goodCondition`: condition object(s) specifying which stat increases are acceptable

2. **`test/specs/levelup.e2e.js` / `arena.e2e.js`** — main test loops that:
   - Reload save state via pause menu
   - Execute input sequences using `PlayingPage.perform()`
   - Wait for level-up screen detection
   - Save to slot 1 if level-up occurs
   - Evaluate whether the stat gains are "good" via `checkLevelUpgrade()`
   - Break loop and play audio notification on success; else repeat indefinitely

3. **`test/pageobjects/playing.page.js`** — `PlayingPage` class wrapping DuckStation UI elements. The `perform(step)` method parses string commands (e.g. `'O'`, `'X'`, `'right'`, `'wait'`, `'save'`, `'wait-level-up'`). Supports optional count prefix: `'O 3'` presses O three times.

4. **`check-level.js`** — image analysis logic:
   - `checkIsLevelUp()`: detects level-up panel by greyscale pixel matching against `sample-color.json`
   - `findTotalStatIncrease()`: scans 9 stat regions for green pixel indicators of stat gains
   - `checkGoodCondition()`: evaluates stat gains against `goodCondition` (supports array of OR conditions; `count` for total stats gained; `1` = must have, `-1` = must not have)
   - On success + `syncGithub=true`: auto-pulls save file via adb and git commits/pushes

5. **`check-arena.js`** — detects the arena confirmation screen by comparing pixel colors against `arena-color.json` reference data (98% similarity threshold).

### Configuration Files
- **`wdio.conf.js`**: Target device is `emulator-5554`, Android 12, DuckStation package. Jasmine framework with 60s default timeout.
- **`sample-color.json`**: Reference greyscale pixel values for level-up screen detection.
- **`arena-color.json`**: Reference pixel color array for arena confirmation screen detection.
- **`SLPS-03177_0.sav`**: The committed save state file, synced via git when a good level-up is found.

### The Missing `test/specs/levelup.js` File
This file is gitignored and must be created per-session. It configures what the automation does:
```js
const forceRandom = `up\ndown\n...`; // input sequence for RNG manipulation
const fight = `O\nO\n...`;           // input sequence through battle menus
const isBoss = false;                 // true for boss fights (longer finish wait)
const goodCondition = { count: 3, 1: 1, 3: 1 }; // e.g. need strength+speed + 1 more
// or array: [{ count: 3, 1: 1 }, { count: 4 }]
const syncGithub = false;             // set true to auto-commit save on success
module.exports = { forceRandom, fight, isBoss, goodCondition, syncGithub };
```
