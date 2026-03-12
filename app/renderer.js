const output = document.getElementById('output')
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

window.api.getLastRandom().then(value => {
  if (value) showRandomSuggestion(value)
})

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
window.api.getCharacters().then(chars => {
  const select = document.getElementById('char-name')
  for (const name of chars) {
    const opt = document.createElement('option')
    opt.value = name
    opt.textContent = name.charAt(0).toUpperCase() + name.slice(1)
    select.appendChild(opt)
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
  document.querySelectorAll('.android-only').forEach(el => {
    el.style.display = platform === 'android' ? '' : 'none'
  })
}

document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', updateVisibility))
document.querySelectorAll('input[name="platform"]').forEach(r => r.addEventListener('change', updateVisibility))
updateVisibility()

function setStatus(text, type) {
  status.textContent = text
  status.className = type || ''
}

function setRunning() {
  btnRun.disabled = true
  btnStop.disabled = false
  syncBtns.forEach(b => b.disabled = true)
  output.textContent = ''
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
  btnAvd.textContent = 'Launching...'
  output.textContent = ''
  outputDot.classList.add('active')
  setStatus('Launching emulator...', 'running')
  await window.api.startAvd()
})

window.api.onAvdReady(() => {
  btnAvd.disabled = false
  btnAvd.classList.remove('booting')
  btnAvd.textContent = 'Launch AVD'
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
    fixedTier: document.getElementById('fixed-tier').checked,
    retries: parseInt(document.getElementById('retries').value, 10) || 4,
    skip: parseInt(document.getElementById('skip').value, 10) || 0,
    random: document.getElementById('random').value.trim() || null,
    fight: mode === 'level' ? (document.getElementById('fight').value.trim() || null) : null,
    isBoss: mode === 'level' ? document.getElementById('is-boss').checked : false,
    syncGithub: document.getElementById('sync-github').checked,
    levelsToGain: mode === 'arena' ? (parseInt(document.getElementById('levels-to-gain').value, 10) || null) : null
  }

  setRunning()
  setStatus(`Running: ${mode} (${platform})`, 'running')

  const result = await window.api.runCommand({ mode, platform, options })
  if (result.error) {
    setStatus(result.error, 'error')
    setReady()
  }
})

async function runSync(direction, target) {
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
  await window.api.stopCommand()
  setStatus('Stopped', 'error')
  setReady()
})

window.api.onOutput((data) => {
  const charMatch = data.match(/\[levelup\] detected character: (\w+)/)
  if (charMatch) {
    const name = charMatch[1]
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
      infoCondition.textContent = formatCondition(JSON.parse(condMatch[1]))
      infoCondition.classList.remove('hidden')
    } catch {}
  }
  output.textContent += data
  output.scrollTop = output.scrollHeight
})

window.api.onDone((code) => {
  setStatus(
    code === 0 ? 'Done - Good stats found!' : `Exited (code ${code})`,
    code === 0 ? 'success' : 'error'
  )
  setReady()
})
