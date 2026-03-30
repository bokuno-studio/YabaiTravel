import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wzkjnmowrlfgvkuzyiio.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2pubW93cmxmZ3ZrdXp5aWlvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTIxMzAyNCwiZXhwIjoyMDg2Nzg5MDI0fQ.nQPlrDgnYL0uHYfm48BX6qCfBPKzaKc2EERfjweUd7g';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  try {
    // yabai_travel スキーマのテーブル一覧取得
    const { data, error } = await supabase.rpc('get_tables');
    if (error) {
      console.log('RPC error, trying direct select...');
    }
    
    // 直接アクセス試行
    const { data: testData, error: testError } = await supabase
      .from('yabai_travel.events')
      .select('*', { count: 'exact', head: true });
    
    if (testError) {
      console.log('Trying another table name...');
      const { data: data2, error: error2 } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true });
      console.log('events table result:', data2 ? 'found' : error2?.message);
    } else {
      console.log('yabai_travel.events found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkSchema();
