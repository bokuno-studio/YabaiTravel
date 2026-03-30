import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wzkjnmowrlfgvkuzyiio.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2pubW93cmxmZ3ZrdXp5aWlvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTIxMzAyNCwiZXhwIjoyMDg2Nzg5MDI0fQ.nQPlrDgnYL0uHYfm48BX6qCfBPKzaKc2EERfjweUd7g';

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: 'yabai_travel'
  }
});

async function checkColumns() {
  try {
    // 最初の1件取得してスキーマ確認
    const { data: sample, error } = await supabase
      .from('events')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    if (sample && sample.length > 0) {
      console.log('Columns in events table:');
      console.log(Object.keys(sample[0]).sort());
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkColumns();
