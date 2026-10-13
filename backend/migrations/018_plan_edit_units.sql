-- Tariflar tahrirlanadi (egasi qarori, 2026-10-12): narx va limit o'zgarishi keyingi invoysdan qo'llanadi,
-- chiqarilgan invoys o'z summasini saqlaydi. O'chirish taqiqligicha qoladi (invoys va obunalar bog'langan).
DROP TRIGGER immutable ON plan_versions;
CREATE TRIGGER immutable BEFORE DELETE ON plan_versions FOR EACH ROW EXECUTE FUNCTION reject_mutation();
-- Smeta importidagi "kompl." / "комплект" uchun birlik.
INSERT INTO units VALUES ('set','Komplekt','count') ON CONFLICT (id) DO NOTHING;
