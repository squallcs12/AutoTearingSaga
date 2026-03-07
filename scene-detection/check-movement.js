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

// Background subtraction: pixels that changed between bg and fg frames,
// limited to the game area (top portion of screen, excluding controller UI)
async function subtractBackground(bgPath, fgPath, diffThreshold = 25) {
  const [bg, fg] = await Promise.all([loadRaw(bgPath), loadRaw(fgPath)]);
  const { width, height, channels } = fg.info;
  const { gameX, gameY, gameW, gameH } = getGameArea(width, height);
  const total = width * height;
  const tileMap = new Uint8Array(total);

  for (let px = 0; px < total; px++) {
    const x = px % width, y = Math.floor(px / width);
    if (x < gameX || x >= gameX + gameW || y < gameY || y >= gameY + gameH) continue;
    const i = px * channels;
    const dr = fg.data[i]   - bg.data[i];
    const dg = fg.data[i+1] - bg.data[i+1];
    const db = fg.data[i+2] - bg.data[i+2];
    const diff = Math.abs(dr) + Math.abs(dg) + Math.abs(db);
    if (diff > diffThreshold) {
      // Movement tiles are green overlays: fg green channel increases more than red/blue
      const isGreenShift = dg > dr && dg > db;
      if (isGreenShift) tileMap[px] = 1;
    }
  }

  // Save black and white diff to tmp/ for debugging (tileMap=1 → white, else black)
  const diffBuf = Buffer.alloc(total * 3);
  for (let px = 0; px < total; px++) {
    const v = tileMap[px] ? 255 : 0;
    const i = px * 3;
    diffBuf[i] = v; diffBuf[i+1] = v; diffBuf[i+2] = v;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = `${MOVEMENT_DIR}/${timestamp}`;
  if (!fs.existsSync(runDir)) fs.mkdirSync(runDir, { recursive: true });
  await Promise.all([
    fs.promises.copyFile(bgPath, `${runDir}/bg.png`),
    fs.promises.copyFile(fgPath, `${runDir}/fg.png`),
    sharp(diffBuf, { raw: { width, height, channels: 3 } })
      .png()
      .toFile(`${runDir}/diff.png`),
  ]);

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

// Find the character by detecting the cursor [ ] corners in the bg image.
// The bg is taken after pressing LEFT then X, so cursor is 1 cell left of character.
// C = cursor center + 1 tile right.
async function findCharacterPosition(tiles, tileX, tileY, bgPath) {
  const bg = await sharp(bgPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = bg.info;
  const ref = tiles[0];
  const { gameX, gameY, gameW, gameH } = getGameArea(width, height);

  // Collect white/bright pixels in game area (cursor corners are white)
  const whitePixels = [];
  for (let y = gameY; y < gameY + gameH; y++) {
    for (let x = gameX; x < gameX + gameW; x++) {
      const i = (y * width + x) * channels;
      const r = bg.data[i], g = bg.data[i+1], b = bg.data[i+2];
      if (r > 180 && g > 180 && b > 180 && Math.max(r,g,b) - Math.min(r,g,b) < 30) {
        whitePixels.push({ x, y });
      }
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
    const bw = Math.max(...xs) - Math.min(...xs);
    const bh = Math.max(...ys) - Math.min(...ys);
    if (bw > 30 || bh > 30) continue; // each corner is small
    corners.push({
      cx: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
      cy: Math.round((Math.min(...ys) + Math.max(...ys)) / 2),
      size: cl.length,
    });
  }

  // Try all combinations of 4 corners to find a rectangle
  let cursorCx = null, cursorCy = null;
  for (let i = 0; i < corners.length && !cursorCx; i++) {
    for (let j = i+1; j < corners.length && !cursorCx; j++) {
      for (let k = j+1; k < corners.length && !cursorCx; k++) {
        for (let l = k+1; l < corners.length && !cursorCx; l++) {
          const pts = [corners[i], corners[j], corners[k], corners[l]];
          // Group into left/right and top/bottom pairs with tolerance
          const sortedX = pts.map(p => p.cx).sort((a, b) => a - b);
          if (sortedX[1] - sortedX[0] > 10 || sortedX[3] - sortedX[2] > 10) continue;
          const byY = pts.map(p => p.cy).sort((a, b) => a - b);
          if (byY[1] - byY[0] > 10 || byY[3] - byY[2] > 10) continue;
          const xLeft = (sortedX[0] + sortedX[1]) / 2;
          const xRight = (sortedX[2] + sortedX[3]) / 2;
          const yTop = (byY[0] + byY[1]) / 2;
          const yBot = (byY[2] + byY[3]) / 2;
          const w = xRight - xLeft, h = yBot - yTop;
          if (w > tileX * 0.5 && w < tileX * 1.5 &&
              h > tileY * 0.5 && h < tileY * 1.5) {
            cursorCx = Math.round((xLeft + xRight) / 2);
            cursorCy = Math.round((yTop + yBot) / 2);
          }
        }
      }
    }
  }

  if (cursorCx !== null) {
    // Character is 1 tile to the right of cursor (LEFT was pressed once).
    const charCx = cursorCx + 1 * tileX;
    const charCy = cursorCy;
    console.log(`[cursor] at (${cursorCx},${cursorCy}), char at (${charCx},${charCy})`);
    const charGx = Math.round((charCx - ref.cx) / tileX);
    const charGy = Math.round((charCy - ref.cy) / tileY);
    const snappedCx = ref.cx + charGx * tileX;
    const snappedCy = ref.cy + charGy * tileY;
    return { charGx, charGy, charCx: snappedCx, charCy: snappedCy };
  }

  // Fallback: hole-based
  console.log('[cursor] not found, using hole fallback');
  const gridTiles = tiles.map(t => ({
    gx: Math.round((t.cx - ref.cx) / tileX),
    gy: Math.round((t.cy - ref.cy) / tileY),
  }));
  const tileSet = new Set(gridTiles.map(t => `${t.gx},${t.gy}`));
  const candidates = new Map();
  for (const t of gridTiles) {
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const k = `${t.gx+dx},${t.gy+dy}`;
      if (!tileSet.has(k)) candidates.set(k, (candidates.get(k) || 0) + 1);
    }
  }
  const avgGx = gridTiles.reduce((s, t) => s + t.gx, 0) / gridTiles.length;
  const avgGy = gridTiles.reduce((s, t) => s + t.gy, 0) / gridTiles.length;
  let bestKey = null, bestCount = 0, bestD = Infinity;
  for (const [k, count] of candidates) {
    const [gx, gy] = k.split(',').map(Number);
    const d = Math.abs(gx - avgGx) + Math.abs(gy - avgGy);
    if (count > bestCount || (count === bestCount && d < bestD)) {
      bestCount = count; bestKey = k; bestD = d;
    }
  }
  const [charGx, charGy] = (bestKey || '0,0').split(',').map(Number);
  return { charGx, charGy, charCx: ref.cx + charGx * tileX, charCy: ref.cy + charGy * tileY };
}

async function detectMovableGrid(bgPath, fgPath) {
  const { tileMap, width, height } = await subtractBackground(bgPath, fgPath);

  // Erode tileMap to break thin connections between tiles and sprite noise
  const total = width * height;
  const eroded = new Uint8Array(total);
  for (let px = 0; px < total; px++) {
    if (!tileMap[px]) continue;
    const x = px % width, y = Math.floor(px / width);
    // Keep pixel only if all 4 neighbors (within 2px) are also set
    let ok = true;
    for (const d of [-2, -1, 1, 2]) {
      if (x + d < 0 || x + d >= width || !tileMap[y * width + (x + d)]) { ok = false; break; }
      if (y + d < 0 || y + d >= height || !tileMap[(y + d) * width + x]) { ok = false; break; }
    }
    if (ok) eroded[px] = 1;
  }
  // Use eroded map for component detection but keep original tileMap for size counting
  const detectMap = eroded;

  // Two-pass: reliable tiles first, then accept smaller edge tiles that align to the grid
  // Filter out oversized components (stat panel noise, UI overlays) using median-based threshold
  const rawReliable = findComponents(detectMap, width, height, 1500);
  if (rawReliable.length === 0) return { grid: [], tileX: null, tileY: null, tileCount: 0 };
  const sizes = rawReliable.map(t => t.size).sort((a, b) => a - b);
  const medianSize = sizes[Math.floor(sizes.length / 2)];
  const maxTileSize = medianSize * 3;
  const reliableTiles = rawReliable.filter(t => t.size <= maxTileSize);
  if (reliableTiles.length === 0) return { grid: [], tileX: null, tileY: null, tileCount: 0 };

  const { tileX, tileY } = estimateTileSizes(reliableTiles);
  if (!tileX || !tileY) return { grid: [], tileX, tileY, tileCount: reliableTiles.length };

  const { charCx, charCy } = await findCharacterPosition(reliableTiles, tileX, tileY, bgPath);
  const originX = Math.round(charCx);
  const originY = Math.round(charCy);

  // Second pass: include smaller tiles (>= 800) that snap to the grid
  // Second pass uses original tileMap to recover tiles near sprites that erosion removed
  // Oversized components (multiple touching tiles) are split by grid cell
  const allCandidates = findComponents(tileMap, width, height, 800);
  const tiles = [];
  for (const t of allCandidates) {
    if (t.size <= maxTileSize) {
      if (t.size >= 1500) {
        tiles.push(t);
      } else {
        const gxFrac = (t.cx - originX) / tileX;
        const gyFrac = (t.cy - originY) / tileY;
        if (Math.abs(gxFrac - Math.round(gxFrac)) < 0.35 &&
            Math.abs(gyFrac - Math.round(gyFrac)) < 0.35) {
          tiles.push(t);
        }
      }
    } else {
      // Split oversized component: BFS to collect only this component's pixels,
      // then assign each pixel to its nearest grid cell
      const cellCounts = new Map();
      const compVisited = new Uint8Array(total);
      const startPx = t.cy * width + t.cx;
      const bfsQueue = [startPx]; compVisited[startPx] = 1; let bfsHead = 0;
      while (bfsHead < bfsQueue.length) {
        const px = bfsQueue[bfsHead++];
        const x = px % width, y = Math.floor(px / width);
        const gx = Math.round((x - originX) / tileX);
        const gy = Math.round((y - originY) / tileY);
        const key = `${gx},${gy}`;
        const entry = cellCounts.get(key);
        if (entry) { entry.sumX += x; entry.sumY += y; entry.count++; }
        else cellCounts.set(key, { sumX: x, sumY: y, count: 1 });
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nPx = ny * width + nx;
          if (tileMap[nPx] && !compVisited[nPx]) { compVisited[nPx] = 1; bfsQueue.push(nPx); }
        }
      }
      for (const [, cell] of cellCounts) {
        if (cell.count >= 2000) {
          tiles.push({ cx: Math.round(cell.sumX / cell.count), cy: Math.round(cell.sumY / cell.count), size: cell.count });
        }
      }
    }
  }

  const gridTiles = tiles.map(t => ({
    gx: Math.round((t.cx - originX) / tileX),
    gy: Math.round((t.cy - originY) / tileY),
  }));

  const rawGridSet = new Set(gridTiles.map(t => `${t.gx},${t.gy}`));

  // Include C and its immediate neighbors — sprites on/near character
  // merge with adjacent tiles, making them undetectable as separate components
  rawGridSet.add('0,0');
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    rawGridSet.add(`${dx},${dy}`);
  }

  // Keep only the largest connected component (BFS on grid) to remove noise clusters
  const visited = new Set();
  const components = [];
  for (const key of rawGridSet) {
    if (visited.has(key)) continue;
    const queue = [key];
    visited.add(key);
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const [cx, cy] = cur.split(',').map(Number);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nk = `${cx+dx},${cy+dy}`;
        if (rawGridSet.has(nk) && !visited.has(nk)) {
          visited.add(nk);
          queue.push(nk);
        }
      }
    }
    components.push(queue);
  }
  components.sort((a, b) => b.length - a.length);
  const gridSet = new Set(components[0]);
  gridSet.delete('0,0');

  // Bounds: use all tiles (before CC filter) capped at ±6, so grid shows full extent
  const MAX_GRID = 6;
  const allGx = gridTiles.map(t => t.gx);
  const allGy = gridTiles.map(t => t.gy);
  const minGx = Math.max(-MAX_GRID, Math.min(...allGx));
  const maxGx = Math.min(MAX_GRID, Math.max(...allGx));
  const minGy = Math.max(-MAX_GRID, Math.min(...allGy));
  const maxGy = Math.min(MAX_GRID, Math.max(...allGy));

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