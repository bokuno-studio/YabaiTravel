import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://wzkjnmowrlfgvkuzyiio.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6a2pubW93cmxmZ3ZrdXp5aWlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMTMwMjQsImV4cCI6MjA4Njc4OTAyNH0.O0WzsfZ2EEk0zBvsr0_jTceT9w1kerdP7gkPvQAy240";

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: "yabai_travel",
  },
});

async function verifyTargets() {
  console.log("=== 日本イベント修正対象確認 ===\n");

  // 日本bbox
  const JAPAN_BBOX = { lat_min: 24, lat_max: 46, lng_min: 122, lng_max: 154 };

  // backfill-latlng.js と同じロジック: NULL または bbox外の座標
  const { data: targets, error } = await supabase
    .from("events")
    .select("id, name, location, latitude, longitude, country")
    .not("location", "is", null)
    .or(
      `latitude.is.null,longitude.is.null,latitude.lt.${JAPAN_BBOX.lat_min},latitude.gt.${JAPAN_BBOX.lat_max},longitude.lt.${JAPAN_BBOX.lng_min},longitude.gt.${JAPAN_BBOX.lng_max}`
    );

  if (error) {
    console.error("ERROR:", error.message);
  } else {
    // 日本イベント（location に日本含む）でフィルタ
    const japanTargets = targets.filter((e) => e.location?.includes("日本"));
    console.log(`📊 backfill 対象全体: ${targets?.length || 0} 件`);
    console.log(`📊 そのうち日本イベント: ${japanTargets.length} 件\n`);

    if (japanTargets.length > 0) {
      console.log("🇯🇵 日本イベント修正対象リスト:");
      japanTargets.forEach((event, idx) => {
        const status = event.latitude === null || event.longitude === null ? "NULL" : "範囲外";
        console.log(
          `   [${idx + 1}] (${status}) 名前=${event.name?.substring(0, 40)}, 地域=${event.location?.substring(0, 40)}, country=${event.country}`
        );
      });
    }
  }
}

verifyTargets().catch(console.error);
