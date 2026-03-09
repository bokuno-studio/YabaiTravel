-- categories に通貨コードを追加（entry_fee は現地通貨の数値、currency で通貨を識別）

set search_path to yabai_travel, public;

alter table categories add column if not exists entry_fee_currency text;
