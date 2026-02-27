const player = require('play-sound')();
const success = process.argv[2] === 'success';
const file = `${__dirname}/../sounds/${success ? 'success' : 'fail'}.mp3`;
player.play(file, (err) => { if (err) console.error(err); });