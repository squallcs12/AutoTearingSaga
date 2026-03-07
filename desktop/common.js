const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { sleep } = require('../utils');

const SCREENSHOT_DIR = 'C:\\Users\\daotr\\AppData\\Local\\DuckStation\\screenshots';
const PROCESS_NAME = 'duckstation-qt-x64-ReleaseLTCG';

const PS_SCRIPT_PATH = path.join(os.tmpdir(), 'ds-keysender.ps1');
fs.writeFileSync(PS_SCRIPT_PATH, `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinApi {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern uint MapVirtualKey(uint uCode, uint uMapType);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();
}
"@

$KEYEVENTF_KEYUP       = 0x0002
$KEYEVENTF_EXTENDEDKEY = 0x0001
$VK_MENU  = 0x12
$VK_SHIFT = 0x10
$SW_SHOW  = 5

$keyMap = @{
    'c'    = 0x43; 'x'    = 0x58; 'z'    = 0x5A; 's'    = 0x53;
    'up'   = 0x26; 'down' = 0x28; 'left' = 0x25; 'right' = 0x27;
    'f1'   = 0x70; 'f2'   = 0x71; 'f3'   = 0x72; 'f4'   = 0x73;
    'f5'   = 0x74; 'f6'   = 0x75; 'f7'   = 0x76; 'f8'   = 0x77;
    'f9'   = 0x78; 'f10'  = 0x79; 'f11'  = 0x7A; 'f12'  = 0x7B;
}

$extendedVKs = @(0x25, 0x26, 0x27, 0x28)

function Focus-Window($hwnd) {
    $fgHwnd = [WinApi]::GetForegroundWindow()
    if ($fgHwnd -eq $hwnd) { return }
    $fgPid = 0; $tgtPid = 0
    $fgTid  = [WinApi]::GetWindowThreadProcessId($fgHwnd, [ref]$fgPid)
    $tgtTid = [WinApi]::GetWindowThreadProcessId($hwnd, [ref]$tgtPid)
    $ourTid = [WinApi]::GetCurrentThreadId()
    [WinApi]::AttachThreadInput($ourTid, $fgTid, $true)  | Out-Null
    [WinApi]::AttachThreadInput($ourTid, $tgtTid, $true)  | Out-Null
    [WinApi]::keybd_event($VK_MENU, 0, 0, [UIntPtr]::Zero)
    [WinApi]::keybd_event($VK_MENU, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
    [WinApi]::ShowWindow($hwnd, $SW_SHOW)  | Out-Null
    [WinApi]::SetForegroundWindow($hwnd)   | Out-Null
    [WinApi]::AttachThreadInput($ourTid, $fgTid, $false)  | Out-Null
    [WinApi]::AttachThreadInput($ourTid, $tgtTid, $false) | Out-Null
    Start-Sleep -Milliseconds 50
}

function Send-VK($hwnd, [uint32]$vk, [bool]$shift) {
    Focus-Window $hwnd
    $scan  = [WinApi]::MapVirtualKey($vk, 0)
    $flags = if ($extendedVKs -contains $vk) { $KEYEVENTF_EXTENDEDKEY } else { 0 }
    if ($shift) {
        $ss = [WinApi]::MapVirtualKey($VK_SHIFT, 0)
        [WinApi]::keybd_event($VK_SHIFT, $ss, 0, [UIntPtr]::Zero)
    }
    [WinApi]::keybd_event($vk, $scan, $flags, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 50
    [WinApi]::keybd_event($vk, $scan, ($flags -bor $KEYEVENTF_KEYUP), [UIntPtr]::Zero)
    if ($shift) {
        $ss = [WinApi]::MapVirtualKey($VK_SHIFT, 0)
        [WinApi]::keybd_event($VK_SHIFT, $ss, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
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

function sendKey(key) {
  if (!_psProc) initKeyWorker();
  _psProc.stdin.write(key + '\n');
}

async function takeScreenshot(filename) {
  const destPath = path.join('tmp', filename);
  const before = new Set(fs.readdirSync(SCREENSHOT_DIR));
  console.log(`[screenshot] dir=${SCREENSHOT_DIR} before=${before.size} files`);
  sendKey('f10');
  for (let i = 0; i < 300; i++) {
    await sleep(100);
    const files = fs.readdirSync(SCREENSHOT_DIR);
    const newFile = files.find(f => !before.has(f) && (f.endsWith('.png') || f.endsWith('.jpg')));
    if (i === 0) console.log(`[screenshot] after f10: dir has ${files.length} files, new=${newFile}`);
    if (newFile) {
      const fullPath = path.join(SCREENSHOT_DIR, newFile);
      // Wait until DuckStation finishes writing the file
      let prevSize = -1;
      for (let j = 0; j < 20; j++) {
        await sleep(100);
        const size = fs.statSync(fullPath).size;
        if (size > 0 && size === prevSize) break;
        prevSize = size;
      }
      console.log(`[screenshot] found ${newFile} after ${i * 100}ms`);
      fs.copyFileSync(fullPath, destPath);
      fs.unlinkSync(fullPath);
      return;
    }
  }
  const files = fs.readdirSync(SCREENSHOT_DIR);
  console.log(`[screenshot] timeout. dir contents: ${files.join(', ')}`);
  throw new Error('[takeScreenshot] No new file appeared after F10');
}

module.exports = { sleep, sendKey, takeScreenshot };
