-- Brigadir roli endi yo'q (2026-11-23, 034 dan keyin): rol ro'yxatlaridan chiqariladi.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('super_admin','platform_owner','support','tenant_admin','foreman','warehouse_manager','financier','accountant','manager'));
ALTER TABLE role_page_permissions DROP CONSTRAINT role_page_permissions_role_check;
ALTER TABLE role_page_permissions ADD CONSTRAINT role_page_permissions_role_check CHECK(role IN ('foreman','warehouse_manager','financier','accountant','manager'));
