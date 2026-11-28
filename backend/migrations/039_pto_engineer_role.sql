-- D44 (2026-11-24): PTO injeneri roli (`pto_engineer`). Smetani import qiladi va tahrirlaydi, narxni va F-2/F-3
-- dalolatnomani ko'radi, ombor qoldig'ini ko'radi, hisobot yuboradi va tasdiqlaydi. Huquqlar `permissions.ts` da.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('super_admin','platform_owner','support','tenant_admin','foreman','warehouse_manager','financier','accountant','manager','pto_engineer'));
ALTER TABLE role_page_permissions DROP CONSTRAINT role_page_permissions_role_check;
ALTER TABLE role_page_permissions ADD CONSTRAINT role_page_permissions_role_check CHECK(role IN ('foreman','warehouse_manager','financier','accountant','manager','pto_engineer'));
