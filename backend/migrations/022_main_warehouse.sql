-- Egasi qarori (2026-10-16): har obyektning "Asosiy ombor"i bo'ladi. Yangi obyektda uni API yaratadi
-- (POST /v1/projects); ombori yo'q mavjud obyektlar (arxivlanganlar ham) uchun shu migratsiya yaratadi.
-- Har ombor uchun stock hisobi ham bo'lishi shart (stock_accounts.warehouse_id unikal).
INSERT INTO warehouses(tenant_id,project_id,name)
SELECT p.tenant_id,p.id,'Asosiy ombor' FROM projects p
WHERE NOT EXISTS(SELECT 1 FROM warehouses w WHERE w.tenant_id=p.tenant_id AND w.project_id=p.id);
INSERT INTO stock_accounts(tenant_id,project_id,warehouse_id)
SELECT w.tenant_id,w.project_id,w.id FROM warehouses w
WHERE NOT EXISTS(SELECT 1 FROM stock_accounts a WHERE a.tenant_id=w.tenant_id AND a.warehouse_id=w.id);
