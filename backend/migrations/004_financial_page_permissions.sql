ALTER TABLE role_page_permissions DROP CONSTRAINT role_page_permissions_page_check;
ALTER TABLE role_page_permissions ADD CONSTRAINT role_page_permissions_page_check CHECK(page IN (
 'dashboard','projects','employees','estimates','stock','finance','tasks','reports','files','integrations','camera','billing','settings','permissions','audit',
 'accounting_documents','invoices','bank_cash','counterparties','payroll','reconciliation','financial_reports','allocations','budgets','plan_actual','forecast','payment_requests','payment_calendar'
));
