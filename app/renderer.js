const output = document.getElementById('output')
const status = document.getElementById('status')
const btnRun = document.getElementById('btn-run')
const btnStop = document.getElementById('btn-stop')
const outputDot = document.getElementById('output-dot')

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
  output.textContent = ''
  outputDot.classList.add('active')
}

function setReady() {
  btnRun.disabled = false
  btnStop.disabled = true
  outputDot.classList.remove('active')
}

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
    random: document.getElementById('random').value.trim() || null
  }

  setRunning()
  setStatus(`Running: ${mode} (${platform})`, 'running')

  const result = await window.api.runCommand({ mode, platform, options })
  if (result.error) {
    setStatus(result.error, 'error')
    setReady()
  }
})

btnStop.addEventListener('click', async () => {
  await window.api.stopCommand()
  setStatus('Stopped', 'error')
  setReady()
})

window.api.onOutput((data) => {
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
