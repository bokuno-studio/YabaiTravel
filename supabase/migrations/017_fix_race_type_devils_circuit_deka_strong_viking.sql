-- #26: race_type の整理
-- Devils Circuit → devils_circuit
UPDATE yabai_travel.events
SET race_type = 'devils_circuit'
WHERE name ILIKE '%devils circuit%';

-- DEKA（Spartan 系）→ spartan
UPDATE yabai_travel.events
SET race_type = 'spartan'
WHERE name ILIKE '%deka%';

-- Strong Viking（strongviking.com ドメイン）→ strong_viking
UPDATE yabai_travel.events
SET race_type = 'strong_viking'
WHERE official_url ILIKE '%strongviking.com%'
   OR name ILIKE '%strong viking%';
