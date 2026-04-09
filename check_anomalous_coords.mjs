import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://wzkjnmowrlfgvkuzyiio.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2pubW93cmxmZ3ZrdXp5aWlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMTMwMjQsImV4cCI6MjA4Njc4OTAyNH0.O0WzsfZ2EEk0zBvsr0_jTceT9w1kerdP7gkPvQAy240";

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: "yabai_travel",
  },
});

async function checkAnomalousCoords() {
  console.log("=== 異常座標調査開始 ===\n");

  // 1. NULL座標の件数
  console.log("1️⃣ NULL座標の件数確認...");
  const { data: nullData, error: nullError, count: nullCount } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .or("latitude.is.null,longitude.is.null");

  if (nullError) {
    console.error("ERROR (NULL coords):", nullError.message);
  } else {
    console.log(`✅ NULL座標数: ${nullCount || 0} 件\n`);
  }

  // 2. 日本範囲外の座標（緯度20-50、経度120-155の範囲外）
  console.log("2️⃣ 日本範囲外の座標を検出...");
  const { data: outOfRangeData, error: outOfRangeError } = await supabase
    .from("events")
    .select("id, name, latitude, longitude, location")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .or("latitude.lt.20,latitude.gt.50,longitude.lt.120,longitude.gt.155");

  if (outOfRangeError) {
    console.error("ERROR (out of range):", outOfRangeError.message);
  } else {
    console.log(`✅ 日本範囲外: ${outOfRangeData?.length || 0} 件`);
    if (outOfRangeData && outOfRangeData.length > 0) {
      console.log("\n📍 範囲外座標サンプル（最大20件）:");
      outOfRangeData.slice(0, 20).forEach((event, idx) => {
        console.log(
          `   [${idx + 1}] ID=${event.id}, 名前=${event.name}, 緯度=${event.latitude}, 経度=${event.longitude}, 地域=${event.location}`
        );
      });
    }
    console.log("");
  }

  // 3. 全イベント数の確認
  console.log("3️⃣ 全イベント数確認...");
  const { count: totalCount, error: totalError } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true });

  if (totalError) {
    console.error("ERROR (total count):", totalError.message);
  } else {
    console.log(`✅ 全イベント数: ${totalCount} 件\n`);
  }

  // 4. 座標充填率
  const { data: filledData, count: filledCount, error: filledError } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (filledError) {
    console.error("ERROR (filled count):", filledError.message);
  } else {
    const filled = filledCount || 0;
    const total = totalCount || 0;
    const fillRate = total ? ((filled / total) * 100).toFixed(2) : 0;
    console.log(`✅ 座標充填率: ${filled}/${total} (${fillRate}%)\n`);
  }

  console.log("=== 調査完了 ===");
}

checkAnomalousCoords().catch(console.error);
