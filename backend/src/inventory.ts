import { type Db, type Row, one, audit } from './db.js';
import { accountScope, assignedUser, permit, projectScope } from './permissions.js';
import { dec, money, quantity } from './money.js';
import { invariant } from './errors.js';
import { notify, projectRecipients } from './notify.js';
export async function balances(db: Db, tenant: string, material: string, accounts: string[]) {
  for (const account of [...new Set(accounts)].sort()) {
    await db.query(
      'INSERT INTO stock_balances(tenant_id,account_id,material_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [tenant, account, material],
    );
    await one(
      db,
      'SELECT * FROM stock_balances WHERE tenant_id=$1 AND account_id=$2 AND material_id=$3 FOR UPDATE',
      [tenant, account, material],
    );
  }
}
async function balance(db: Db, tenant: string, account: string, material: string) {
  return one(
    db,
    'SELECT * FROM stock_balances WHERE tenant_id=$1 AND account_id=$2 AND material_id=$3',
    [tenant, account, material],
  );
}
export async function journal(
  db: Db,
  actor: Row,
  project: string,
  source: { stock?: string; finance?: string },
  entries: { account: string; amount: string; cash?: string | null; party?: string | null }[],
) {
  for (const entry of entries) {
    if (dec(entry.amount).isZero()) continue;
    await db.query(
      'INSERT INTO journal_entries(tenant_id,project_id,finance_document_id,stock_command_id,account,amount,cash_account_id,counterparty_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        actor.tenant_id,
        project,
        source.finance ?? null,
        source.stock ?? null,
        entry.account,
        entry.amount,
        entry.cash ?? null,
        entry.party ?? null,
      ],
    );
  }
}
async function ledger(
  db: Db,
  actor: Row,
  command: Row,
  account: string,
  qty: string,
  value: string,
  effect: string,
) {
  await db.query(
    'INSERT INTO stock_ledger(tenant_id,command_id,account_id,material_id,effect_key,quantity_delta,value_delta) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [actor.tenant_id, command.id, account, command.material_id, effect, qty, value],
  );
  const row = await one(
    db,
    'UPDATE stock_balances SET quantity=quantity+$4,value=value+$5 WHERE tenant_id=$1 AND account_id=$2 AND material_id=$3 RETURNING *',
    [actor.tenant_id, account, command.material_id, qty, value],
  );
  if (dec(row.quantity).minus(row.reserved).lt(row.minimum_quantity)) {
    // Ombor mudirlari (biriktirilgan) va tenant admin: ilova ichida + Telegram orqali.
    const info = await one(
      db,
      "SELECT m.name,m.unit_id,coalesce(w.name,'') warehouse,p.name project FROM materials m,stock_accounts a LEFT JOIN warehouses w ON w.id=a.warehouse_id JOIN projects p ON p.id=a.project_id WHERE m.id=$2 AND a.id=$1",
      [account, command.material_id],
    );
    const recipients = (
      await db.query(
        `SELECT u.id FROM users u WHERE u.tenant_id=$1 AND u.active AND (u.role='tenant_admin' OR EXISTS(
           SELECT 1 FROM stock_accounts a JOIN warehouse_assignments wa ON wa.tenant_id=a.tenant_id AND wa.warehouse_id=a.warehouse_id AND wa.user_id=u.id WHERE a.tenant_id=$1 AND a.id=$2))`,
        [actor.tenant_id, account],
      )
    ).rows;
    for (const user of recipients)
      await notify(db, {
        tenant_id: actor.tenant_id,
        user_id: user.id,
        project_id: command.project_id,
        kind: 'stock.low',
        title: '⚠️ Omborda material kamaydi',
        body: `Obyekt: ${info.project}\nOmbor: ${info.warehouse}\nMaterial: ${info.name}\nQoldiq: ${quantity(dec(row.quantity).minus(row.reserved))} ${info.unit_id}\nMinimum: ${quantity(row.minimum_quantity)} ${info.unit_id}`,
        payload: { account_id: account, material_id: command.material_id },
        dedup_key: `stock.low:${effect}:${account}:${user.id}`,
      });
  }
}
async function stockCost(db: Db, actor: Row, account: string, material: string, qty: string) {
  const row = await balance(db, actor.tenant_id, account, material);
  invariant(dec(row.quantity).gte(qty), 'INSUFFICIENT_STOCK');
  return dec(row.quantity).eq(qty) ? row.value : money(dec(row.value).div(row.quantity).mul(qty));
}
export async function createStock(db: Db, actor: Row, input: Row) {
  const kind = input.kind as string;
  await permit(
    db,
    actor,
    kind === 'transfer'
      ? 'stock.send'
      : kind === 'consumption' || kind === 'return'
        ? 'stock.consume'
        : 'stock.receive',
  );
  await projectScope(db, actor, input.project_id);
  const material = await one(
    db,
    'SELECT * FROM materials WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL',
    [actor.tenant_id, input.material_id],
  );
  const from = input.from_account_id ? await accountScope(db, actor, input.from_account_id) : null;
  const to = input.to_account_id ? await accountScope(db, actor, input.to_account_id, false) : null;
  invariant(
    (!from || from.project_id === input.project_id) && (!to || to.project_id === input.project_id),
    'ACCOUNT_PROJECT_MISMATCH',
  );
  if (kind === 'receipt' || kind === 'opening')
    invariant(
      !from && to?.warehouse_id && input.unit_cost !== undefined,
      'WAREHOUSE_RECEIPT_REQUIRED',
      400,
    );
  if (kind === 'transfer') {
    invariant(from?.warehouse_id && to?.custodian_id, 'WAREHOUSE_TO_CUSTODIAN_REQUIRED', 400);
    const user = await assignedUser(db, actor.tenant_id, input.project_id, to.custodian_id);
    invariant(user.role === 'brigadier', 'BRIGADIER_REQUIRED');
  }
  if (kind === 'consumption')
    invariant(from?.custodian_id && !to, 'CUSTODY_CONSUMPTION_REQUIRED', 400);
  if (kind === 'return')
    invariant(from?.custodian_id && to?.warehouse_id, 'CUSTODY_RETURN_REQUIRED', 400);
  if (input.estimate_line_id) {
    const line = await one(
      db,
      'SELECT * FROM estimate_lines WHERE tenant_id=$1 AND id=$2 AND project_id=$3 AND archived_at IS NULL',
      [actor.tenant_id, input.estimate_line_id, input.project_id],
    );
    invariant(
      line.material_id === material.id && line.unit_id === material.unit_id,
      'ESTIMATE_MATERIAL_MISMATCH',
    );
  }
  await balances(db, actor.tenant_id, input.material_id, [from?.id, to?.id].filter(Boolean));
  if (from) {
    const row = await balance(db, actor.tenant_id, from.id, input.material_id);
    invariant(
      dec(row.quantity).minus(row.reserved).gte(input.quantity),
      'INSUFFICIENT_AVAILABLE_STOCK',
    );
  }
  const pending = ['transfer', 'consumption', 'return'].includes(kind);
  const command = await one(
    db,
    `INSERT INTO stock_commands(tenant_id,project_id,kind,material_id,from_account_id,to_account_id,quantity,unit_cost,status,estimate_line_id,zone_id,reason,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      actor.tenant_id,
      input.project_id,
      kind,
      input.material_id,
      from?.id ?? null,
      to?.id ?? null,
      input.quantity,
      input.unit_cost ?? null,
      pending ? 'pending' : 'posted',
      input.estimate_line_id ?? null,
      input.zone_id ?? null,
      input.reason,
      actor.id,
    ],
  );
  if (pending)
    await db.query(
      'UPDATE stock_balances SET reserved=reserved+$4 WHERE tenant_id=$1 AND account_id=$2 AND material_id=$3',
      [actor.tenant_id, from!.id, input.material_id, input.quantity],
    );
  else {
    const value = money(dec(input.quantity).mul(input.unit_cost));
    await ledger(db, actor, command, to!.id, input.quantity, value, command.id);
    await journal(db, actor, input.project_id, { stock: command.id }, [
      { account: 'inventory', amount: value },
      {
        account: kind === 'opening' ? 'opening_equity' : 'clearing',
        amount: money(dec(value).neg()),
      },
    ]);
    await db.query('UPDATE stock_commands SET accepted_quantity=quantity WHERE id=$1', [
      command.id,
    ]);
  }
  await audit(db, actor, `stock.${kind}`, command.id);
  // Jo'natish → brigadirga; sarf/qaytarish taklifi → prorablar va tenant adminga xabar.
  if (pending) {
    const labels: Record<string, [string, string]> = {
      transfer: ['📦 Sizga material jo‘natildi', 'Qabul qilish uchun platformaga kiring.'],
      consumption: ['📝 Material sarfi taklifi', 'Tekshirish va tasdiqlash kutilmoqda.'],
      return: ['↩️ Material qaytarish', 'Omborga qabul qilish kutilmoqda.'],
    };
    const [title, hint] = labels[kind]!;
    const recipients =
      kind === 'transfer'
        ? [to!.custodian_id as string]
        : await projectRecipients(
            db,
            actor.tenant_id,
            input.project_id,
            kind === 'consumption' ? ['foreman'] : ['warehouse_manager'],
            actor.id,
          );
    for (const user of recipients)
      await notify(db, {
        tenant_id: actor.tenant_id,
        user_id: user,
        project_id: input.project_id,
        kind: `stock.${kind}`,
        title,
        body: `Material: ${material.name}\nMiqdor: ${quantity(input.quantity)} ${material.unit_id}\n${hint}`,
        payload: { command_id: command.id },
        dedup_key: `stock.${kind}:${command.id}:${user}`,
      });
  }
  return one(db, 'SELECT * FROM stock_commands WHERE id=$1', [command.id]);
}
export async function transitionStock(db: Db, actor: Row, id: string, input: Row) {
  const command = await one(
    db,
    'SELECT * FROM stock_commands WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
    [actor.tenant_id, id],
  );
  await projectScope(db, actor, command.project_id);
  invariant(command.version === input.version, 'VERSION_CONFLICT');
  invariant(['pending', 'partial', 'disputed'].includes(command.status), 'INVALID_TRANSITION');
  if (input.action === 'accept') {
    await permit(db, actor, command.kind === 'return' ? 'stock.receive' : 'stock.accept', 'update');
    invariant(['transfer', 'return'].includes(command.kind), 'INVALID_TRANSITION');
    const target = await accountScope(db, actor, command.to_account_id);
    if (command.kind === 'transfer')
      invariant(
        target.custodian_id === actor.id || actor.role === 'tenant_admin',
        'FORBIDDEN',
        403,
      );
  } else if (input.action === 'review') {
    await permit(db, actor, 'stock.review');
    invariant(command.kind === 'consumption', 'INVALID_TRANSITION');
    invariant(actor.id !== command.created_by, 'SELF_REVIEW_FORBIDDEN', 403);
  } else {
    await permit(
      db,
      actor,
      command.kind === 'transfer'
        ? 'stock.send'
        : command.kind === 'return'
          ? 'stock.consume'
          : 'stock.review',
      'update',
    );
    await accountScope(db, actor, command.from_account_id);
  }
  await balances(
    db,
    actor.tenant_id,
    command.material_id,
    [command.from_account_id, command.to_account_id].filter(Boolean),
  );
  const remaining = dec(command.quantity).minus(command.accepted_quantity);
  if (input.action === 'dispute') {
    await db.query("UPDATE stock_commands SET status='disputed',version=version+1 WHERE id=$1", [
      id,
    ]);
  } else if (input.action === 'cancel') {
    await db.query(
      'UPDATE stock_balances SET reserved=reserved-$4 WHERE tenant_id=$1 AND account_id=$2 AND material_id=$3',
      [actor.tenant_id, command.from_account_id, command.material_id, quantity(remaining)],
    );
    await db.query("UPDATE stock_commands SET status='cancelled',version=version+1 WHERE id=$1", [
      id,
    ]);
  } else {
    const qty = input.action === 'review' ? quantity(remaining) : input.quantity;
    invariant(qty && dec(qty).gt(0) && dec(qty).lte(remaining), 'INVALID_ACCEPTANCE_QUANTITY', 400);
    const value = await stockCost(db, actor, command.from_account_id, command.material_id, qty);
    await db.query(
      'UPDATE stock_balances SET reserved=reserved-$4 WHERE tenant_id=$1 AND account_id=$2 AND material_id=$3',
      [actor.tenant_id, command.from_account_id, command.material_id, qty],
    );
    const effect = `${id}:${command.version}`;
    await ledger(
      db,
      actor,
      command,
      command.from_account_id,
      quantity(dec(qty).neg()),
      money(dec(value).neg()),
      effect,
    );
    if (command.to_account_id)
      await ledger(db, actor, command, command.to_account_id, qty, value, effect);
    else
      await journal(db, actor, command.project_id, { stock: id }, [
        { account: 'expense', amount: value },
        { account: 'inventory', amount: money(dec(value).neg()) },
      ]);
    await db.query(
      "UPDATE stock_commands SET accepted_quantity=accepted_quantity+$2,status=CASE WHEN accepted_quantity+$2=quantity THEN 'posted' ELSE 'partial' END,reviewed_by=$3,version=version+1 WHERE id=$1",
      [id, qty, actor.id],
    );
  }
  await audit(db, actor, `stock.${input.action}`, id, { reason: input.reason ?? null });
  return one(db, 'SELECT * FROM stock_commands WHERE id=$1', [id]);
}
export async function reverseStock(db: Db, actor: Row, id: string, reason: string) {
  await permit(db, actor, 'stock.reverse');
  const original = await one(
    db,
    'SELECT * FROM stock_commands WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
    [actor.tenant_id, id],
  );
  await projectScope(db, actor, original.project_id);
  invariant(original.status === 'posted' && original.kind !== 'reversal', 'INVALID_REVERSAL');
  invariant(
    !(
      await db.query(
        'SELECT 1 FROM finance_documents f WHERE f.tenant_id=$1 AND f.matched_receipt_id=$2 AND NOT EXISTS(SELECT 1 FROM finance_documents r WHERE r.tenant_id=f.tenant_id AND r.reverses_id=f.id)',
        [actor.tenant_id, id],
      )
    ).rowCount,
    'REVERSE_MATCHED_INVOICE_FIRST',
  );
  const entries = (
    await db.query(
      'SELECT account_id,sum(quantity_delta)::text AS quantity,sum(value_delta)::text AS value FROM stock_ledger WHERE tenant_id=$1 AND command_id=$2 GROUP BY account_id ORDER BY account_id',
      [actor.tenant_id, id],
    )
  ).rows;
  await balances(
    db,
    actor.tenant_id,
    original.material_id,
    entries.map((e) => e.account_id),
  );
  for (const entry of entries) {
    await accountScope(db, actor, entry.account_id);
    const b = await balance(db, actor.tenant_id, entry.account_id, original.material_id);
    invariant(
      dec(b.quantity).minus(b.reserved).minus(entry.quantity).gte(0) &&
        dec(b.value).minus(entry.value).gte(0),
      'REVERSAL_STOCK_ALREADY_USED',
    );
  }
  const reversal = await one(
    db,
    `INSERT INTO stock_commands(tenant_id,project_id,kind,material_id,from_account_id,to_account_id,quantity,status,reverses_id,reason,created_by)
    VALUES($1,$2,'reversal',$3,$4,$5,$6,'posted',$7,$8,$9) RETURNING *`,
    [
      actor.tenant_id,
      original.project_id,
      original.material_id,
      original.to_account_id,
      original.from_account_id,
      original.quantity,
      id,
      reason,
      actor.id,
    ],
  );
  for (const entry of entries)
    await ledger(
      db,
      actor,
      reversal,
      entry.account_id,
      quantity(dec(entry.quantity).neg()),
      money(dec(entry.value).neg()),
      reversal.id,
    );
  const je = (
    await db.query('SELECT * FROM journal_entries WHERE tenant_id=$1 AND stock_command_id=$2', [
      actor.tenant_id,
      id,
    ])
  ).rows;
  await journal(
    db,
    actor,
    original.project_id,
    { stock: reversal.id },
    je.map((e) => ({ account: e.account, amount: money(dec(e.amount).neg()) })),
  );
  await audit(db, actor, 'stock.reverse', reversal.id, { original_id: id, reason });
  return reversal;
}
export async function reconcileStock(db: Db, actor: Row, accountId: string, input: Row) {
  await permit(db, actor, 'stock.reverse', 'update');
  const account = await accountScope(db, actor, accountId);
  await balances(db, actor.tenant_id, input.material_id, [accountId]);
  const current = await balance(db, actor.tenant_id, accountId, input.material_id);
  invariant(dec(current.reserved).isZero(), 'RESERVATIONS_MUST_BE_RESOLVED');
  const delta = dec(input.counted_quantity).minus(current.quantity);
  invariant(!delta.isZero(), 'NO_ADJUSTMENT_REQUIRED');
  const increase = delta.gt(0);
  invariant(!increase || input.unit_cost !== undefined, 'UNIT_COST_REQUIRED', 400);
  const qty = quantity(delta.abs());
  const value = increase
    ? money(delta.mul(input.unit_cost))
    : money(dec(await stockCost(db, actor, accountId, input.material_id, qty)).neg());
  const command = await one(
    db,
    `INSERT INTO stock_commands(tenant_id,project_id,kind,material_id,from_account_id,to_account_id,quantity,status,reason,created_by,reviewed_by)
    VALUES($1,$2,'adjustment',$3,$4,$5,$6,'posted',$7,$8,$8) RETURNING *`,
    [
      actor.tenant_id,
      account.project_id,
      input.material_id,
      increase ? null : accountId,
      increase ? accountId : null,
      qty,
      input.reason,
      actor.id,
    ],
  );
  await ledger(db, actor, command, accountId, quantity(delta), value, command.id);
  await journal(db, actor, account.project_id, { stock: command.id }, [
    { account: 'inventory', amount: value },
    { account: 'expense', amount: money(dec(value).neg()) },
  ]);
  await audit(db, actor, 'stock.reconcile', command.id, {
    counted_quantity: input.counted_quantity,
    previous_quantity: current.quantity,
    reason: input.reason,
  });
  return command;
}
