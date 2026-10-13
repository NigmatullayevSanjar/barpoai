-- Ikki bosqichli kirish (egasi qarori, 2026-10-13): platforma egasi va super admin uchun Telegram orqali 6 xonali kod.
-- Parol to'g'ri bo'lgach kod yoziladi (hash), 5 daqiqa amal qiladi, 5 marta xato — bekor. Sessiya faqat kod tasdiqlangach.
CREATE TABLE login_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 challenge_hash text NOT NULL UNIQUE, code_hash text NOT NULL, channel text NOT NULL CHECK(channel IN ('bearer','cookie')),
 attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_codes_user ON login_codes(user_id) WHERE used_at IS NULL;
-- Platforma auditi sahifasi uchun: tenant'siz yozuvlar va platforma xodimlari amallari sana bo'yicha.
CREATE INDEX audit_platform ON audit_events(created_at DESC, id) WHERE tenant_id IS NULL;
