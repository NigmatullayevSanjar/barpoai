ALTER TABLE tasks ADD COLUMN archived_at timestamptz;
ALTER TABLE reports ADD COLUMN archived_at timestamptz;
ALTER TABLE files ADD COLUMN archived_at timestamptz;
ALTER TABLE stock_commands ADD CONSTRAINT stock_command_source_unique UNIQUE(tenant_id,id,material_id);
ALTER TABLE stock_ledger ADD CONSTRAINT ledger_material_source_fk FOREIGN KEY(tenant_id,command_id,material_id) REFERENCES stock_commands(tenant_id,id,material_id);
ALTER TABLE finance_documents ADD CONSTRAINT finance_project_source_unique UNIQUE(tenant_id,id,project_id);
ALTER TABLE stock_commands ADD CONSTRAINT stock_project_source_unique UNIQUE(tenant_id,id,project_id);
ALTER TABLE journal_entries ADD CONSTRAINT journal_finance_project_fk FOREIGN KEY(tenant_id,finance_document_id,project_id) REFERENCES finance_documents(tenant_id,id,project_id);
ALTER TABLE journal_entries ADD CONSTRAINT journal_stock_project_fk FOREIGN KEY(tenant_id,stock_command_id,project_id) REFERENCES stock_commands(tenant_id,id,project_id);
ALTER TABLE reports ADD CONSTRAINT report_project_unique UNIQUE(tenant_id,project_id,id);
ALTER TABLE files ADD CONSTRAINT file_report_project_fk FOREIGN KEY(tenant_id,project_id,report_id) REFERENCES reports(tenant_id,project_id,id);
CREATE FUNCTION check_month_sum() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t uuid; l uuid; planned numeric; allocated numeric; n integer;
BEGIN
 t=NEW.tenant_id;
 IF TG_TABLE_NAME='estimate_lines' THEN l=NEW.id; ELSE l=NEW.line_id; END IF;
 SELECT effective_quantity INTO planned FROM estimate_lines WHERE tenant_id=t AND id=l FOR UPDATE;
 SELECT count(*),sum(quantity) INTO n,allocated FROM estimate_months WHERE tenant_id=t AND line_id=l;
 IF n>0 AND allocated<>planned THEN RAISE EXCEPTION 'MONTH_QUANTITY_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER check_month_total AFTER INSERT OR UPDATE ON estimate_months DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_month_sum();
CREATE CONSTRAINT TRIGGER check_line_month_total AFTER INSERT OR UPDATE ON estimate_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_month_sum();
CREATE FUNCTION check_stock_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q numeric; v numeric; b stock_balances;
BEGIN
 SELECT coalesce(sum(quantity_delta),0),coalesce(sum(value_delta),0) INTO q,v FROM stock_ledger WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND material_id=NEW.material_id;
 SELECT * INTO b FROM stock_balances WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND material_id=NEW.material_id;
 IF b.quantity IS DISTINCT FROM q OR b.value IS DISTINCT FROM v THEN RAISE EXCEPTION 'STOCK_PROJECTION_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balance_matches_ledger AFTER INSERT OR UPDATE ON stock_balances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_projection();
CREATE CONSTRAINT TRIGGER ledger_matches_balance AFTER INSERT ON stock_ledger DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_projection();
CREATE FUNCTION protect_trial() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.trial_started_at IS NOT NULL AND (NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at) THEN RAISE EXCEPTION 'TRIAL_IMMUTABLE' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER trial_once BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION protect_trial();
CREATE INDEX tasks_scope ON tasks(tenant_id,project_id,assignee_id,status);
CREATE INDEX reports_scope ON reports(tenant_id,project_id,author_id,report_date);
CREATE INDEX estimates_scope ON estimates(tenant_id,project_id,created_at);
CREATE INDEX finance_scope ON finance_documents(tenant_id,project_id,document_date);
