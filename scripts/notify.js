const { spawn } = require('child_process');
const path = require('path');

const success = process.argv[2] === 'success';
const file = path.resolve(`${__dirname}/../sounds/${success ? 'success' : 'fail'}.mp3`);

if (process.platform === 'win32') {
  const ps = spawn('powershell', ['-NoProfile', '-File', '-'], { stdio: ['pipe', 'ignore', 'ignore'] });
  ps.stdin.end(`
Add-Type -AssemblyName presentationCore
$p = New-Object System.Windows.Media.MediaPlayer
$p.Open([uri]"${file}")
$p.Volume = 1.0
$p.Play()
Start-Sleep -Seconds 5
`);
  ps.on('close', () => process.exit(0));
} else {
  const player = require('play-sound')({ player: 'gst-play-1.0' });
  player.play(file, (err) => { if (err) console.error(err); });
}
