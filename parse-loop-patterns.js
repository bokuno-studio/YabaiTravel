import fs from 'fs';
import path from 'path';

const logsDir = '/tmp';
const logFiles = fs.readdirSync(logsDir)
  .filter(f => f.match(/enrich-loop-20260330-15\d{4}\.log/))
  .sort();

console.log('=== PATTERN ANALYSIS ACROSS ALL 9 LOOPS ===\n');

const allResults = [];
let loopNum = 0;

for (const file of logFiles) {
  loopNum++;
  const content = fs.readFileSync(path.join(logsDir, file), 'utf-8');
  const lines = content.split('\n');

  let currentRace = null;
  let currentCategory = null;
  let status = null;
  let hasError403 = false;
  let hasFetchFailed = false;
  let hasTavily1 = false;
  let hasTavily2 = false;
  let isMissingEntryFee = false;
  let currencyWarn = false;
  let distanceParse = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for HTML fetch errors
    if (line.includes('[html-fetch] WARN')) {
      const match = line.match(/WARN (.+?) \|/);
      currentRace = match ? match[1].trim() : null;

      if (line.includes('403')) {
        hasError403 = true;
        hasFetchFailed = false;
      } else if (line.includes('fetch failed')) {
        hasFetchFailed = true;
        hasError403 = false;
      }
    }

    // Track Tavily
    if (line.includes('[tavily-1]')) {
      hasTavily1 = true;
    }
    if (line.includes('[tavily-2]')) {
      hasTavily2 = true;
    }
    if (line.includes('[tavily-2]') && line.includes('missing: entry_fee')) {
      isMissingEntryFee = true;
    }

    // Track currency
    if (line.includes('[currency-warn]')) {
      currencyWarn = true;
    }

    // Track distance parsing
    if (line.includes('[dist-parse]')) {
      distanceParse = true;
    }

    // Capture OK result
    if (line.match(/^\s+OK\s+(.+)/)) {
      const match = line.match(/OK\s+(.+)/);
      status = 'OK';
      currentCategory = match[1].trim();

      const result = {
        loop: loopNum,
        race: currentRace || currentCategory.split('/')[0],
        category: currentCategory,
        status: 'OK',
        html403: hasError403,
        fetchFailed: hasFetchFailed,
        tavily1: hasTavily1,
        tavily2: hasTavily2,
        missingEntryFee: isMissingEntryFee,
        currencyWarn: currencyWarn,
        distanceParse: distanceParse,
      };
      allResults.push(result);

      // Reset
      hasError403 = false;
      hasFetchFailed = false;
      hasTavily1 = false;
      hasTavily2 = false;
      isMissingEntryFee = false;
      currencyWarn = false;
      distanceParse = false;
      currentRace = null;
    }

    // Capture ERR result
    if (line.match(/^\s+ERR\s+(.+)/)) {
      const match = line.match(/ERR\s+(.+)/);
      status = 'ERR';
      currentCategory = match[1].trim();

      const result = {
        loop: loopNum,
        race: currentRace || currentCategory.split('/')[0],
        category: currentCategory,
        status: 'ERR',
        html403: hasError403,
        fetchFailed: hasFetchFailed,
        tavily1: hasTavily1,
        tavily2: hasTavily2,
        missingEntryFee: isMissingEntryFee,
        currencyWarn: currencyWarn,
        distanceParse: distanceParse,
      };
      allResults.push(result);

      // Reset
      hasError403 = false;
      hasFetchFailed = false;
      hasTavily1 = false;
      hasTavily2 = false;
      isMissingEntryFee = false;
      currencyWarn = false;
      distanceParse = false;
      currentRace = null;
    }
  }
}

// Analyze patterns
console.log(`Total results processed: ${allResults.length}\n`);

const okCount = allResults.filter(r => r.status === 'OK').length;
const errCount = allResults.filter(r => r.status === 'ERR').length;
console.log(`OK: ${okCount} / ERR: ${errCount} (${((okCount / allResults.length) * 100).toFixed(1)}% success)\n`);

// Pattern analysis
console.log('### OK Results Patterns\n');
const okResults = allResults.filter(r => r.status === 'OK');
console.log(`Total OK: ${okResults.length}\n`);

console.log('| Source | Count |');
console.log('|--------|-------|');
const htmlDirect = okResults.filter(r => !r.tavily1 && !r.tavily2 && !r.html403 && !r.fetchFailed);
console.log(`| HTML direct | ${htmlDirect.length} |`);
const tavily1 = okResults.filter(r => r.tavily1 && !r.tavily2);
console.log(`| Tavily Stage 1 only | ${tavily1.length} |`);
const tavily2 = okResults.filter(r => r.tavily2);
console.log(`| Tavily Stage 2 | ${tavily2.length} |`);
const html403rescued = okResults.filter(r => r.html403 && (r.tavily1 || r.tavily2));
console.log(`| HTML 403 → Tavily rescued | ${html403rescued.length} |`);
const fetchFailedRescued = okResults.filter(r => r.fetchFailed && (r.tavily1 || r.tavily2));
console.log(`| fetch failed → Tavily rescued | ${fetchFailedRescued.length} |`);

console.log('\nCurrency correction in OK results:', okResults.filter(r => r.currencyWarn).length);

console.log('\n### ERR Results Patterns\n');
const errResults = allResults.filter(r => r.status === 'ERR');
console.log(`Total ERR: ${errResults.length}\n`);

const html403err = errResults.filter(r => r.html403);
const fetchFailedErr = errResults.filter(r => r.fetchFailed);
const tavily2butNoFee = errResults.filter(r => r.tavily2 && r.missingEntryFee);
const noTavily = errResults.filter(r => !r.tavily1 && !r.tavily2);

console.log('| Failure Type | Count |');
console.log('|--------------|-------|');
console.log(`| HTML 403 (not rescued) | ${html403err.length} |`);
console.log(`| fetch failed (not rescued) | ${fetchFailedErr.length} |`);
console.log(`| Tavily Stage 2 passed but no entry_fee | ${tavily2butNoFee.length} |`);
console.log(`| No Tavily fallback used | ${noTavily.length} |`);

console.log('\n### Recurring Failures\n');
const errByRace = {};
for (const result of errResults) {
  const key = result.race;
  if (!errByRace[key]) {
    errByRace[key] = 0;
  }
  errByRace[key]++;
}

console.log('| Race Name | Failure Count |');
console.log('|-----------|----------------|');
for (const [race, count] of Object.entries(errByRace)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)) {
  if (count >= 2) {
    console.log(`| ${race.substring(0, 30)} | ${count} |`);
  }
}

console.log('\n### Success Rate Trends by Loop\n');
console.log('| Loop | OK | ERR | Rate |');
console.log('|------|----|----|------|');
for (let i = 1; i <= 9; i++) {
  const loopResults = allResults.filter(r => r.loop === i);
  const loopOk = loopResults.filter(r => r.status === 'OK').length;
  const loopErr = loopResults.filter(r => r.status === 'ERR').length;
  const rate = loopOk + loopErr > 0 ? ((loopOk / (loopOk + loopErr)) * 100).toFixed(0) : 0;
  console.log(`| #${i} | ${loopOk} | ${loopErr} | ${rate}% |`);
}
