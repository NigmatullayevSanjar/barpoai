import { type Db, type Row, one, audit } from './db.js';
import { permit, projectScope, financialPages, pageAllowed } from './permissions.js';
import { invariant } from './errors.js';
import { dec, money } from './money.js';
import { journal } from './inventory.js';
export async function postFinance(db: Db, actor: Row, input: Row) {
  const page = financialPages[input.kind]!;
  invariant(await pageAllowed(db, actor, page, 'create'), 'PAGE_ACTION_FORBIDDEN', 403);
  await permit(
    db,
    actor,
    ['allocation', 'purchase_order'].includes(input.kind) ? 'finance.allocate' : 'finance.post',
    'create',
    page,
  );
  await projectScope(db, actor, input.project_id);
  invariant(
    !input.matched_receipt_id || input.kind === 'supplier_invoice',
    'UNEXPECTED_RECEIPT_REFERENCE',
    400,
  );
  invariant(
    !input.target_cash_account_id || input.kind === 'cash_transfer',
    'UNEXPECTED_TARGET_ACCOUNT',
    400,
  );
  invariant(
    !input.cash_account_id ||
      ['payment', 'receipt', 'advance', 'cash_transfer'].includes(input.kind),
    'UNEXPECTED_CASH_ACCOUNT',
    400,
  );
  invariant(
    !['payment', 'receipt', 'advance', 'cash_transfer'].includes(input.kind) ||
      input.cash_account_id,
    'CASH_ACCOUNT_REQUIRED',
    400,
  );
  invariant(
    ![
      'supplier_invoice',
      'opening_debt',
      'payment',
      'advance',
      'labor',
      'equipment',
      'service',
    ].includes(input.kind) || input.counterparty_id,
    'COUNTERPARTY_REQUIRED',
    400,
  );
  if (input.kind === 'cash_transfer')
    invariant(
      input.target_cash_account_id && input.target_cash_account_id !== input.cash_account_id,
      'DIFFERENT_TARGET_ACCOUNT_REQUIRED',
      400,
    );
  if (input.allocated_invoice_id) {
    invariant(input.kind === 'payment', 'ONLY_PAYMENT_CAN_ALLOCATE', 400);
    const invoice = await one(
      db,
      'SELECT * FROM finance_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
      [actor.tenant_id, input.allocated_invoice_id],
    );
    invariant(
      ['supplier_invoice', 'opening_debt', 'labor', 'equipment', 'service'].includes(
        invoice.kind,
      ) &&
        invoice.counterparty_id === input.counterparty_id &&
        invoice.project_id === input.project_id,
      'INVOICE_MISMATCH',
    );
    invariant(
      !(
        await db.query('SELECT 1 FROM finance_documents WHERE tenant_id=$1 AND reverses_id=$2', [
          actor.tenant_id,
          invoice.id,
        ])
      ).rowCount,
      'INVOICE_REVERSED',
    );
    const allocated = await one(
      db,
      `SELECT coalesce(sum(p.amount),0)::text amount FROM finance_documents p WHERE p.tenant_id=$1 AND p.allocated_invoice_id=$2 AND NOT EXISTS(SELECT 1 FROM finance_documents r WHERE r.tenant_id=p.tenant_id AND r.reverses_id=p.id)`,
      [actor.tenant_id, invoice.id],
    );
    invariant(
      dec(allocated.amount).add(input.amount).lte(invoice.amount),
      'OVERPAYMENT_USE_ADVANCE',
    );
  }
  if (input.kind === 'payment')
    invariant(input.allocated_invoice_id, 'PAYMENT_ALLOCATION_REQUIRED', 400);
  let receiptValue: string | null = null;
  if (input.kind === 'supplier_invoice') {
    invariant(input.matched_receipt_id, 'RECEIPT_MATCH_REQUIRED', 400);
    const receipt = await one(
      db,
      'SELECT * FROM stock_commands WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
      [actor.tenant_id, input.matched_receipt_id],
    );
    invariant(
      receipt.kind === 'receipt' &&
        receipt.status === 'posted' &&
        receipt.project_id === input.project_id,
      'RECEIPT_MISMATCH',
    );
    invariant(
      !(
        await db.query('SELECT 1 FROM stock_commands WHERE tenant_id=$1 AND reverses_id=$2', [
          actor.tenant_id,
          receipt.id,
        ])
      ).rowCount,
      'RECEIPT_REVERSED',
    );
    const value = await one(
      db,
      'SELECT coalesce(sum(value_delta),0)::text amount FROM stock_ledger WHERE tenant_id=$1 AND command_id=$2',
      [actor.tenant_id, receipt.id],
    );
    receiptValue = value.amount;
    invariant(dec(receiptValue!).eq(input.amount), 'PRICE_ADJUSTMENT_REQUIRED');
  }
  const doc = await one(
    db,
    `INSERT INTO finance_documents(tenant_id,project_id,zone_id,counterparty_id,kind,amount,cash_account_id,target_cash_account_id,matched_receipt_id,allocated_invoice_id,external_ref,description,document_date,created_by,due_date,reference)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [
      actor.tenant_id,
      input.project_id,
      input.zone_id ?? null,
      input.counterparty_id ?? null,
      input.kind,
      input.amount,
      input.cash_account_id ?? null,
      input.target_cash_account_id ?? null,
      input.matched_receipt_id ?? null,
      input.allocated_invoice_id ?? null,
      input.external_ref ?? null,
      input.description,
      input.document_date,
      actor.id,
      input.due_date ?? null,
      input.reference ?? null,
    ],
  );
  const positive = money(input.amount),
    negative = money(dec(input.amount).neg());
  const e = (account: string, amount: string, cash?: string | null) => ({
    account,
    amount,
    cash,
    party: input.counterparty_id ?? null,
  });
  const entries: ReturnType<typeof e>[] = [];
  switch (input.kind) {
    case 'supplier_invoice':
      entries.push(e('clearing', positive), e('payable', negative));
      break;
    case 'opening_debt':
      entries.push(e('opening_equity', positive), e('payable', negative));
      break;
    case 'labor':
    case 'equipment':
    case 'service':
      entries.push(e('expense', positive), e('payable', negative));
      break;
    case 'payment':
      entries.push(e('payable', positive), e('cash', negative, input.cash_account_id));
      break;
    case 'advance':
      entries.push(e('advance', positive), e('cash', negative, input.cash_account_id));
      break;
    case 'receipt':
      entries.push(e('cash', positive, input.cash_account_id), e('income', negative));
      break;
    case 'cash_transfer':
      entries.push(
        e('cash', negative, input.cash_account_id),
        e('cash', positive, input.target_cash_account_id),
      );
      break;
  }
  await journal(db, actor, input.project_id, { finance: doc.id }, entries);
  await audit(db, actor, `finance.${input.kind}`, doc.id);
  return doc;
}
export async function reverseFinance(db: Db, actor: Row, id: string, reason: string) {
  const original = await one(
    db,
    'SELECT * FROM finance_documents WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
    [actor.tenant_id, id],
  );
  await projectScope(db, actor, original.project_id);
  const page = financialPages[original.kind]!;
  invariant(await pageAllowed(db, actor, page, 'delete'), 'PAGE_ACTION_FORBIDDEN', 403);
  await permit(db, actor, 'finance.reverse', 'delete', page);
  invariant(original.kind !== 'reversal', 'INVALID_REVERSAL');
  invariant(
    !(
      await db.query(
        `SELECT 1 FROM finance_documents p WHERE p.tenant_id=$1 AND p.allocated_invoice_id=$2 AND NOT EXISTS(SELECT 1 FROM finance_documents r WHERE r.tenant_id=p.tenant_id AND r.reverses_id=p.id)`,
        [actor.tenant_id, id],
      )
    ).rowCount,
    'REVERSE_PAYMENTS_FIRST',
  );
  const reversal = await one(
    db,
    `INSERT INTO finance_documents(tenant_id,project_id,counterparty_id,kind,amount,reverses_id,description,document_date,created_by) VALUES($1,$2,$3,'reversal',$4,$5,$6,current_date,$7) RETURNING *`,
    [
      actor.tenant_id,
      original.project_id,
      original.counterparty_id,
      original.amount,
      id,
      reason,
      actor.id,
    ],
  );
  const entries = (
    await db.query('SELECT * FROM journal_entries WHERE tenant_id=$1 AND finance_document_id=$2', [
      actor.tenant_id,
      id,
    ])
  ).rows;
  await journal(
    db,
    actor,
    original.project_id,
    { finance: reversal.id },
    entries.map((e) => ({
      account: e.account,
      amount: money(dec(e.amount).neg()),
      cash: e.cash_account_id,
      party: e.counterparty_id,
    })),
  );
  await audit(db, actor, 'finance.reverse', reversal.id, { original_id: id, reason });
  return reversal;
}
