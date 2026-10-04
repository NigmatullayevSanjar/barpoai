import { Decimal } from 'decimal.js';
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const dec = (value: string) => new Decimal(value);
export const money = (value: Decimal.Value) => new Decimal(value).toFixed(2);
export const quantity = (value: Decimal.Value) => new Decimal(value).toFixed(6);
export function plannedQuantity(input: {
  quantity: string;
  norm?: string;
  work_quantity?: string;
  loss_percent?: string;
}) {
  return quantity(
    (input.norm ? dec(input.norm).mul(input.work_quantity!) : dec(input.quantity)).mul(
      dec(input.loss_percent ?? '0')
        .div(100)
        .add(1),
    ),
  );
}
export function variance(actual: string, plan: string) {
  return {
    difference: money(dec(actual).minus(plan)),
    percent: dec(plan).isZero() ? null : money(dec(actual).div(plan).mul(100)),
  };
}
