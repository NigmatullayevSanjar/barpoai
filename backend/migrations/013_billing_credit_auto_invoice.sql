-- 10-bosqich: avtomatik 30 kunlik invoys va ortiqcha to'lov krediti.
-- Kredit ledgeri append-only: musbat — kompaniya foydasiga qoldiq (ortiqcha to'lov, qo'lda kredit), manfiy — invoysga qo'llangan.
CREATE TABLE billing_credits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 kind text NOT NULL CHECK(kind IN ('overpayment','applied','manual')), amount numeric(20,2) NOT NULL CHECK(amount<>0),
 entry_id uuid REFERENCES billing_entries(id), invoice_id uuid, note text NOT NULL,
 created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,invoice_id) REFERENCES billing_invoices(tenant_id,id),
 CHECK((kind='applied') = (amount<0))
);
CREATE INDEX billing_credits_tenant_idx ON billing_credits(tenant_id, created_at);
-- Tizim (worker) yozadigan kredit qo'llash yozuvlari uchun created_by ixtiyoriy.
ALTER TABLE billing_entries ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE billing_invoices ADD COLUMN source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','auto'));
