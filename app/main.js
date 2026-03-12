const { app, BrowserWindow, ipcMain, screen } = require('electron/main')
const path = require('node:path')
const { spawn, execSync } = require('node:child_process')
const fs = require('node:fs')

// Move the emulator window next to the app window
function bringEmulatorBeside(win, { activate = false } = {}) {
  const [appX, appY] = win.getPosition()
  const [appW] = win.getSize()
  const targetX = appX + appW - (process.platform === 'win32' ? 8 : 0)  // -8 compensates for Windows invisible border shadow
  const targetY = appY

  if (process.platform === 'win32') {
    const fgLine = activate ? `[Win32]::SetForegroundWindow($h)` : ''
    const ps = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int h2, uint f);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@
Get-Process | Where-Object { $_.MainWindowTitle -match 'Android Emulator' } | ForEach-Object {
  $h = $_.MainWindowHandle
  if ($h -ne [IntPtr]::Zero) {
    [Win32]::SetWindowPos($h, [IntPtr]::Zero, ${targetX}, ${targetY}, 0, 0, 0x0001 -bor 0x0004)
    ${fgLine}
  }
}
`.trim()
    spawn('powershell', ['-NoProfile', '-Command', ps], { shell: false, stdio: 'ignore' }).unref()
  } else if (process.platform === 'linux') {
    // wmctrl uses physical X11 pixels; Electron reports logical pixels — scale accordingly
    const sf = screen.getDisplayMatching(win.getBounds()).scaleFactor
    const px = Math.round(targetX * sf)
    const py = Math.round(targetY * sf)
    spawn('wmctrl', ['-r', 'Android Emulator', '-e', `0,${px},${py},-1,-1`], { stdio: 'ignore' }).unref()
    if (activate) {
      spawn('wmctrl', ['-a', 'Android Emulator'], { stdio: 'ignore' }).unref()
    }
  }
}

let runningProcess = null
const PROJECT_ROOT = path.join(__dirname, '..')
const BOUNDS_FILE = path.join(__dirname, '.window-bounds.json')
const LAST_RANDOM_FILE = path.join(__dirname, '.last-random.json')

function loadLastRandom() {
  try { return JSON.parse(fs.readFileSync(LAST_RANDOM_FILE, 'utf8')) } catch { return null }
}

function loadBounds() {
  try { return JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf8')) } catch { return null }
}

function saveBounds(win) {
  if (win.isMinimized() || win.isMaximized()) return
  fs.writeFileSync(BOUNDS_FILE, JSON.stringify(win.getBounds()))
}

const createWindow = () => {
  const saved = loadBounds()
  const win = new BrowserWindow({
    width: saved?.width || 900,
    height: saved?.height || 930,
    x: saved?.x,
    y: saved?.y,
    minWidth: 360,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  win.loadFile(path.join(__dirname, 'index.html'))

  win.once('ready-to-show', () => bringEmulatorBeside(win, { activate: true }))

  let wasBlurred = false
  win.on('blur', () => { wasBlurred = true })
  win.on('focus', () => {
    if (wasBlurred) {
      wasBlurred = false
      bringEmulatorBeside(win)
    }
  })
  win.on('moved', () => { saveBounds(win); bringEmulatorBeside(win) })
  win.on('resized', () => saveBounds(win))
  win.on('close', () => saveBounds(win))
}

app.whenReady().then(() => {
  ipcMain.handle('get-last-random', () => loadLastRandom()?.value || null)

  ipcMain.handle('get-characters', () => {
    const growthDir = path.join(PROJECT_ROOT, 'game-logic', 'characters', 'growth')
    return fs.readdirSync(growthDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort()
  })

  ipcMain.handle('run-command', (event, { mode, platform, options }) => {
    if (runningProcess) {
      return { error: 'A command is already running' }
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    const args = []
    // Strip yarn/npm config env vars to avoid "Unknown env config" warnings in child processes
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('npm_config_')))

    // Common env vars (work for both android and desktop via game-logic/shared)
    if (options.name) env.CHAR_NAME = options.name
    if (options.skip > 0) env.SKIP_COUNT = String(options.skip)
    if (options.fixedTier) env.NO_FALLBACK = '1'
    if (options.tier && options.tier !== 'auto') env.TIER_OVERRIDE = options.tier
    if (options.random) env.RANDOM_OVERRIDE = options.random

    if (platform === 'android') {
      const script = mode === 'level' ? 'scripts/level.js' : 'scripts/arena.js'
      args.push(script)
      args.push('-v') // always verbose to stream output

      if (options.tier && options.tier !== 'auto') {
        args.push(options.tier)
      }
      if (options.retries) {
        args.push(String(options.retries))
      }
      if (options.name) {
        args.push('-name', options.name)
      }
      if (options.skip > 0) {
        args.push('--skip', String(options.skip))
      }
      if (options.fixedTier) {
        args.push('--fixed-tier')
      }
    } else {
      const script = mode === 'level' ? 'desktop/levelup.js' : 'desktop/arena.js'
      args.push(script)
    }

    runningProcess = spawn('node', args, {
      cwd: PROJECT_ROOT,
      shell: true,
      env,
      // detached creates a new process group on Linux so we can kill the whole tree
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    })

    runningProcess.stdout.on('data', (data) => {
      win.webContents.send('command-output', data.toString())
    })

    runningProcess.stderr.on('data', (data) => {
      win.webContents.send('command-output', data.toString())
    })

    runningProcess.on('close', (code) => {
      runningProcess = null
      win.webContents.send('command-done', code)
    })

    return { started: true }
  })

  ipcMain.handle('start-avd', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    // Check if AVD is already running
    try {
      const result = execSync('adb shell getprop sys.boot_completed', { encoding: 'utf8', timeout: 5000 }).trim()
      if (result === '1') {
        win.webContents.send('avd-ready')
        bringEmulatorBeside(win, { activate: true })
        return { started: true, alreadyRunning: true }
      }
    } catch {}

    const avd = spawn('emulator', ['-avd', 'Medium_Phone'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    avd.stdout.on('data', (data) => win.webContents.send('command-output', data.toString()))
    avd.stderr.on('data', (data) => win.webContents.send('command-output', data.toString()))
    avd.unref()

    // Poll for boot completion
    const poll = setInterval(() => {
      try {
        const result = execSync('adb shell getprop sys.boot_completed', { encoding: 'utf8', timeout: 5000 }).trim()
        if (result === '1') {
          clearInterval(poll)
          win.webContents.send('avd-ready')
          bringEmulatorBeside(win, { activate: true })
        }
      } catch {}
    }, 3000)

    // Timeout after 120s
    setTimeout(() => clearInterval(poll), 120000)

    return { started: true }
  })

  ipcMain.handle('sync-command', (event, { direction, target }) => {
    if (runningProcess) return { error: 'A command is already running' }
    const win = BrowserWindow.fromWebContents(event.sender)
    const script = direction === 'pull' ? 'scripts/pull.js' : 'scripts/push.js'
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('npm_config_')))
    if (target === 'phone') env.TARGET_DEVICE = 'phone'
    runningProcess = spawn('node', [script], {
      cwd: PROJECT_ROOT,
      shell: true,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    runningProcess.stdout.on('data', (data) => win.webContents.send('command-output', data.toString()))
    runningProcess.stderr.on('data', (data) => win.webContents.send('command-output', data.toString()))
    runningProcess.on('close', (code) => { runningProcess = null; win.webContents.send('command-done', code) })
    return { started: true }
  })

  ipcMain.handle('stop-command', () => {
    if (runningProcess) {
      const pid = runningProcess.pid
      runningProcess = null
      if (process.platform === 'win32') {
        // Kill entire process tree on Windows (shell: true spawns cmd which spawns node)
        spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { shell: true })
      } else {
        // Negative PID kills the entire process group (shell + node child)
        try { process.kill(-pid, 'SIGKILL') } catch { process.kill(pid, 'SIGKILL') }
      }
      return { stopped: true }
    }
    return { error: 'No command running' }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
