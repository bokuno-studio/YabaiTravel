-- public スキーマに events ビューを作成（PostgREST の schema cache エラー回避）
-- yabai_travel.events を public から参照可能にする

CREATE OR REPLACE VIEW public.events AS
SELECT * FROM yabai_travel.events;

GRANT SELECT ON public.events TO anon;
