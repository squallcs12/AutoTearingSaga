const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');

const { sleep } = require('../utils');

const DEVICE = 'emulator-5554';
const PROCESS_NAME = 'HD-Player';

// Game area: 4:3 centered in 1920x1080 landscape → 1440x1080 at x=240
const GAME_AREA = { left: 240, top: 0, width: 1440, height: 1080 };

// --- PostMessage key sender (same as desktop/common.js, targeting BlueStacks) ---

const PS_SCRIPT_PATH = path.join(os.tmpdir(), 'bs-keysender.ps1');
fs.writeFileSync(PS_SCRIPT_PATH, `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinApi {
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern uint MapVirtualKey(uint uCode, uint uMapType);
}
"@

$WM_KEYDOWN = 0x0100
$WM_KEYUP   = 0x0101

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

function Send-VK($hwnd, [uint32]$vk, [bool]$shift) {
    if ($shift) {
        $ss = [WinApi]::MapVirtualKey(0x10, 0)
        [WinApi]::PostMessage($hwnd, $WM_KEYDOWN, [IntPtr]0x10, [IntPtr](($ss -shl 16) -bor 1)) | Out-Null
    }
    [WinApi]::PostMessage($hwnd, $WM_KEYDOWN, [IntPtr]$vk, (Get-LParam $vk $false)) | Out-Null
    Start-Sleep -Milliseconds 50
    [WinApi]::PostMessage($hwnd, $WM_KEYUP, [IntPtr]$vk, (Get-LParam $vk $true)) | Out-Null
    if ($shift) {
        $ss = [WinApi]::MapVirtualKey(0x10, 0)
        [WinApi]::PostMessage($hwnd, $WM_KEYUP, [IntPtr]0x10, [IntPtr](($ss -shl 16) -bor 0xC0000001)) | Out-Null
    }
}

$proc = Get-Process -Name "${PROCESS_NAME}" | Select-Object -First 1
$hwnd = $proc.MainWindowHandle
Write-Host "[keysender] hwnd=$hwnd"

while ($true) {
    $line = [Console]::ReadLine()
    if ($null -eq $line -or $line -eq 'EXIT') { break }
    $shift = $false
    $key   = $line.ToLower().Trim()
    if ($key.StartsWith('shift+')) { $shift = $true; $key = $key.Substring(6) }
    if ($keyMap.ContainsKey($key)) {
        Send-VK $hwnd $keyMap[$key] $shift
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
  // Crop to game area (4:3) so check-level.js coordinates work correctly
  await sharp(rawPath)
    .extract(GAME_AREA)
    .toFile(destPath);
  fs.unlinkSync(rawPath);
}

module.exports = { sleep, sendKey, takeScreenshot };
