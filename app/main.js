const { app, BrowserWindow, ipcMain, screen } = require('electron/main')

app.setAppUserModelId('com.autotearingsaga.app')
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
    icon: path.join(__dirname, 'icon.png'),
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

  ipcMain.handle('rename-character', (_, { oldName, newName }) => {
    const growthDir = path.join(PROJECT_ROOT, 'game-logic', 'characters', 'growth')
    const facesDir = path.join(PROJECT_ROOT, 'game-logic', 'characters', 'faces')
    const oldGrowth = path.join(growthDir, `${oldName}.json`)
    const newGrowth = path.join(growthDir, `${newName}.json`)
    const oldFace = path.join(facesDir, `${oldName}.png`)
    const newFace = path.join(facesDir, `${newName}.png`)
    try {
      if (fs.existsSync(oldGrowth)) {
        const data = JSON.parse(fs.readFileSync(oldGrowth, 'utf8'))
        data.name = newName.charAt(0).toUpperCase() + newName.slice(1)
        fs.writeFileSync(newGrowth, JSON.stringify(data, null, 2) + '\n')
        fs.unlinkSync(oldGrowth)
      }
      if (fs.existsSync(oldFace)) fs.renameSync(oldFace, newFace)
      return { success: true }
    } catch (e) {
      return { error: e.message }
    }
  })

  ipcMain.handle('get-characters', () => {
    const growthDir = path.join(PROJECT_ROOT, 'game-logic', 'characters', 'growth')
    return fs.readdirSync(growthDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort()
  })

  ipcMain.handle('get-good-condition', (_, { character, tier }) => {
    try {
      const oldTier = process.env.TIER_OVERRIDE
      if (tier) process.env.TIER_OVERRIDE = tier
      else delete process.env.TIER_OVERRIDE
      // Clear require cache so tier override takes effect
      const modPath = require.resolve(path.join(PROJECT_ROOT, 'game-logic', 'characters', 'good-condition'))
      delete require.cache[modPath]
      const growthPath = require.resolve(path.join(PROJECT_ROOT, 'game-logic', 'characters', 'growth', `${character}.json`))
      delete require.cache[growthPath]
      const { getGoodCondition } = require(modPath)
      const result = getGoodCondition(character)
      // Restore
      if (oldTier) process.env.TIER_OVERRIDE = oldTier
      else delete process.env.TIER_OVERRIDE
      return result
    } catch {
      return null
    }
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
    if (options.tier && options.tier !== 'auto') env.TIER_OVERRIDE = options.tier
    if (options.random) env.RANDOM_OVERRIDE = options.random
    if (options.fight) env.FIGHT_OVERRIDE = options.fight
    if (options.isBoss) env.IS_BOSS = '1'
    if (options.levelsToGain) env.LEVELS_TO_GAIN = String(options.levelsToGain)

    if (platform === 'phone') env.TARGET_DEVICE = 'phone'

    if (platform === 'android' || platform === 'phone') {
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
    } else {
      const script = mode === 'level' ? 'desktop/levelup.js' : 'desktop/arena.js'
      args.push(script)
    }

    // Log the command so the user can reproduce it manually
    const envPrefix = ['CHAR_NAME', 'SKIP_COUNT', 'TIER_OVERRIDE', 'RANDOM_OVERRIDE', 'FIGHT_OVERRIDE', 'IS_BOSS', 'LEVELS_TO_GAIN', 'TARGET_DEVICE']
      .filter(k => env[k]).map(k => `${k}=${env[k]}`).join(' ')
    const cmdLine = `${envPrefix ? envPrefix + ' ' : ''}node ${args.join(' ')}`
    const win2 = BrowserWindow.fromWebContents(event.sender)
    if (win2) win2.webContents.send('command-output', `> ${cmdLine}\n`)

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

    // Check if an emulator is already connected (booted or still booting)
    let emulatorConnected = false
    try {
      const devices = execSync('adb devices', { encoding: 'utf8', timeout: 5000 })
      emulatorConnected = /emulator-\d+\s+(device|offline)/.test(devices)
    } catch {}

    if (emulatorConnected) {
      // Already running — check if fully booted
      try {
        const result = execSync('adb shell getprop sys.boot_completed', { encoding: 'utf8', timeout: 5000 }).trim()
        if (result === '1') {
          win.webContents.send('avd-ready')
          bringEmulatorBeside(win, { activate: true })
          return { started: true, alreadyRunning: true }
        }
      } catch {}
      // Still booting — skip spawn, just poll below
      win.webContents.send('command-output', 'Emulator already running, waiting for boot...\n')
    }

    if (!emulatorConnected) {
      const avd = spawn('emulator', ['-avd', 'Medium_Phone'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
      avd.stdout.on('data', (data) => win.webContents.send('command-output', data.toString()))
      avd.stderr.on('data', (data) => win.webContents.send('command-output', data.toString()))
      avd.unref()
    }

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
    const args = [script]
    if (target) args.push(target)
    runningProcess = spawn('node', args, {
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

  ipcMain.handle('commit-save', (event, { message }) => {
    if (runningProcess) return { error: 'A command is already running' }
    const win = BrowserWindow.fromWebContents(event.sender)
    const addProc = spawn('git', ['add', 'SLPS-03177_0.sav'], { cwd: PROJECT_ROOT })
    addProc.on('close', (addCode) => {
      if (addCode !== 0) { win.webContents.send('command-done', addCode); return }
      runningProcess = spawn('git', ['commit', '-m', message], { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
      runningProcess.stdout.on('data', (data) => win.webContents.send('command-output', data.toString()))
      runningProcess.stderr.on('data', (data) => win.webContents.send('command-output', data.toString()))
      runningProcess.on('close', (code) => { runningProcess = null; win.webContents.send('command-done', code) })
    })
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
