-- Telefon orqali login: E.164 ko'rinishida normalizatsiya qilingan, global unique.
ALTER TABLE users ADD COLUMN phone text UNIQUE CHECK (phone ~ '^\+998[0-9]{9}$');

-- Telegram ulash: bir martalik, qisqa muddatli, hash holida saqlanadigan token.
CREATE TABLE telegram_link_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_link_tokens_user ON telegram_link_tokens(user_id) WHERE used_at IS NULL;

-- Bir foydalanuvchi = bitta faol Telegram akkaunt; bitta Telegram akkaunt = bitta foydalanuvchi.
CREATE TABLE telegram_accounts (
 user_id uuid PRIMARY KEY REFERENCES users(id), telegram_user_id text NOT NULL UNIQUE CHECK (telegram_user_id ~ '^[0-9]{1,20}$'),
 telegram_username text, telegram_first_name text, telegram_last_name text,
 chat_state jsonb NOT NULL DEFAULT '{}', linked_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz
);
INSERT INTO telegram_accounts(user_id,telegram_user_id) SELECT id,telegram_id FROM users WHERE telegram_id IS NOT NULL;
ALTER TABLE users DROP COLUMN telegram_id;

-- Telegram bot long-polling offset (bitta qator).
CREATE TABLE telegram_bot_state (id boolean PRIMARY KEY DEFAULT true CHECK(id), update_offset bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO telegram_bot_state DEFAULT VALUES;

-- Ilova ichidagi bildirishnomalar markazi. Platforma xodimlari uchun tenant_id NULL.
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
 project_id uuid, kind text NOT NULL, title text NOT NULL, body text NOT NULL, payload jsonb NOT NULL DEFAULT '{}',
 read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
);
CREATE INDEX notifications_user ON notifications(user_id,created_at DESC) ;
CREATE INDEX notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications
 USING (tenant_id IS NULL OR tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id IS NULL OR tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

-- Outbox: platforma xodimlariga ham yetkazish uchun tenant_id ixtiyoriy bo'ladi.
ALTER TABLE outbox ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE outbox DROP CONSTRAINT outbox_tenant_id_recipient_id_fkey;
ALTER TABLE outbox ADD CONSTRAINT outbox_recipient_fk FOREIGN KEY(recipient_id) REFERENCES users(id);
DROP POLICY tenant_isolation ON outbox;
CREATE POLICY tenant_isolation ON outbox
 USING (tenant_id IS NULL OR tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id IS NULL OR tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE outbox DROP CONSTRAINT outbox_tenant_id_dedup_key_key;
CREATE UNIQUE INDEX outbox_dedup ON outbox(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),dedup_key);

-- Sessiya kanali: brauzer cookie yoki Bearer. Audit uchun saqlanadi.
ALTER TABLE sessions ADD COLUMN channel text NOT NULL DEFAULT 'bearer' CHECK (channel IN ('bearer','cookie'));
