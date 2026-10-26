-- Platforma rollari ruxsatlari (egasi qarori D21, 2026-10-22). Standart qiymatlar kodda (platform-permissions.ts);
-- bu jadvalda faqat sahifadan o'zgartirilgan qiymatlar turadi. Platforma egasining ruxsatlari o'zgarmaydi (jadvalda yo'q).
CREATE TABLE platform_role_permissions (
 role text NOT NULL CHECK(role IN ('super_admin','support')),
 permission text NOT NULL,
 allowed boolean NOT NULL,
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(role, permission)
);
-- Umumiy audit sahifasi: platforma va barcha kompaniyalar yozuvlari sana bo'yicha.
CREATE INDEX audit_created ON audit_events(created_at DESC, id);
