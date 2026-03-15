const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getCharacters: () => ipcRenderer.invoke('get-characters'),
  getGoodCondition: (opts) => ipcRenderer.invoke('get-good-condition', opts),
  renameCharacter: (opts) => ipcRenderer.invoke('rename-character', opts),
  runCommand: (config) => ipcRenderer.invoke('run-command', config),
  stopCommand: () => ipcRenderer.invoke('stop-command'),
  startAvd: () => ipcRenderer.invoke('start-avd'),
  syncCommand: (direction) => ipcRenderer.invoke('sync-command', direction),
  commitSave: (opts) => ipcRenderer.invoke('commit-save', opts),
  getLastRandom: () => ipcRenderer.invoke('get-last-random'),
  onAvdReady: (callback) => ipcRenderer.on('avd-ready', () => callback()),
  onOutput: (callback) => ipcRenderer.on('command-output', (_, data) => callback(data)),
  onDone: (callback) => ipcRenderer.on('command-done', (_, code) => callback(code))
})
