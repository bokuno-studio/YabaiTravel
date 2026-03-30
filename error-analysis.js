import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hrzaxlwkxfjkgwyzb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyemF4bHdreGZqa2d3eXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDM4MjAwMDAsImV4cCI6MTczNTM1NjAwMH0.z3v3BN4LuBp5dKUNQmZlR3KqPqVD5xK6F5p5cN5lK4I';

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeErrors() {
  // First, get all categories that had attempt_count > 0 and had errors in last_error_type in last 30 minutes
  // Looking at recently modified categories (collected_at within last hour)
  
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { data: errorCategories, error: catError } = await supabase
    .from('categories')
    .select('id, name, event_id, entry_fee, start_time, elevation_gain, last_error_type, last_error_message, attempt_count')
    .neq('last_error_type', null)
    .gt('collected_at', oneHourAgo)
    .order('event_id');
  
  if (catError) {
    console.error('Error fetching error categories:', catError);
    process.exit(1);
  }
  
  console.log(`Found ${errorCategories.length} categories with errors in last hour`);
  
  // Group by event_id and get event details
  const eventIds = [...new Set(errorCategories.map(c => c.event_id))];
  const results = [];
  
  for (const eventId of eventIds) {
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, name, official_url')
      .eq('id', eventId)
      .single();
    
    if (eventError || !event) {
      console.log(`Event not found: ${eventId}`);
      continue;
    }
    
    const eventCats = errorCategories.filter(c => c.event_id === eventId);
    
    let domain = 'other';
    if (event.official_url) {
      if (event.official_url.includes('wix')) domain = 'wix';
      else if (event.official_url.includes('born2run')) domain = 'born2run';
      else if (event.official_url.includes('runnet')) domain = 'runnet';
      else if (event.official_url.includes('.gov')) domain = 'gov';
      else if (event.official_url.includes('.jp')) domain = 'jp';
      else {
        try {
          const urlObj = new URL(event.official_url);
          domain = urlObj.hostname;
        } catch (e) {
          domain = 'parse-error';
        }
      }
    }
    
    const existingFeeCount = eventCats.filter(c => c.entry_fee !== null).length;
    const existingTimeCount = eventCats.filter(c => c.start_time !== null).length;
    const existingElevCount = eventCats.filter(c => c.elevation_gain !== null).length;
    
    results.push({
      event_name: event.name,
      event_id: eventId,
      official_url: event.official_url,
      domain,
      total_error_cats: eventCats.length,
      existing_entry_fee: existingFeeCount,
      existing_start_time: existingTimeCount,
      existing_elevation_gain: existingElevCount,
      error_types: [...new Set(eventCats.map(c => c.last_error_type))]
    });
  }
  
  const byDomain = {};
  for (const r of results) {
    if (!byDomain[r.domain]) byDomain[r.domain] = [];
    byDomain[r.domain].push(r);
  }
  
  console.log('\n=== QUESTION 1: Domain/Source Breakdown of 17 Errors ===\n');
  console.log('| Domain | Error Count | Events |');
  console.log('|--------|-------------|--------|');
  
  for (const [domain, events] of Object.entries(byDomain).sort((a, b) => b[1].length - a[1].length)) {
    const eventList = events.map(e => `${e.event_name.substring(0, 30)}`).join(', ');
    console.log(`| ${domain} | ${events.length} | ${eventList} |`);
  }
  
  console.log('\n=== QUESTION 2: Field-by-Field Breakdown (17 Error Categories) ===\n');
  console.log('| Event Name | Error Cats | Existing entry_fee | Existing start_time | Existing elevation | Error Types |');
  console.log('|---|---|---|---|---|---|');
  
  for (const r of results.sort((a, b) => a.event_name.localeCompare(b.event_name))) {
    const errorTypes = r.error_types.join(', ');
    console.log(`| ${r.event_name.substring(0, 40)} | ${r.total_error_cats} | ${r.existing_entry_fee} | ${r.existing_start_time} | ${r.existing_elevation_gain} | ${errorTypes} |`);
  }
  
  process.exit(0);
}

analyzeErrors().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
