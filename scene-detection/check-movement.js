const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
sharp.cache(false);

const MOVEMENT_DIR = 'tmp/movement';
const BG_PATH = 'tmp/movement-bg.png';
const FG_PATH = 'tmp/movement-fg.png';

async function loadRaw(filePath) {
  return sharp(filePath).raw().toBuffer({ resolveWithObject: true });
}

// Detect game screen area (4:3 aspect ratio) within the full image.
// Portrait (vertical): game at top, full width, height = width * 3/4
// Landscape (horizontal): game centered vertically, full height, width = height * 4/3
function getGameArea(width, height) {
  if (height > width) {
    // Portrait
    return { gameX: 0, gameY: 0, gameW: width, gameH: Math.round(width * 3 / 4) };
  } else {
    // Landscape
    const gameW = Math.round(height * 4 / 3);
    const gameX = Math.round((width - gameW) / 2);
    return { gameX, gameY: 0, gameW, gameH: height };
  }
}

// Standard game area size — all images are normalized to this before processing.
// tileX = 1080 * 3/40 = 81, tileY = 810 * 4/45 = 72
const STD_W = 1080, STD_H = 810;
const TILE_X = 81, TILE_Y = 72;

// Crop game area and resize to standard 1080x810
async function loadNormalized(filePath) {
  const meta = await sharp(filePath).metadata();
  const { width, height } = meta;
  const { gameX, gameY, gameW, gameH } = getGameArea(width, height);
  return sharp(filePath)
    .extract({ left: gameX, top: gameY, width: gameW, height: gameH })
    .resize(STD_W, STD_H, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
}

// Background subtraction on normalized (1080x810) images
async function subtractBackground(bgPath, fgPath, diffThreshold = 25) {
  const [bg, fg] = await Promise.all([loadNormalized(bgPath), loadNormalized(fgPath)]);
  const width = STD_W, height = STD_H, channels = fg.info.channels;
  const total = width * height;
  const tileMap = new Uint8Array(total);

  for (let px = 0; px < total; px++) {
    const i = px * channels;
    const dr = fg.data[i]   - bg.data[i];
    const dg = fg.data[i+1] - bg.data[i+1];
    const db = fg.data[i+2] - bg.data[i+2];
    const diff = Math.abs(dr) + Math.abs(dg) + Math.abs(db);
    if (diff > diffThreshold) {
      const isGreenShift = dg > dr && dg > db;
      if (isGreenShift) tileMap[px] = 1;
    }
  }

  // Save debug diff image
  const diffBuf = Buffer.alloc(total * 3);
  for (let px = 0; px < total; px++) {
    const v = tileMap[px] ? 255 : 0;
    const i = px * 3;
    diffBuf[i] = v; diffBuf[i+1] = v; diffBuf[i+2] = v;
  }
  if (!fs.existsSync(MOVEMENT_DIR)) fs.mkdirSync(MOVEMENT_DIR, { recursive: true });
  await Promise.all([
    fs.promises.copyFile(bgPath, `${MOVEMENT_DIR}/bg.png`),
    fs.promises.copyFile(fgPath, `${MOVEMENT_DIR}/fg.png`),
    sharp(diffBuf, { raw: { width, height, channels: 3 } })
      .png()
      .toFile(`${MOVEMENT_DIR}/diff.png`),
  ]);

  return { tileMap, width, height, bgData: bg.data, fgData: fg.data, channels };
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
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    visited[start] = 1;

    while (head < queue.length) {
      const px = queue[head++];
      const x = px % width, y = Math.floor(px / width);
      sumX += x; sumY += y; count++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;

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
      components.push({ cx: Math.round(sumX / count), cy: Math.round(sumY / count), size: count, minX, maxX, minY, maxY });
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

// Find the cursor pixel position via fg−bg differencing (4 white corner brackets).
// Returns { cx, cy } of cursor center, or null if not found.
function findCursorPosition(fgData, bgData, channels, tileX, tileY) {
  const width = STD_W, height = STD_H;

  // Collect white/bright pixels that appear in fg but NOT in bg (cursor-only pixels)
  const whitePixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = fgData[i], g = fgData[i+1], b = fgData[i+2];
      if (!(r > 180 && g > 180 && b > 180 && Math.max(r,g,b) - Math.min(r,g,b) < 30)) continue;
      const br = bgData[i], bg2 = bgData[i+1], bb = bgData[i+2];
      if (br > 180 && bg2 > 180 && bb > 180 && Math.max(br,bg2,bb) - Math.min(br,bg2,bb) < 30) continue;
      whitePixels.push({ x, y });
    }
  }

  // BFS cluster (4-connected)
  const pixSet = new Set(whitePixels.map(p => `${p.x},${p.y}`));
  const visited = new Set();
  const clusters = [];
  for (const p of whitePixels) {
    const key = `${p.x},${p.y}`;
    if (visited.has(key)) continue;
    const queue = [p]; visited.add(key); let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nk = `${cur.x+dx},${cur.y+dy}`;
        if (pixSet.has(nk) && !visited.has(nk)) {
          visited.add(nk); queue.push({ x: cur.x+dx, y: cur.y+dy });
        }
      }
    }
    clusters.push(queue);
  }

  // Find 4 similarly-sized small clusters forming a rectangle (cursor corners)
  const corners = [];
  for (const cl of clusters) {
    if (cl.length < 30 || cl.length > 200) continue;
    const xs = cl.map(p => p.x), ys = cl.map(p => p.y);
    if (Math.max(...xs) - Math.min(...xs) > 30) continue;
    if (Math.max(...ys) - Math.min(...ys) > 30) continue;
    corners.push({
      cx: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
      cy: Math.round((Math.min(...ys) + Math.max(...ys)) / 2),
    });
  }

  for (let i = 0; i < corners.length; i++) {
    for (let j = i+1; j < corners.length; j++) {
      for (let k = j+1; k < corners.length; k++) {
        for (let l = k+1; l < corners.length; l++) {
          const pts = [corners[i], corners[j], corners[k], corners[l]];
          const sortedX = pts.map(p => p.cx).sort((a, b) => a - b);
          if (sortedX[1] - sortedX[0] > 10 || sortedX[3] - sortedX[2] > 10) continue;
          const byY = pts.map(p => p.cy).sort((a, b) => a - b);
          if (byY[1] - byY[0] > 10 || byY[3] - byY[2] > 10) continue;
          const w = (sortedX[2] + sortedX[3]) / 2 - (sortedX[0] + sortedX[1]) / 2;
          const h = (byY[2] + byY[3]) / 2 - (byY[0] + byY[1]) / 2;
          if (w > tileX * 0.5 && w < tileX * 1.5 && h > tileY * 0.5 && h < tileY * 1.5) {
            const cx = Math.round((sortedX[0] + sortedX[1] + sortedX[2] + sortedX[3]) / 4);
            const cy = Math.round((byY[0] + byY[1] + byY[2] + byY[3]) / 4);
            return { cx, cy };
          }
        }
      }
    }
  }
  return null;
}

// Find character grid cell. Cursor is 1 tile left of character.
// If cursor not found, use hole fallback (empty cell surrounded by most tiles).
function findCharacterCell(tileSet, ox, oy, tileX, tileY, fgData, bgData, channels) {
  const cursor = findCursorPosition(fgData, bgData, channels, tileX, tileY);
  if (cursor) {
    // Cursor pixel → grid cell, then character = 1 cell right
    const cursorGx = Math.round((cursor.cx - ox) / tileX);
    const cursorGy = Math.round((cursor.cy - oy) / tileY);
    const charGx = cursorGx + 1;
    const charGy = cursorGy;
    console.log(`[cursor] at (${cursor.cx},${cursor.cy}) grid(${cursorGx},${cursorGy}), char grid(${charGx},${charGy})`);
    return { charGx, charGy };
  }

  // Fallback: hole surrounded by most tiles, closest to center
  console.log('[cursor] not found, using hole fallback');
  const candidates = new Map();
  for (const key of tileSet) {
    const [gx, gy] = key.split(',').map(Number);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nk = `${gx+dx},${gy+dy}`;
      if (!tileSet.has(nk)) candidates.set(nk, (candidates.get(nk) || 0) + 1);
    }
  }
  const allGx = [...tileSet].map(k => +k.split(',')[0]);
  const allGy = [...tileSet].map(k => +k.split(',')[1]);
  const avgGx = allGx.reduce((s, v) => s + v, 0) / allGx.length;
  const avgGy = allGy.reduce((s, v) => s + v, 0) / allGy.length;
  let bestKey = null, bestCount = 0, bestD = Infinity;
  for (const [k, count] of candidates) {
    const [gx, gy] = k.split(',').map(Number);
    const d = Math.abs(gx - avgGx) + Math.abs(gy - avgGy);
    if (count > bestCount || (count === bestCount && d < bestD)) {
      bestCount = count; bestKey = k; bestD = d;
    }
  }
  const [charGx, charGy] = (bestKey || '0,0').split(',').map(Number);
  return { charGx, charGy };
}

// Count white pixels and total visible pixels per grid cell for a given offset.
// Returns Map of key -> { white, total } so fill % accounts for edge clipping.
function countCellPixels(tileMap, width, height, ox, oy, tileX, tileY) {
  const cells = new Map();
  for (let py = 0; py < height; py++) {
    const gy = Math.round((py - oy) / tileY);
    for (let px = 0; px < width; px++) {
      const gx = Math.round((px - ox) / tileX);
      const key = `${gx},${gy}`;
      let entry = cells.get(key);
      if (!entry) { entry = { white: 0, total: 0 }; cells.set(key, entry); }
      entry.total++;
      if (tileMap[py * width + px]) entry.white++;
    }
  }
  return cells;
}

// Find grid cell-center offset by folding pixel histograms with tile period.
// The minimum of the folded histogram is the border between cells;
// cell center = border + half tile.
function findGridOffset(tileMap, width, height, tileX, tileY) {
  // Fold column histogram with period tileX
  const foldX = new Float64Array(tileX);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y < height; y++) sum += tileMap[y * width + x];
    foldX[x % tileX] += sum;
  }
  let minXVal = Infinity, borderX = 0;
  for (let i = 0; i < tileX; i++) {
    if (foldX[i] < minXVal) { minXVal = foldX[i]; borderX = i; }
  }

  // Fold row histogram with period tileY
  const foldY = new Float64Array(tileY);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) sum += tileMap[y * width + x];
    foldY[y % tileY] += sum;
  }
  let minYVal = Infinity, borderY = 0;
  for (let i = 0; i < tileY; i++) {
    if (foldY[i] < minYVal) { minYVal = foldY[i]; borderY = i; }
  }

  const ox = (borderX + Math.round(tileX / 2)) % tileX;
  const oy = (borderY + Math.round(tileY / 2)) % tileY;
  return { ox, oy };
}

async function detectMovableGrid(bgPath, fgPath) {
  const { tileMap, width, height, bgData, fgData, channels } = await subtractBackground(bgPath, fgPath);
  const tileX = TILE_X, tileY = TILE_Y;
  const cellArea = tileX * tileY;

  // Find grid offset via folded histogram
  const { ox, oy } = findGridOffset(tileMap, width, height, tileX, tileY);

  // Count pixels per cell at best offset
  const cells = countCellPixels(tileMap, width, height, ox, oy, tileX, tileY);

  // Classify cells: center pixel must be white AND ≥60% of visible area is white
  const tileSet = new Set();
  for (const [key, { white, total }] of cells) {
    if (total <= 0 || white / total < 0.60) continue;
    const [gx, gy] = key.split(',').map(Number);
    const cx = ox + gx * tileX, cy = oy + gy * tileY;
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
    if (!tileMap[cy * width + cx]) continue;
    tileSet.add(key);
  }
  if (tileSet.size === 0) return { grid: [], tileX, tileY, tileCount: 0 };

  // Find character cell via cursor detection or hole fallback
  const { charGx, charGy } = findCharacterCell(tileSet, ox, oy, tileX, tileY, fgData, bgData, channels);
  const originX = ox + charGx * tileX;
  const originY = oy + charGy * tileY;

  // Re-express tile cells relative to character (0,0)
  const gridSet = new Set();
  for (const key of tileSet) {
    const [gx, gy] = key.split(',').map(Number);
    const rk = `${gx - charGx},${gy - charGy}`;
    if (rk !== '0,0') gridSet.add(rk);
  }

  // Keep only the largest connected component (BFS on grid, using C as bridge)
  const rawSet = new Set(gridSet);
  rawSet.add('0,0');
  const visited = new Set();
  const components = [];
  for (const key of rawSet) {
    if (visited.has(key)) continue;
    const queue = [key]; visited.add(key); let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const [cx, cy] = cur.split(',').map(Number);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nk = `${cx+dx},${cy+dy}`;
        if (rawSet.has(nk) && !visited.has(nk)) { visited.add(nk); queue.push(nk); }
      }
    }
    components.push(queue);
  }
  components.sort((a, b) => b.length - a.length);
  const connectedSet = new Set(components[0]);
  connectedSet.delete('0,0');

  // Bounds capped at ±10
  const MAX_GRID = 10;
  const allGx = [...connectedSet].map(k => +k.split(',')[0]);
  const allGy = [...connectedSet].map(k => +k.split(',')[1]);
  allGx.push(0); allGy.push(0);
  const minGx = Math.max(-MAX_GRID, Math.min(...allGx));
  const maxGx = Math.min(MAX_GRID, Math.max(...allGx));
  const minGy = Math.max(-MAX_GRID, Math.min(...allGy));
  const maxGy = Math.min(MAX_GRID, Math.max(...allGy));

  // BFS from character (0,0) to compute step distances
  const distMap = new Map();
  distMap.set('0,0', 0);
  const bfsQ = ['0,0'];
  let bfsH = 0;
  while (bfsH < bfsQ.length) {
    const cur = bfsQ[bfsH++];
    const [cx, cy] = cur.split(',').map(Number);
    const d = distMap.get(cur);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nk = `${cx+dx},${cy+dy}`;
      if (connectedSet.has(nk) && !distMap.has(nk)) {
        distMap.set(nk, d + 1);
        bfsQ.push(nk);
      }
    }
  }

  const grid = [];
  for (let gy = minGy; gy <= maxGy; gy++) {
    let row = '';
    for (let gx = minGx; gx <= maxGx; gx++) {
      if (gx === 0 && gy === 0) row += 'C ';
      else if (distMap.has(`${gx},${gy}`)) row += distMap.get(`${gx},${gy}`) + ' ';
      else row += '. ';
    }
    grid.push(row.trimEnd());
  }

  return { grid, tileX, tileY, tileCount: connectedSet.size, originX, originY };
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

  const isReachable = (v) => v !== '.' && v !== 'C';
  const dirs = [];
  if (charRow > 0                && isReachable(cells[charRow - 1][charCol])) dirs.push('up');
  if (charRow < cells.length - 1 && isReachable(cells[charRow + 1][charCol])) dirs.push('down');
  if (charCol > 0                && isReachable(cells[charRow][charCol - 1])) dirs.push('left');
  if (charCol < cells[charRow].length - 1 && isReachable(cells[charRow][charCol + 1])) dirs.push('right');

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
    console.log('Grid (C=character, N=steps to reach, .=blocked):\n');
    grid.forEach(row => console.log(' ', row));
  });
}