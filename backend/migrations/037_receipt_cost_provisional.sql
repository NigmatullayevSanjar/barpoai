-- Omborchi kirimda narx yozmaydi (egasi, 2026-11-23): narxsiz kirim taxminiy tannarx (smeta narxi yoki oxirgi kirim
-- narxi) bilan yoziladi; haqiqiy narxni buxgalter yetkazuvchi invoysini bog'laganda beradi.
ALTER TABLE stock_commands ADD COLUMN cost_provisional boolean NOT NULL DEFAULT false;
