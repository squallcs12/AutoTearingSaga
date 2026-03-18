const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { sleep, debugCopyScreenshot } = require('../utils');
const { extractGameArea } = require('../game-logic/identify-character');

const DEVICE = 'localhost:5555';
const PROCESS_NAME = 'HD-Player';

// Game area: 4:3 centered in 1920x1080 landscape → 1440x1080 at x=240

// --- PostMessage key sender (same as desktop/common.js, targeting BlueStacks) ---

const PS_SCRIPT_PATH = path.join(os.tmpdir(), 'bs-keysender.ps1');
fs.writeFileSync(PS_SCRIPT_PATH, `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinApi {
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern uint MapVirtualKey(uint uCode, uint uMapType);
    public delegate bool EnumCallback(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(IntPtr hWndParent, EnumCallback cb, IntPtr lParam);
    [DllImport("user32.dll", CharSet=CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
}
"@

$WM_KEYDOWN    = 0x0100
$WM_KEYUP      = 0x0101
$WM_SETFOCUS   = 0x0007
$WM_ACTIVATE   = 0x0006
$WA_ACTIVE     = 1

$keyMap = @{
    'c'    = 0x43; 'x'    = 0x58; 'z'    = 0x5A; 's'    = 0x53;
    'up'   = 0x26; 'down' = 0x28; 'left' = 0x25; 'right' = 0x27;
    'f1'   = 0x70; 'f2'   = 0x71; 'f3'   = 0x72; 'f4'   = 0x73;
    'f5'   = 0x74; 'f6'   = 0x75; 'f7'   = 0x76; 'f8'   = 0x77;
    'f9'   = 0x78; 'f10'  = 0x79; 'f11'  = 0x7A; 'f12'  = 0x7B;
}

$extendedVKs = @(0x25, 0x26, 0x27, 0x28)

function Get-LParam([uint32]$vk, [bool]$keyUp) {
    $scan = [WinApi]::MapVirtualKey($vk, 0)
    $ext  = if ($extendedVKs -contains $vk) { 0x01000000 } else { 0 }
    if ($keyUp) { return [IntPtr]($ext -bor ($scan -shl 16) -bor 0xC0000001) }
    else        { return [IntPtr]($ext -bor ($scan -shl 16) -bor 1) }
}

function Send-VK($targets, [uint32]$vk, [bool]$shift, [bool]$ctrl) {
    foreach ($h in $targets) {
        # Trick window into thinking it is focused
        [WinApi]::SendMessage($h, $WM_ACTIVATE, [IntPtr]$WA_ACTIVE, [IntPtr]::Zero) | Out-Null
        [WinApi]::SendMessage($h, $WM_SETFOCUS, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
        if ($ctrl) {
            $cs = [WinApi]::MapVirtualKey(0x11, 0)
            [WinApi]::PostMessage($h, $WM_KEYDOWN, [IntPtr]0x11, [IntPtr](($cs -shl 16) -bor 1)) | Out-Null
        }
        if ($shift) {
            $ss = [WinApi]::MapVirtualKey(0x10, 0)
            [WinApi]::PostMessage($h, $WM_KEYDOWN, [IntPtr]0x10, [IntPtr](($ss -shl 16) -bor 1)) | Out-Null
        }
        [WinApi]::PostMessage($h, $WM_KEYDOWN, [IntPtr]$vk, (Get-LParam $vk $false)) | Out-Null
        Start-Sleep -Milliseconds 50
        [WinApi]::PostMessage($h, $WM_KEYUP, [IntPtr]$vk, (Get-LParam $vk $true)) | Out-Null
        if ($shift) {
            $ss = [WinApi]::MapVirtualKey(0x10, 0)
            [WinApi]::PostMessage($h, $WM_KEYUP, [IntPtr]0x10, [IntPtr](($ss -shl 16) -bor 0xC0000001)) | Out-Null
        }
        if ($ctrl) {
            $cs = [WinApi]::MapVirtualKey(0x11, 0)
            [WinApi]::PostMessage($h, $WM_KEYUP, [IntPtr]0x11, [IntPtr](($cs -shl 16) -bor 0xC0000001)) | Out-Null
        }
    }
}

$proc = Get-Process -Name "${PROCESS_NAME}" | Select-Object -First 1
$mainHwnd = $proc.MainWindowHandle

# Collect all target windows: main + all children
$targets = @($mainHwnd)
$cb = [WinApi+EnumCallback]{
    param($h, $l)
    $script:targets += $h
    return $true
}
[WinApi]::EnumChildWindows($mainHwnd, $cb, [IntPtr]::Zero)
Write-Host "[keysender] targets: $($targets -join ', ')"

while ($true) {
    $line = [Console]::ReadLine()
    if ($null -eq $line -or $line -eq 'EXIT') { break }
    $shift = $false
    $ctrl  = $false
    $key   = $line.ToLower().Trim()
    if ($key.StartsWith('ctrl+')) { $ctrl = $true; $key = $key.Substring(5) }
    if ($key.StartsWith('shift+')) { $shift = $true; $key = $key.Substring(6) }
    if ($keyMap.ContainsKey($key)) {
        Send-VK $targets $keyMap[$key] $shift $ctrl
    } else {
        Write-Host "[keysender] unknown key: $key"
    }
}
`.replace('${PROCESS_NAME}', PROCESS_NAME).trim());

let _psProc = null;

function initKeyWorker() {
  _psProc = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT_PATH], {
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  _psProc.on('exit', (code) => {
    console.log(`[sendKey] worker exited (${code})`);
    _psProc = null;
  });
  process.on('exit', () => { try { _psProc?.stdin.write('EXIT\n'); } catch (_) {} });
}

async function sendKey(key) {
  if (!_psProc) initKeyWorker();
  _psProc.stdin.write(key + '\n');
  await sleep(500);
}

// --- adb screenshot ---

async function takeScreenshot(filename) {
  const destPath = path.join('tmp', filename);
  const rawPath = destPath + '.raw.png';
  execSync(`adb -s ${DEVICE} exec-out screencap -p > "${rawPath}"`);
  await (await extractGameArea(rawPath)).toFile(destPath);
  fs.unlinkSync(rawPath);
  debugCopyScreenshot(destPath);
  await sleep(1000);
  return destPath;
}

// --- adb tap/swipe for virtual controller ---

// DuckStation touchscreen controller positions (1920x1080 landscape)
// Analog stick center
const STICK_CENTER = { x: 120, y: 915 };
const STICK_RADIUS = 80; // swipe distance from center

// D-pad directions via analog stick swipe
const DPAD = {
  up:         { x: STICK_CENTER.x,                    y: STICK_CENTER.y - STICK_RADIUS },
  down:       { x: STICK_CENTER.x,                    y: STICK_CENTER.y + STICK_RADIUS },
  left:       { x: STICK_CENTER.x - STICK_RADIUS,     y: STICK_CENTER.y },
  right:      { x: STICK_CENTER.x + STICK_RADIUS,     y: STICK_CENTER.y },
  'up-left':  { x: STICK_CENTER.x - STICK_RADIUS * 0.7, y: STICK_CENTER.y - STICK_RADIUS * 0.7 },
  'up-right': { x: STICK_CENTER.x + STICK_RADIUS * 0.7, y: STICK_CENTER.y - STICK_RADIUS * 0.7 },
  'down-left':  { x: STICK_CENTER.x - STICK_RADIUS * 0.7, y: STICK_CENTER.y + STICK_RADIUS * 0.7 },
  'down-right': { x: STICK_CENTER.x + STICK_RADIUS * 0.7, y: STICK_CENTER.y + STICK_RADIUS * 0.7 },
};

// Button positions
const BUTTONS = {
  circle:   { x: 1895, y: 940 },
  cross:    { x: 1810, y: 1030 },
  square:   { x: 1720, y: 940 },
  triangle: { x: 1810, y: 840 },
};

function adbTap(x, y) {
  execSync(`adb -s ${DEVICE} shell input tap ${Math.round(x)} ${Math.round(y)}`);
}

function adbSwipe(x1, y1, x2, y2, durationMs = 100) {
  execSync(`adb -s ${DEVICE} shell input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${durationMs}`);
}

function adbMove(direction) {
  const target = DPAD[direction];
  if (!target) throw new Error(`Unknown direction: ${direction}`);
  adbSwipe(STICK_CENTER.x, STICK_CENTER.y, target.x, target.y, 150);
}

function adbButton(name) {
  const pos = BUTTONS[name];
  if (!pos) throw new Error(`Unknown button: ${name}`);
  adbTap(pos.x, pos.y);
}

module.exports = { sleep, sendKey, takeScreenshot, adbTap, adbSwipe, adbMove, adbButton, DPAD, BUTTONS };
