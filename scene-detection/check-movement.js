const sharp = require('sharp');
const path = require('path');
sharp.cache(false);

const BG_PATH = 'tmp/movement-bg.png';
const FG_PATH = 'tmp/movement-fg.png';

async function loadRaw(filePath) {
  return sharp(filePath).raw().toBuffer({ resolveWithObject: true });
}

// Movement tile: green channel dominates in fg (the grid highlight)
const isMoveTile = (r, g, b) => g > 130 && g > r + 20 && g > b + 20;

// Background subtraction: pixels that changed AND are green in the fg frame,
// limited to the game area (top portion of screen, excluding controller UI)
async function subtractBackground(bgPath, fgPath, diffThreshold = 25) {
  const [bg, fg] = await Promise.all([loadRaw(bgPath), loadRaw(fgPath)]);
  const { width, height, channels } = fg.info;
  const gameAreaHeight = Math.round(height * 0.27); // game area is top ~27% of screen
  const total = width * height;
  const tileMap = new Uint8Array(total);

  for (let px = 0; px < total; px++) {
    const y = Math.floor(px / width);
    if (y >= gameAreaHeight) continue;
    const i = px * channels;
    const diff =
      Math.abs(bg.data[i]   - fg.data[i])   +
      Math.abs(bg.data[i+1] - fg.data[i+1]) +
      Math.abs(bg.data[i+2] - fg.data[i+2]);
    if (diff > diffThreshold && isMoveTile(fg.data[i], fg.data[i+1], fg.data[i+2])) {
      tileMap[px] = 1;
    }
  }

  return { tileMap, width, height };
}

// BFS flood-fill connected components
function findComponents(tileMap, width, height, minSize = 20) {
  const visited = new Uint8Array(width * height);
  const components = [];

  for (let start = 0; start < tileMap.length; start++) {
    if (!tileMap[start] || visited[start]) continue;

    const queue = [start];
    let head = 0;
    let sumX = 0, sumY = 0, count = 0;
    visited[start] = 1;

    while (head < queue.length) {
      const px = queue[head++];
      sumX += px % width;
      sumY += Math.floor(px / width);
      count++;

      const x = px % width, y = Math.floor(px / width);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nPx = ny * width + nx;
        if (!tileMap[nPx] || visited[nPx]) continue;
        visited[nPx] = 1;
        queue.push(nPx);
      }
    }

    if (count >= minSize) {
      components.push({ cx: Math.round(sumX / count), cy: Math.round(sumY / count), size: count });
    }
  }

  return components;
}

// Estimate tile sizes separately for x and y by finding minimum spacing
// between tiles that are roughly aligned on the same row or column
function estimateTileSizes(tiles) {
  if (tiles.length < 2) return { tileX: null, tileY: null };

  // For each tile, find the nearest neighbor in the same row / same column.
  // Using nearest-only avoids inflating the median with non-adjacent pair distances.
  const xDists = [], yDists = [];
  for (let i = 0; i < tiles.length; i++) {
    let minX = Infinity, minY = Infinity;
    for (let j = 0; j < tiles.length; j++) {
      if (i === j) continue;
      const dx = Math.abs(tiles[i].cx - tiles[j].cx);
      const dy = Math.abs(tiles[i].cy - tiles[j].cy);
      if (dy < 15 && dx > 10 && dx < minX) minX = dx;
      if (dx < 15 && dy > 10 && dy < minY) minY = dy;
    }
    if (minX !== Infinity) xDists.push(minX);
    if (minY !== Infinity) yDists.push(minY);
  }

  const median = arr => {
    if (!arr.length) return null;
    arr.sort((a, b) => a - b);
    return arr[Math.floor(arr.length / 2)];
  };

  return { tileX: median(xDists), tileY: median(yDists) };
}

async function detectMovableGrid(bgPath, fgPath) {
  const { tileMap, width, height } = await subtractBackground(bgPath, fgPath);
  const tiles = findComponents(tileMap, width, height, 1500);

  if (tiles.length === 0) return { grid: [], tileX: null, tileY: null, tileCount: 0 };

  const { tileX, tileY } = estimateTileSizes(tiles);
  if (!tileX || !tileY) return { grid: [], tileX, tileY, tileCount: tiles.length };

  const originX = Math.round(tiles.reduce((s, t) => s + t.cx, 0) / tiles.length);
  const originY = Math.round(tiles.reduce((s, t) => s + t.cy, 0) / tiles.length);

  const gridTiles = tiles.map(t => ({
    gx: Math.round((t.cx - originX) / tileX),
    gy: Math.round((t.cy - originY) / tileY),
  }));

  const minGx = Math.min(...gridTiles.map(t => t.gx));
  const maxGx = Math.max(...gridTiles.map(t => t.gx));
  const minGy = Math.min(...gridTiles.map(t => t.gy));
  const maxGy = Math.max(...gridTiles.map(t => t.gy));

  const gridSet = new Set(gridTiles.map(t => `${t.gx},${t.gy}`));

  const grid = [];
  for (let gy = minGy; gy <= maxGy; gy++) {
    let row = '';
    for (let gx = minGx; gx <= maxGx; gx++) {
      if (gx === 0 && gy === 0) row += 'C ';
      else if (gridSet.has(`${gx},${gy}`)) row += 'G ';
      else row += '. ';
    }
    grid.push(row.trimEnd());
  }

  return { grid, tileX, tileY, tileCount: tiles.length, originX, originY };
}

/**
 * Step 1: capture background BEFORE selecting character (no movement tiles).
 * Call this once before selecting the character.
 */
async function captureBackground(saveScreenshot) {
  await saveScreenshot(path.basename(BG_PATH));
}

/**
 * Step 2: after selecting the character and movement tiles appear,
 * capture fg and run detection.
 */
async function captureAndDetect(saveScreenshot) {
  await saveScreenshot(path.basename(FG_PATH));
  return detectMovableGrid(BG_PATH, FG_PATH);
}

/**
 * From a grid (array of strings with 'C', 'G', '.'),
 * return which cardinal directions have reachable tiles adjacent to the character.
 */
function getAvailableDirections(grid) {
  if (!grid || grid.length === 0) return ['up', 'down', 'left', 'right'];

  const cells = grid.map(row => row.split(' '));
  let charRow = -1, charCol = -1;
  for (let r = 0; r < cells.length; r++) {
    const c = cells[r].indexOf('C');
    if (c !== -1) { charRow = r; charCol = c; break; }
  }
  if (charRow === -1) return ['up', 'down', 'left', 'right'];

  const dirs = [];
  if (charRow > 0                && cells[charRow - 1][charCol] === 'G') dirs.push('up');
  if (charRow < cells.length - 1 && cells[charRow + 1][charCol] === 'G') dirs.push('down');
  if (charCol > 0                && cells[charRow][charCol - 1] === 'G') dirs.push('left');
  if (charCol < cells[charRow].length - 1 && cells[charRow][charCol + 1] === 'G') dirs.push('right');

  return dirs.length > 0 ? dirs : ['up', 'down', 'left', 'right'];
}

module.exports = { detectMovableGrid, captureBackground, captureAndDetect, getAvailableDirections };

// CLI: node check-movement.js <bg.png> <fg.png>
if (require.main === module) {
  const [bgPath, fgPath] = process.argv.slice(2);
  if (!bgPath || !fgPath) {
    console.error('Usage: node check-movement.js <background.png> <foreground.png>');
    console.error('  background = screenshot BEFORE movement tiles appear');
    console.error('  foreground = screenshot AFTER movement tiles appear');
    process.exit(1);
  }
  detectMovableGrid(bgPath, fgPath).then(({ grid, tileX, tileY, tileCount, originX, originY }) => {
    console.log(`tiles=${tileCount}  tileX≈${tileX}px tileY≈${tileY}px  origin=(${originX},${originY})\n`);
    console.log('Grid (C=character, G=reachable, .=blocked):\n');
    grid.forEach(row => console.log(' ', row));
  });
}