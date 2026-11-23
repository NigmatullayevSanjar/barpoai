-- Brigadir va akkord yo'q (egasi, 2026-11-23): smeta qatori stavkasi va obyekt brigada foizi olib tashlanadi.
-- progress_entries.labor_rate, payroll_entries.piece_rate va progress_payroll tarix (yopilgan ish haqi) uchun qoladi.
ALTER TABLE estimate_lines DROP COLUMN labor_rate;
ALTER TABLE projects DROP COLUMN brigade_percent;
