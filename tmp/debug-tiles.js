const sharp = require('sharp');

const isMoveTile = (r, g, b) => g > 130 && g > r + 20 && g > b + 20;

async function loadRaw(p) { return sharp(p).raw().toBuffer({ resolveWithObject: true }); }

async function main() {
  const [bg, fg] = await Promise.all([loadRaw('tmp/movement-bg.png'), loadRaw('tmp/movement-fg.png')]);
  const { width, height, channels } = fg.info;
  const gameH = Math.round(height * 0.27);
  const tileMap = new Uint8Array(width * height);

  for (let px = 0; px < width * gameH; px++) {
    const i = px * channels;
    const diff = Math.abs(bg.data[i] - fg.data[i]) + Math.abs(bg.data[i+1] - fg.data[i+1]) + Math.abs(bg.data[i+2] - fg.data[i+2]);
    if (diff > 25 && isMoveTile(fg.data[i], fg.data[i+1], fg.data[i+2])) tileMap[px] = 1;
  }

  const visited = new Uint8Array(width * height);
  const tiles = [];
  for (let s = 0; s < width * gameH; s++) {
    if (!tileMap[s] || visited[s]) continue;
    const q = [s]; let h = 0, sx = 0, sy = 0, cnt = 0; visited[s] = 1;
    while (h < q.length) {
      const px = q[h++]; sx += px % width; sy += Math.floor(px / width); cnt++;
      const x = px % width, y = Math.floor(px / width);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x+dx, ny = y+dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= gameH) continue;
        const np = ny * width + nx;
        if (!tileMap[np] || visited[np]) continue;
        visited[np] = 1; q.push(np);
      }
    }
    if (cnt >= 80) tiles.push({ cx: Math.round(sx/cnt), cy: Math.round(sy/cnt), size: cnt });
  }

  tiles.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  console.log('tiles:', tiles.length);
  tiles.forEach(t => console.log(`  cx=${t.cx} cy=${t.cy} size=${t.size}`));

  const dists = [];
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i+1; j < tiles.length; j++) {
      const dy = Math.abs(tiles[i].cy - tiles[j].cy);
      if (dy < 20) dists.push(Math.abs(tiles[i].cx - tiles[j].cx));
    }
  }
  dists.sort((a, b) => a - b);
  console.log('horiz dists:', dists.slice(0, 10));
}

main();