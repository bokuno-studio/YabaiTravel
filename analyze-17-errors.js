import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hrzaxlwkxfjkgwyzb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemF4bHdreGZqa2d3eXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDM4MjAwMDAsImV4cCI6MTczNTM1NjAwMH0.z3v3BN4LuBp5dKUNQmZlR3KqPqVD5xK6F5p5cN5lK4I';

const supabase = createClient(supabaseUrl, supabaseKey);

// From the log file - exact event names and categories
const errorItems = [
  { event: 'オブスタクルボックス【忍者修行 体験キッズ最初の100人】', cat: '忍者修行体験' },
  { event: '16th Born to Run Ultra 4 days', cat: '4 Days' },
  { event: 'Festival de UltraFondo Burjass', cat: '48h' },
  { event: 'Southern Cross 24 Hour', cat: '24 Hour' },
  { event: 'Southern Cross 24 Hour', cat: '6 Hour' },
  { event: '6^ Cinisello Balsamo Running F', cat: '12h' },
  { event: '3rd Bad Ass Backyard Ultra', cat: 'Backyard Ultra' },
  { event: 'Broken Race', cat: '24 Hour Trail' },
  { event: 'Stay Hard! Dürnhart', cat: '12h Loop' },
  { event: '5th The Long Run - Spring Forw', cat: '6-hour Ultra' },
  { event: '2nd The Old Six Day', cat: 'Six Day (144 hours)' },
  { event: '2nd Backyard Ultra Guissona', cat: 'Backyard Ultra 28h' },
  { event: 'Trasna Na Blianta 24h', cat: '12h' },
  { event: 'Trasna Na Blianta 24h', cat: '6h' },
  { event: '15th Double Top 72 Hour Run', cat: '72 Hour' },
  { event: '11th RUN4Kids 24 Hour Race', cat: '24 Hour Race' },
  { event: '5th Banana Slug Backyard Ultra', cat: 'Backyard Ultra 54h' }
];

async function analyzeErrors() {
  const results = [];
  const domainCounts = {};
  
  for (let i = 0; i < errorItems.length; i++) {
    const item = errorItems[i];
    
    // Get all events and filter locally (more reliable than DB LIKE)
    const { data: allEvents } = await supabase
      .from('events')
      .select('id, name, official_url, location')
      .limit(1000);
    
    let matchedEvent = null;
    if (allEvents) {
      matchedEvent = allEvents.find(e => e.name === item.event);
      if (!matchedEvent) {
        matchedEvent = allEvents.find(e => e.name.includes(item.event.substring(0, 15)));
      }
    }
    
    if (!matchedEvent) {
      console.log(`Event not found: ${item.event}`);
      continue;
    }
    
    // Get category
    const { data: allCats } = await supabase
      .from('categories')
      .select('id, name, entry_fee, start_time, elevation_gain')
      .eq('event_id', matchedEvent.id)
      .limit(100);
    
    let matchedCat = null;
    if (allCats) {
      matchedCat = allCats.find(c => c.name === item.cat);
      if (!matchedCat) {
        matchedCat = allCats.find(c => c.name.includes(item.cat.substring(0, 10)));
      }
    }
    
    if (!matchedCat) {
      console.log(`Category not found: ${item.event} / ${item.cat}`);
      continue;
    }
    
    // Extract domain
    let domain = 'other';
    if (matchedEvent.official_url) {
      if (matchedEvent.official_url.includes('wix')) domain = 'wix';
      else if (matchedEvent.official_url.includes('born2run')) domain = 'born2run';
      else if (matchedEvent.official_url.includes('runnet')) domain = 'runnet';
      else if (matchedEvent.official_url.includes('.gov')) domain = 'gov';
      else if (matchedEvent.official_url.includes('.jp')) domain = '.jp';
      else {
        try {
          const urlObj = new URL(matchedEvent.official_url);
          domain = urlObj.hostname;
        } catch (e) {
          domain = 'parse-error';
        }
      }
    }
    
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    
    results.push({
      num: i + 1,
      event_name: matchedEvent.name,
      category_name: matchedCat.name,
      domain,
      official_url: matchedEvent.official_url,
      location: matchedEvent.location || 'N/A',
      entry_fee: matchedCat.entry_fee !== null ? `¥${matchedCat.entry_fee}` : 'NULL',
      start_time: matchedCat.start_time !== null ? '✓' : 'NULL',
      elevation_gain: matchedCat.elevation_gain !== null ? '✓' : 'NULL'
    });
  }
  
  console.log('\n## Question 1: エラーのドメイン・ソース分析\n');
  console.log('| ドメイン | エラー件数 |');
  console.log('|--------|----------|');
  
  for (const [domain, count] of Object.entries(domainCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`| ${domain} | ${count} |`);
  }
  
  console.log('\n## Question 2: 17件エラーの詳細（既存フィールド vs 未取得フィールド）\n');
  console.log('| # | イベント | カテゴリ | ドメイン | entry_fee | start_time | elevation |');
  console.log('|---|---------|---------|---------|-----------|-----------|--------|');
  
  for (const r of results) {
    const evName = r.event_name.substring(0, 25);
    const catName = r.category_name.substring(0, 18);
    console.log(`| ${r.num} | ${evName} | ${catName} | ${r.domain} | ${r.entry_fee} | ${r.start_time} | ${r.elevation_gain} |`);
  }
  
  process.exit(0);
}

analyzeErrors().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
