import fs from 'fs';
import path from 'path';

const logsDir = '/tmp';
const logFiles = fs.readdirSync(logsDir)
  .filter(f => f.match(/enrich-loop-20260330-\d{6}\.log/))
  .sort();

console.log('=== DETAILED PATTERN ANALYSIS (ALL LOOPS) ===\n');

const allItems = [];
let loopNum = 0;

for (const file of logFiles) {
  loopNum++;
  const content = fs.readFileSync(path.join(logsDir, file), 'utf-8');
  const lines = content.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Look for race entries (marked by [html-fetch] WARN or other markers)
    let raceName = null;
    let status = null;
    let source = null;
    let raceType = 'Other';
    let fetchPath = [];
    let htmlError = null;
    let entryFeeStatus = 'unknown';

    // Collect context for this item
    let j = i;
    let itemLines = [];
    while (j < lines.length) {
      itemLines.push(lines[j]);
      if (lines[j].match(/^\s+(OK|ERR)\s+/)) {
        j++;
        break;
      }
      j++;
    }

    const itemText = itemLines.join('\n');

    // Extract race name
    if (itemText.includes('[html-fetch] WARN')) {
      const m = itemText.match(/\[html-fetch\] WARN (.+?) \|/);
      if (m) raceName = m[1].trim();
    }

    // Extract status
    const okMatch = itemText.match(/^\s+OK\s+(.+)/m);
    const errMatch = itemText.match(/^\s+ERR\s+(.+)/m);
    if (okMatch) {
      status = 'OK';
    } else if (errMatch) {
      status = 'ERR';
    }

    // Determine fetch path
    if (itemText.includes('[html-fetch] WARN')) {
      if (itemText.includes('403')) {
        htmlError = '403';
      } else if (itemText.includes('fetch failed')) {
        htmlError = 'fetch failed';
      }
    }
    if (itemText.includes('[tavily-1]')) {
      fetchPath.push('tavily1');
    }
    if (itemText.includes('[tavily-2]')) {
      fetchPath.push('tavily2');
    }
    if (itemText.includes('missing: entry_fee')) {
      entryFeeStatus = 'missing';
    }

    // Determine race type
    const nameText = (raceName || okMatch?.[1] || errMatch?.[1] || '').toLowerCase();
    if (nameText.includes('backyard')) {
      raceType = 'Backyard Ultra';
    } else if (nameText.includes('hyrox')) {
      raceType = 'HYROX';
    } else if (nameText.includes('marathon')) {
      raceType = 'Marathon';
    } else if (nameText.includes('ultra')) {
      raceType = 'Ultra Marathon';
    } else if (nameText.includes('trail') || nameText.includes('trailrun')) {
      raceType = 'Trail';
    } else if (nameText.includes('ocr') || nameText.includes('tough mudder') || nameText.includes('spartan')) {
      raceType = 'OCR';
    }

    if (status && raceName) {
      allItems.push({
        loop: loopNum,
        race: raceName,
        status: status,
        htmlError: htmlError,
        fetchPath: fetchPath,
        raceType: raceType,
        entryFeeStatus: entryFeeStatus,
        fullLine: okMatch?.[0] || errMatch?.[0],
      });
    }

    i = j;
  }
}

console.log(`Total items: ${allItems.length}\n`);

// Summary
const okItems = allItems.filter(x => x.status === 'OK');
const errItems = allItems.filter(x => x.status === 'ERR');
console.log(`OK: ${okItems.length} / ERR: ${errItems.length}\n`);

// OK patterns
console.log('=== OK PATTERNS (成功事例) ===\n');

const okByFetchPath = {};
for (const item of okItems) {
  const key = item.htmlError
    ? `${item.htmlError} → ${item.fetchPath.join('→') || 'none'}`
    : item.fetchPath.length > 0
    ? `Tavily: ${item.fetchPath.join('→')}`
    : 'HTML direct';

  if (!okByFetchPath[key]) okByFetchPath[key] = [];
  okByFetchPath[key].push(item);
}

console.log('## By Fetch Source\n');
for (const [source, items] of Object.entries(okByFetchPath)
  .sort((a, b) => b[1].length - a[1].length)) {
  console.log(`### ${source} (${items.length})`);
  for (const item of items.slice(0, 3)) {
    console.log(`  - Loop #${item.loop}: ${item.race} [${item.raceType}]`);
  }
  console.log();
}

console.log('\n## By Race Type\n');
const okByType = {};
for (const item of okItems) {
  if (!okByType[item.raceType]) okByType[item.raceType] = [];
  okByType[item.raceType].push(item);
}

for (const [type, items] of Object.entries(okByType)
  .sort((a, b) => b[1].length - a[1].length)) {
  console.log(`### ${type} (${items.length}/${allItems.filter(x => x.raceType === type).length})`);
  for (const item of items.slice(0, 2)) {
    console.log(`  - Loop #${item.loop}: ${item.race}`);
  }
  console.log();
}

// ERR patterns
console.log('\n=== ERR PATTERNS (失敗事例) ===\n');

const errByReason = {};
for (const item of errItems) {
  let reason;
  if (item.htmlError === '403') {
    reason = 'HTML 403';
  } else if (item.htmlError === 'fetch failed') {
    reason = 'fetch failed';
  } else if (item.entryFeeStatus === 'missing' && item.fetchPath.includes('tavily2')) {
    reason = 'Tavily両段 → entry_fee なし';
  } else {
    reason = 'Other';
  }

  if (!errByReason[reason]) errByReason[reason] = [];
  errByReason[reason].push(item);
}

console.log('## By Failure Reason\n');
for (const [reason, items] of Object.entries(errByReason)
  .sort((a, b) => b[1].length - a[1].length)) {
  console.log(`### ${reason} (${items.length})`);
  for (const item of items.slice(0, 3)) {
    console.log(`  - Loop #${item.loop}: ${item.race} [${item.raceType}]`);
  }
  console.log();
}

console.log('\n## By Race Type\n');
const errByType = {};
for (const item of errItems) {
  if (!errByType[item.raceType]) errByType[item.raceType] = [];
  errByType[item.raceType].push(item);
}

for (const [type, items] of Object.entries(errByType)
  .sort((a, b) => b[1].length - a[1].length)) {
  const totalOfType = allItems.filter(x => x.raceType === type).length;
  const successOfType = okItems.filter(x => x.raceType === type).length;
  const rate = ((successOfType / totalOfType) * 100).toFixed(0);
  console.log(`### ${type}: ${successOfType}/${totalOfType} OK (${rate}%)`);
  for (const item of items.slice(0, 2)) {
    console.log(`  - Loop #${item.loop}: ${item.race}`);
  }
  console.log();
}

// Recurring failures
console.log('\n=== RECURRING FAILURES (繰り返し失敗) ===\n');
const failuresByRace = {};
for (const item of errItems) {
  if (!failuresByRace[item.race]) failuresByRace[item.race] = [];
  failuresByRace[item.race].push(item.loop);
}

const recurring = Object.entries(failuresByRace)
  .filter(([_, loops]) => loops.length >= 2)
  .sort((a, b) => b[1].length - a[1].length);

for (const [race, loops] of recurring) {
  console.log(`- ${race}: ${loops.length}回失敗 (Loops: ${loops.join(', ')})`);
}
