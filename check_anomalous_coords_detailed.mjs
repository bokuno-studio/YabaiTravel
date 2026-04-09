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
  console.log("=== 詳細異常座標調査開始 ===\n");

  // 日本に絞って調査: location が日本関連かつ座標が異常なケース
  console.log("1️⃣ 日本イベント（location）を確認...");
  const { data: japanEvents, error: japanError } = await supabase
    .from("events")
    .select("id, name, latitude, longitude, location, country")
    .ilike("location", "%日本%")
    .limit(100);

  if (japanError) {
    console.error("ERROR:", japanError.message);
  } else {
    console.log(`✅ location='%日本%' マッチ: ${japanEvents?.length || 0} 件`);
    if (japanEvents && japanEvents.length > 0) {
      console.log("\n📍 日本イベントサンプル（最大20件）:");
      japanEvents.slice(0, 20).forEach((event, idx) => {
        console.log(
          `   [${idx + 1}] 名前=${event.name.substring(0, 40)}, 緯度=${event.latitude}, 経度=${event.longitude}, 地域=${event.location?.substring(0, 30)}`
        );
      });
    }
  }

  // country フィールドをチェック
  console.log("\n2️⃣ 日本（country='Japan'）のイベント...");
  const { data: jpCountry, error: jpCountryError } = await supabase
    .from("events")
    .select("id, name, latitude, longitude, location, country")
    .eq("country", "Japan")
    .limit(100);

  if (jpCountryError) {
    console.error("ERROR:", jpCountryError.message);
  } else {
    console.log(`✅ country='Japan': ${jpCountry?.length || 0} 件`);
    if (jpCountry && jpCountry.length > 0) {
      // 座標が日本範囲外のものを確認
      const outOfRange = jpCountry.filter(
        (e) =>
          e.latitude < 24 ||
          e.latitude > 45 ||
          e.longitude < 122 ||
          e.longitude > 145
      );
      console.log(`   → 座標が日本範囲（24-45N, 122-145E）外: ${outOfRange.length} 件`);
      if (outOfRange.length > 0) {
        console.log("\n   📍 異常座標サンプル:");
        outOfRange.slice(0, 10).forEach((event, idx) => {
          console.log(
            `      [${idx + 1}] 名前=${event.name.substring(0, 40)}, 緯度=${event.latitude}, 経度=${event.longitude}`
          );
        });
      }
    }
  }

  // NULL座標の詳細
  console.log("\n3️⃣ NULL座標のイベント詳細...");
  const { data: nullEvents, error: nullError } = await supabase
    .from("events")
    .select("id, name, location, country")
    .or("latitude.is.null,longitude.is.null")
    .limit(50);

  if (nullError) {
    console.error("ERROR:", nullError.message);
  } else {
    console.log(`✅ NULL座標: ${nullEvents?.length || 0} 件（表示: 最大50件）`);
    if (nullEvents && nullEvents.length > 0) {
      const japanNulls = nullEvents.filter((e) =>
        e.location?.includes("日本")
      );
      console.log(`   → そのうち日本イベント: ${japanNulls.length} 件`);
      if (japanNulls.length > 0) {
        console.log("\n   📍 日本でNULL座標のイベント:");
        japanNulls.slice(0, 10).forEach((event, idx) => {
          console.log(
            `      [${idx + 1}] 名前=${event.name.substring(0, 40)}, 地域=${event.location?.substring(0, 40)}`
          );
        });
      }
    }
  }

  // 統計サマリー
  console.log("\n=== サマリー ===");
  const { count: totalCount } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true });

  const { count: nullCount } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .or("latitude.is.null,longitude.is.null");

  const { count: filledCount } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  console.log(`📊 全イベント: ${totalCount} 件`);
  console.log(`   • 座標充填: ${filledCount} 件 (${((filledCount / totalCount) * 100).toFixed(2)}%)`);
  console.log(`   • 座標NULL: ${nullCount} 件 (${((nullCount / totalCount) * 100).toFixed(2)}%)`);
}

checkAnomalousCoords().catch(console.error);
