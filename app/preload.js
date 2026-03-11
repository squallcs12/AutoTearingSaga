const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getCharacters: () => ipcRenderer.invoke('get-characters'),
  runCommand: (config) => ipcRenderer.invoke('run-command', config),
  stopCommand: () => ipcRenderer.invoke('stop-command'),
  startAvd: () => ipcRenderer.invoke('start-avd'),
  getLastRandom: () => ipcRenderer.invoke('get-last-random'),
  onAvdReady: (callback) => ipcRenderer.on('avd-ready', () => callback()),
  onOutput: (callback) => ipcRenderer.on('command-output', (_, data) => callback(data)),
  onDone: (callback) => ipcRenderer.on('command-done', (_, code) => callback(code))
})
