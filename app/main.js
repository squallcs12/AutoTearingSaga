const { app, BrowserWindow, ipcMain } = require('electron/main')
const path = require('node:path')
const { spawn } = require('node:child_process')
const fs = require('node:fs')

let runningProcess = null
const PROJECT_ROOT = path.join(__dirname, '..')

const createWindow = () => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  win.loadFile(path.join(__dirname, 'index.html'))
}

app.whenReady().then(() => {
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
    const env = { ...process.env }

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
      if (mode === 'level' && options.random) {
        args.push('--random', options.random)
      }
    } else {
      const script = mode === 'level' ? 'desktop/levelup.js' : 'desktop/arena.js'
      args.push(script)
    }

    runningProcess = spawn('node', args, {
      cwd: PROJECT_ROOT,
      shell: true,
      env,
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

  ipcMain.handle('stop-command', () => {
    if (runningProcess) {
      runningProcess.kill()
      runningProcess = null
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
