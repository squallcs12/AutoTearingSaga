// Electron doesn't support window.prompt()/alert(), use <dialog> instead
function showInputDialog(message, defaultValue = '') {
  return new Promise(resolve => {
    const dialog = document.getElementById('input-dialog')
    const msg = document.getElementById('input-dialog-msg')
    const input = document.getElementById('input-dialog-input')
    const btnOk = document.getElementById('input-dialog-ok')
    const btnCancel = document.getElementById('input-dialog-cancel')
    msg.textContent = message
    input.value = defaultValue
    dialog.showModal()
    input.focus()
    input.select()
    function cleanup(value) {
      btnOk.removeEventListener('click', onOk)
      btnCancel.removeEventListener('click', onCancel)
      input.removeEventListener('keydown', onKey)
      dialog.close()
      resolve(value)
    }
    function onOk() { cleanup(input.value.trim()) }
    function onCancel() { cleanup(null) }
    function onKey(e) {
      if (e.key === 'Enter') onOk()
      if (e.key === 'Escape') onCancel()
    }
    btnOk.addEventListener('click', onOk)
    btnCancel.addEventListener('click', onCancel)
    input.addEventListener('keydown', onKey)
  })
}

function showAlert(message) {
  const dialog = document.getElementById('input-dialog')
  const msg = document.getElementById('input-dialog-msg')
  const input = document.getElementById('input-dialog-input')
  const btnOk = document.getElementById('input-dialog-ok')
  const btnCancel = document.getElementById('input-dialog-cancel')
  msg.textContent = message
  input.style.display = 'none'
  btnCancel.style.display = 'none'
  dialog.showModal()
  btnOk.onclick = () => { dialog.close(); input.style.display = ''; btnCancel.style.display = '' }
}

const output = document.getElementById('output')
const summary = document.getElementById('summary')
const tabLog = document.getElementById('tab-log')
const tabSummary = document.getElementById('tab-summary')

tabLog.addEventListener('click', () => {
  tabLog.classList.add('active')
  tabSummary.classList.remove('active')
  output.style.display = ''
  summary.style.display = 'none'
})
tabSummary.addEventListener('click', () => {
  tabSummary.classList.add('active')
  tabLog.classList.remove('active')
  output.style.display = 'none'
  summary.style.display = 'flex'
})

function addSummaryRow(turnLabel, count, stats) {
  const row = document.createElement('div')
  row.className = 'summary-row'
  row.innerHTML = `<span class="summary-turn">${turnLabel}</span><span class="summary-count">${count}</span><span class="summary-stats">${stats.join(' ')}</span>`
  summary.appendChild(row)
  summary.scrollTop = summary.scrollHeight
}

const randomInput = document.getElementById('random')
const randomSuggestion = document.getElementById('random-suggestion')
const randomSuggestionValue = document.getElementById('random-suggestion-value')

function showRandomSuggestion(value) {
  randomSuggestionValue.textContent = value
  randomSuggestion.classList.remove('hidden')
}

randomSuggestion.addEventListener('click', () => {
  randomInput.value = randomSuggestionValue.textContent
})

document.getElementById('btn-clear-random').addEventListener('click', () => { randomInput.value = '' })
document.getElementById('btn-clear-fight').addEventListener('click', () => { document.getElementById('fight').value = '' })
document.getElementById('btn-clear-select').addEventListener('click', () => { selectStepsInput.value = '' })

document.getElementById('random-pad').addEventListener('click', (e) => {
  const btn = e.target.closest('.pad-btn')
  if (!btn) return
  const step = btn.dataset.step
  randomInput.value = randomInput.value ? randomInput.value.trimEnd() + ',' + step : step
})

const fightInput = document.getElementById('fight')
document.getElementById('fight-pad').addEventListener('click', (e) => {
  const btn = e.target.closest('.pad-btn')
  if (!btn) return
  const step = btn.dataset.step
  fightInput.value = fightInput.value ? fightInput.value.trimEnd() + ',' + step : step
  fightInput.scrollTop = fightInput.scrollHeight
})

const selectStepsInput = document.getElementById('select-steps')
document.getElementById('select-pad').addEventListener('click', (e) => {
  const btn = e.target.closest('.pad-btn')
  if (!btn) return
  const step = btn.dataset.step
  selectStepsInput.value = selectStepsInput.value ? selectStepsInput.value.trimEnd() + ',' + step : step
})

window.api.getLastRandom().then(value => {
  if (value) showRandomSuggestion(value)
})

function collectOptions() {
  return {
    mode: document.querySelector('input[name="mode"]:checked').value,
    platform: document.querySelector('input[name="platform"]:checked').value,
    tier: document.querySelector('input[name="tier"]:checked').value,
    name: document.getElementById('char-name').value || null,
    retries: document.getElementById('retries').value,
    skip: document.getElementById('skip').value,

    emulatorSpeed: document.getElementById('emulator-speed').value,
    random: document.getElementById('random').value,
    fight: document.getElementById('fight').value,
    selectSteps: document.getElementById('select-steps').value,
    isBoss: document.getElementById('is-boss').checked,
    debug: document.getElementById('debug-mode').checked,
    levelsToGain: document.getElementById('levels-to-gain').value,
  }
}

function applyOptions(o) {
  if (!o) return
  if (o.mode) document.querySelector(`input[name="mode"][value="${o.mode}"]`)?.click()
  if (o.platform) document.querySelector(`input[name="platform"][value="${o.platform}"]`)?.click()
  if (o.tier) document.querySelector(`input[name="tier"][value="${o.tier}"]`)?.click()
  if (o.name) document.getElementById('char-name').value = o.name
  if (o.retries) document.getElementById('retries').value = o.retries
  if (o.skip) document.getElementById('skip').value = o.skip

  if (o.emulatorSpeed) document.getElementById('emulator-speed').value = o.emulatorSpeed
  if (o.random) document.getElementById('random').value = o.random
  if (o.fight) document.getElementById('fight').value = o.fight
  if (o.selectSteps) document.getElementById('select-steps').value = o.selectSteps
  document.getElementById('is-boss').checked = !!o.isBoss
  document.getElementById('debug-mode').checked = !!o.debug
  if (o.levelsToGain) document.getElementById('levels-to-gain').value = o.levelsToGain
}

window.api.getLastOptions().then(applyOptions)

const status = document.getElementById('status')
const btnRun = document.getElementById('btn-run')
const btnStop = document.getElementById('btn-stop')
const btnPullEmu = document.getElementById('btn-pull-emu')
const btnPushEmu = document.getElementById('btn-push-emu')
const btnPullPhone = document.getElementById('btn-pull-phone')
const btnPushPhone = document.getElementById('btn-push-phone')
const syncBtns = [btnPullEmu, btnPushEmu, btnPullPhone, btnPushPhone]
const outputDot = document.getElementById('output-dot')
const infoChar = document.getElementById('info-char')
const infoTier = document.getElementById('info-tier')
const infoCondition = document.getElementById('info-condition')
let summaryTargetCount = 5 // default, updated when goodCondition is parsed

function formatCondition(conditions) {
  return conditions.map(c => {
    const parts = [`≥${c.count}`]
    for (const [k, v] of Object.entries(c)) {
      if (k === 'count') continue
      if (v === 1) parts.push(`+${k}`)
      else if (v === -1) parts.push(`-${k}`)
    }
    return parts.join(' ')
  }).join('  |  ')
}

// Populate character dropdown
const charSelect = document.getElementById('char-name')

function populateCharacters() {
  return window.api.getCharacters().then(chars => {
    const current = charSelect.value
    while (charSelect.options.length > 1) charSelect.remove(1)
    for (const name of chars) {
      const opt = document.createElement('option')
      opt.value = name
      opt.textContent = name.charAt(0).toUpperCase() + name.slice(1)
      charSelect.appendChild(opt)
    }
    charSelect.value = current
  })
}
populateCharacters()

document.getElementById('btn-photo-char').addEventListener('click', async () => {
  const name = charSelect.value
  if (!name) return showAlert('Select a character first')
  const btn = document.getElementById('btn-photo-char')
  btn.disabled = true
  btn.textContent = '⏳'
  const platform = document.querySelector('input[name="platform"]:checked').value
  const result = await window.api.takeCharacterPhoto({ name, platform })
  btn.disabled = false
  btn.textContent = '📷'
  if (result.error) showAlert('Photo failed: ' + result.error)
  else showAlert(`Face saved for "${name}"`)
})

document.getElementById('btn-rename-char').addEventListener('click', async () => {
  const oldName = charSelect.value
  if (!oldName) return
  const newName = await showInputDialog(`Rename "${oldName}" to:`, oldName)
  if (!newName || newName === oldName) return
  const result = await window.api.renameCharacter({ oldName, newName: newName.toLowerCase() })
  if (result.error) {
    showAlert('Rename failed: ' + result.error)
  } else {
    await populateCharacters()
    charSelect.value = newName.toLowerCase()
  }
})

// Show/hide fields based on mode and platform
function updateVisibility() {
  const mode = document.querySelector('input[name="mode"]:checked').value
  const platform = document.querySelector('input[name="platform"]:checked').value

  document.querySelectorAll('.level-only').forEach(el => {
    el.style.display = mode === 'level' ? '' : 'none'
  })
  document.querySelectorAll('.arena-only').forEach(el => {
    el.style.display = mode === 'arena' ? '' : 'none'
  })
  const isAndroid = platform === 'emu' || platform === 'phone'
  document.querySelectorAll('.android-only').forEach(el => {
    el.style.display = isAndroid ? '' : 'none'
  })
  document.querySelectorAll('.emulator-only').forEach(el => {
    el.style.display = platform === 'emu' ? '' : 'none'
  })
  const btnAvdInline = document.getElementById('btn-avd')
  if (btnAvdInline) btnAvdInline.classList.toggle('visible', platform === 'emu')
}

document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', updateVisibility))
document.querySelectorAll('input[name="platform"]').forEach(r => r.addEventListener('change', updateVisibility))
updateVisibility()

// Show good condition preview when tier or character changes
const tierConditionEl = document.getElementById('tier-condition')

async function updateTierCondition() {
  const character = document.getElementById('char-name').value
  const tier = document.querySelector('input[name="tier"]:checked').value
  if (!character || tier === 'auto') {
    tierConditionEl.textContent = ''
    return
  }
  const condition = await window.api.getGoodCondition({ character, tier })
  tierConditionEl.textContent = condition ? formatCondition(condition) : ''
}

document.querySelectorAll('input[name="tier"]').forEach(r => r.addEventListener('change', updateTierCondition))
document.getElementById('char-name').addEventListener('change', updateTierCondition)

function setStatus(text, type) {
  status.textContent = text
  status.className = type || ''
}

function setRunning() {
  btnRun.disabled = true
  btnStop.disabled = false
  syncBtns.forEach(b => b.disabled = true)
  output.textContent = ''
  logAtLineStart = true
  summary.innerHTML = ''
  outputDot.classList.add('active')
  infoChar.textContent = ''
  infoChar.classList.add('hidden')
  infoTier.textContent = ''
  infoTier.className = 'info-badge hidden'
  infoCondition.textContent = ''
  infoCondition.classList.add('hidden')
}

function setReady() {
  btnRun.disabled = false
  btnStop.disabled = true
  syncBtns.forEach(b => b.disabled = false)
  outputDot.classList.remove('active')
}

// Launch AVD (start or bring to front)
const btnAvd = document.getElementById('btn-avd')
btnAvd.addEventListener('click', async () => {
  btnAvd.disabled = true
  btnAvd.classList.add('booting')
  output.textContent = ''
  outputDot.classList.add('active')
  setStatus('Launching emulator...', 'running')
  await window.api.startAvd()
})

window.api.onAvdReady(() => {
  btnAvd.disabled = false
  btnAvd.classList.remove('booting')
  outputDot.classList.remove('active')
  setStatus('AVD ready', 'success')
})

btnRun.addEventListener('click', async () => {
  const mode = document.querySelector('input[name="mode"]:checked').value
  const platform = document.querySelector('input[name="platform"]:checked').value
  const tier = document.querySelector('input[name="tier"]:checked').value

  const options = {
    name: document.getElementById('char-name').value || null,
    tier,
    retries: parseInt(document.getElementById('retries').value, 10) || 4,
    skip: parseInt(document.getElementById('skip').value, 10) || 0,
    random: document.getElementById('random').value.trim() || null,
    fight: mode === 'level' ? (document.getElementById('fight').value.trim() || null) : null,
    selectSteps: mode === 'level' ? (document.getElementById('select-steps').value.trim() || null) : null,
    isBoss: mode === 'level' ? document.getElementById('is-boss').checked : false,
    debug: document.getElementById('debug-mode').checked,

    emulatorSpeed: parseInt(document.getElementById('emulator-speed').value, 10) || null,
    levelsToGain: mode === 'arena' ? (parseInt(document.getElementById('levels-to-gain').value, 10) || null) : null
  }

  await window.api.saveLastOptions(collectOptions())
  setRunning()
  postRunState = null
  runPlatform = platform
  lastCharName = null
  lastStatLine = null
  setStatus(`Running: ${mode} (${platform})`, 'running')

  const result = await window.api.runCommand({ mode, platform, options })
  if (result.error) {
    setStatus(result.error, 'error')
    setReady()
  }
})

async function runSync(direction, target) {
  postRunState = 'sync'
  setRunning()
  const label = `${direction === 'pull' ? 'Pulling from' : 'Pushing to'} ${target}...`
  setStatus(label, 'running')
  const result = await window.api.syncCommand({ direction, target })
  if (result.error) {
    setStatus(result.error, 'error')
    setReady()
  }
}

btnPullEmu.addEventListener('click', () => runSync('pull', 'emulator'))
btnPushEmu.addEventListener('click', () => runSync('push', 'emulator'))
btnPullPhone.addEventListener('click', () => runSync('pull', 'phone'))
btnPushPhone.addEventListener('click', () => runSync('push', 'phone'))

btnStop.addEventListener('click', async () => {
  postRunState = null
  await window.api.stopCommand()
  setStatus('Stopped', 'error')
  setReady()
})

// ── Log timestamp helper ──
let logAtLineStart = true
function prependTimestamps(data) {
  const now = new Date()
  const ts = now.toTimeString().slice(0, 8) // HH:MM:SS
  const prefix = `[${ts}] `
  let result = logAtLineStart ? prefix + data : data
  // Replace every newline (except a trailing one) with newline + prefix
  result = result.replace(/\n(?=[\s\S])/g, `\n${prefix}`)
  logAtLineStart = data.endsWith('\n')
  return result
}

// ── Post-run state machine: run success → pull save → git commit ──
let postRunState = null // null | 'pulling' | 'committing'
let runPlatform = null
let lastCharName = null
let lastStatLine = null

window.api.onOutput((data) => {
  const charMatch = data.match(/\[levelup\] detected character: (\w+)/)
  if (charMatch) {
    const name = charMatch[1]
    lastCharName = name
    infoChar.textContent = name.charAt(0).toUpperCase() + name.slice(1)
    infoChar.classList.remove('hidden')
  }
  const tierMatch = data.match(/\[levelup\] tier: (\w+)/)
  if (tierMatch) {
    const tier = tierMatch[1]
    infoTier.textContent = tier
    infoTier.className = `info-badge info-tier-${tier}`
  }
  const condMatch = data.match(/\[levelup\] goodCondition: (.+)/)
  if (condMatch) {
    try {
      const parsed = JSON.parse(condMatch[1])
      infoCondition.textContent = formatCondition(parsed)
      infoCondition.classList.remove('hidden')
      summaryTargetCount = parsed[0].count
    } catch {}
  }
  // Parse turn/level_attempt stat lines: "turn=N stats=count,s1,s2,..."
  const statMatch = data.match(/\b(turn|level_attempt)=(\d+)\s+stats=(\d+)(?:,([^\s]*))?/)
  if (statMatch) {
    const turnLabel = `${statMatch[1]}=${statMatch[2]}`
    const count = parseInt(statMatch[3], 10)
    const statNames = statMatch[4] ? statMatch[4].split(',').filter(Boolean) : []
    lastStatLine = `${count} ${statNames.join(',')}`
    if (count >= summaryTargetCount - 1) addSummaryRow(turnLabel, count, statNames)
  }

  // If search highlights are active, clear them before appending (re-apply after)
  if (searchMarks.length > 0) clearSearchHighlights()
  output.textContent += prependTimestamps(data)
  output.scrollTop = output.scrollHeight
  if (searchInput.value && searchBar.classList.contains('visible')) performSearch()
})

window.api.onDone(async (code) => {
  if (code === 0 && postRunState === null) {
    // Run succeeded — pull save from device
    const pullTarget = runPlatform === 'phone' ? 'phone' : runPlatform === 'desktop' ? 'desktop' : 'emulator'
    postRunState = 'pulling'
    setStatus(`Pulling save from ${pullTarget}...`, 'running')
    const result = await window.api.syncCommand({ direction: 'pull', target: pullTarget })
    if (result.error) {
      postRunState = null
      setStatus(`Done - pull failed: ${result.error}`, 'error')
      setReady()
    }
  } else if (code === 0 && postRunState === 'pulling') {
    // Pull succeeded — commit the save file
    const name = lastCharName ? lastCharName.charAt(0).toUpperCase() + lastCharName.slice(1) : 'Unknown'
    const stats = lastStatLine || ''
    const message = `Level up ${name}: ${stats}`
    postRunState = 'committing'
    setStatus('Committing save...', 'running')
    const result = await window.api.commitSave({ message })
    if (result.error) {
      postRunState = null
      setStatus(`Done - commit failed: ${result.error}`, 'error')
      setReady()
    }
  } else if (postRunState === 'committing') {
    postRunState = null
    setStatus(code === 0 ? 'Done - saved & committed!' : 'Done - commit failed', code === 0 ? 'success' : 'error')
    setReady()
  } else if (postRunState !== null && code !== 0) {
    // Pull or other step failed
    const failedStep = postRunState
    postRunState = null
    setStatus(`Done - ${failedStep} failed (code ${code})`, 'error')
    setReady()
  } else {
    // Normal exit (non-success or manual sync)
    postRunState = null
    setStatus(
      code === 0 ? 'Done' : `Exited (code ${code})`,
      code === 0 ? 'success' : 'error'
    )
    setReady()
  }
})

// ── Log search ──
const searchBar = document.getElementById('search-bar')
const searchInput = document.getElementById('search-input')
const searchCount = document.getElementById('search-count')
const searchPrev = document.getElementById('search-prev')
const searchNext = document.getElementById('search-next')
const searchClose = document.getElementById('search-close')

let searchCurrentIndex = -1
let searchMarks = []

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function performSearch() {
  // Restore plain text
  clearSearchHighlights()
  const query = searchInput.value
  if (!query) {
    searchCount.textContent = ''
    searchCurrentIndex = -1
    searchMarks = []
    return
  }
  const regex = new RegExp(escapeRegExp(query), 'gi')
  const text = output.textContent
  const parts = []
  let last = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(document.createTextNode(text.slice(last, match.index)))
    const mark = document.createElement('mark')
    mark.className = 'search-hit'
    mark.textContent = match[0]
    parts.push(mark)
    last = regex.lastIndex
  }
  if (parts.length === 0) {
    searchCount.textContent = '0'
    searchCurrentIndex = -1
    searchMarks = []
    return
  }
  if (last < text.length) parts.push(document.createTextNode(text.slice(last)))
  output.textContent = ''
  for (const p of parts) output.appendChild(p)
  searchMarks = output.querySelectorAll('mark.search-hit')
  searchCurrentIndex = searchMarks.length - 1
  updateSearchCurrent()
}

function clearSearchHighlights() {
  if (searchMarks.length === 0) return
  // Flatten back to text
  const text = output.textContent
  output.textContent = text
  searchMarks = []
  searchCurrentIndex = -1
}

function updateSearchCurrent() {
  searchMarks.forEach(m => m.classList.remove('current'))
  if (searchCurrentIndex >= 0 && searchCurrentIndex < searchMarks.length) {
    searchMarks[searchCurrentIndex].classList.add('current')
    searchMarks[searchCurrentIndex].scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  searchCount.textContent = searchMarks.length > 0 ? `${searchCurrentIndex + 1}/${searchMarks.length}` : '0'
}

function openSearch() {
  searchBar.classList.add('visible')
  searchInput.focus()
  searchInput.select()
}

function closeSearch() {
  searchBar.classList.remove('visible')
  clearSearchHighlights()
  searchCount.textContent = ''
}

searchInput.addEventListener('input', performSearch)
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeSearch(); return }
  if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) navigateSearch(-1)
    else navigateSearch(1)
  }
})

function navigateSearch(dir) {
  if (searchMarks.length === 0) return
  searchCurrentIndex = (searchCurrentIndex + dir + searchMarks.length) % searchMarks.length
  updateSearchCurrent()
}

searchNext.addEventListener('click', () => navigateSearch(1))
searchPrev.addEventListener('click', () => navigateSearch(-1))
searchClose.addEventListener('click', closeSearch)

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    openSearch()
  }
})
