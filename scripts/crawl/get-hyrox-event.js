import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function getHyroxEvent() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('categories')
    .select('id, name, event_id, official_url, events(id, name, official_url)')
    .eq('collected_at', null)
    .eq('last_error_type', 'partial')
    .ilike('official_url', '%hyrox.com%')
    .limit(1)
    .single();

  if (error) {
    console.error('Query error:', error.message);
    process.exit(1);
  }

  if (!data) {
    console.error('No Hyrox partial failure found');
    process.exit(1);
  }

  console.log(JSON.stringify({
    event_id: data.event_id,
    event_name: data.events?.name || 'Unknown',
    official_url: data.events?.official_url || 'Unknown'
  }, null, 2));
}

getHyroxEvent().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
