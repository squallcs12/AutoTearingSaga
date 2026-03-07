const sharp = require('sharp');

async function main() {
  const img = sharp('tmp/current-char-raw.png');
  const meta = await img.metadata();

  const isLandscape = meta.width > meta.height;
  let gameLeft, gameTop, gameW, gameH;
  if (isLandscape) {
    gameH = meta.height;
    gameW = Math.round(gameH * 4 / 3);
    gameLeft = Math.round((meta.width - gameW) / 2);
    gameTop = 0;
  } else {
    gameW = meta.width;
    gameH = Math.round(gameW * 3 / 4);
    gameLeft = 0;
    gameTop = 0;
  }

  // Normalize to 1080x810
  const normalized = sharp('tmp/current-char-raw.png')
    .extract({ left: gameLeft, top: gameTop, width: gameW, height: gameH })
    .resize(1080, 810);

  const { data, info } = await normalized.clone().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;

  function getPixel(x, y) {
    const idx = (y * w + x) * ch;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
  }

  // Find solid golden border lines (popup signature)
  // Golden line color: ~(160-182, 153-174, 58-67) — olive/gold tone
  // A solid popup border will have ≥350 gold pixels across x=100-900 (sampling every 2px = 400 samples)
  const SOLID_THRESHOLD = 300;
  const solidGoldRows = [];
  for (let y = 0; y < h; y++) {
    let goldCount = 0;
    for (let x = 100; x < 900; x += 2) {
      const p = getPixel(x, y);
      if (p.r > 150 && p.g > 140 && p.b < 100 && p.r > p.b + 60 && p.g > p.b + 50) {
        goldCount++;
      }
    }
    if (goldCount >= SOLID_THRESHOLD) {
      solidGoldRows.push({ y, goldCount });
    }
  }

  console.log('Solid golden border rows:');
  for (const r of solidGoldRows) {
    console.log(`  y=${r.y}: gold=${r.goldCount}`);
  }

  // Group into clusters (top border and bottom border)
  const clusters = [];
  let cluster = [solidGoldRows[0]];
  for (let i = 1; i < solidGoldRows.length; i++) {
    if (solidGoldRows[i].y - solidGoldRows[i - 1].y <= 3) {
      cluster.push(solidGoldRows[i]);
    } else {
      clusters.push(cluster);
      cluster = [solidGoldRows[i]];
    }
  }
  if (cluster.length > 0) clusters.push(cluster);

  console.log(`\nFound ${clusters.length} border clusters:`);
  for (const c of clusters) {
    console.log(`  y=${c[0].y}-${c[c.length - 1].y} (${c.length} rows)`);
  }

  if (clusters.length >= 2) {
    const topBorder = clusters[0][0].y;
    const bottomBorder = clusters[clusters.length - 1][clusters[clusters.length - 1].length - 1].y;
    const popupCenter = (topBorder + bottomBorder) / 2;
    const isBottom = popupCenter > h / 2;
    console.log(`\nPopup: top=${topBorder} bottom=${bottomBorder} center=${popupCenter}`);
    console.log(`Position: ${isBottom ? 'BOTTOM' : 'TOP'}`);
    console.log(`Face Y (in 1080x810): ${topBorder + 14}`);
    console.log(`Original face Y was: 40`);
    console.log(`If popup were at top, border would be at: ${40 - 14} = 26`);

    // Save the top golden border strip as reference
    await normalized.clone()
      .extract({ left: 100, top: topBorder, width: 800, height: clusters[0].length })
      .toFile('tmp/popup-gold-border.png');
    console.log('\nSaved tmp/popup-gold-border.png');
  }
}

main().catch(console.error);
