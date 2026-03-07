# Platform Compatibility Notes

## wdio.conf.js — Appium IPv4/IPv6 mismatch (Windows vs Linux)

**Status:** Resolved via OS detection in `wdio.conf.js` (as of 2026-03-06)

### The Problem

On **Windows**, this config worked:
```js
hostname: '127.0.0.1',
services: [['appium', { args: { address: '::1' } }]],
```

On **Linux**, it fails — connection refused when WebdriverIO tries to reach Appium.

### Root Cause

Windows has dual-stack socket support: connecting to `127.0.0.1` (IPv4) transparently reaches a server listening on `::1` (IPv6). Linux does **not** — they are strictly separate interfaces. Appium listening on `::1` cannot be reached via `127.0.0.1` on Linux.

### Current Fix (Linux)

```js
// hostname: '127.0.0.1',   (commented out — use default)
services: ['appium'],        // no address: '::1' — use Appium default (0.0.0.0)
```

### Fix Applied

`wdio.conf.js` now uses `process.platform === 'win32'` to switch config:
- **Windows**: `hostname: '127.0.0.1'` + `services: [['appium', { args: { address: '::1' } }]]`
- **Linux/other**: no hostname override + `services: ['appium']`