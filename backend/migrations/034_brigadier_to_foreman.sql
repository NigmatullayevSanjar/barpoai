-- Egasi qarori (2026-11-23): brigadir roli olib tashlanadi. Mavjud brigadirlar prorab bo'ladi; ularning qo'lidagi
-- material hisobi (custody) o'zlarida qoladi. Omborchi materialni prorabga chiqim qiladi, prorab qabul qiladi va
-- o'zi sarf qiladi. Har bir prorab biriktirilgan obyektida shaxsiy material hisobi ochiladi.
-- Rol cheklovlari keyingi migratsiyada (UPDATE va ALTER TABLE bir faylda emas).
UPDATE users SET role = 'foreman' WHERE role = 'brigadier';
DELETE FROM role_page_permissions WHERE role = 'brigadier';
INSERT INTO stock_accounts(tenant_id, project_id, custodian_id)
SELECT a.tenant_id, a.project_id, a.user_id
FROM project_assignments a JOIN users u ON u.tenant_id = a.tenant_id AND u.id = a.user_id
WHERE u.role = 'foreman'
ON CONFLICT DO NOTHING;
