-- V-A (D23, 2026-10-28): vazifa ixtiyoriy smeta qatoriga bog'lanadi (kartada reja, qabul qilingan hajm, sarf)
-- va rejadagi boshlanish sanasiga ega. Qator shu obyektniki bo'lishi shart (kompozit FK).
ALTER TABLE tasks ADD COLUMN estimate_line_id uuid, ADD COLUMN planned_start date;
ALTER TABLE tasks ADD CONSTRAINT tasks_estimate_line_fk FOREIGN KEY(tenant_id,project_id,estimate_line_id) REFERENCES estimate_lines(tenant_id,project_id,id);
CREATE INDEX tasks_estimate_line ON tasks(tenant_id,estimate_line_id) WHERE estimate_line_id IS NOT NULL;
