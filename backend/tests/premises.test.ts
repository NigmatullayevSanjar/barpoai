import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  premiseKind,
  validatePremiseRow,
  readPremisesWorkbook,
  floorAllowed,
  templateHeaders,
  type RawPremise,
} from '../src/premises.js';

const raw = (over: Partial<RawPremise>): RawPremise => ({
  row: 2,
  block: null,
  entrance: null,
  floor: null,
  number: '12',
  kind: 'Kvartira',
  rooms: '2',
  area: '65.4',
  ...over,
});
async function book(headers: readonly string[], rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('S');
  sheet.addRow([...headers]);
  for (const r of rows) sheet.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
}

test('premise kind accepts uz, ru and code names', () => {
  assert.equal(premiseKind(' kvartira '), 'apartment');
  assert.equal(premiseKind('Квартира'), 'apartment');
  assert.equal(premiseKind('Tijorat'), 'commercial');
  assert.equal(premiseKind('Паркинг'), 'parking');
  assert.equal(premiseKind('Кладовая'), 'storage');
  assert.equal(premiseKind('villa'), undefined);
});
test('premise row: normalized values and per-field error codes', () => {
  const ok = validatePremiseRow(raw({ area: '65,4', floor: '-1' }));
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.values, {
    number: '12',
    kind: 'apartment',
    floor: -1,
    rooms: 2,
    area_m2: '65.40',
  });
  const bad = validatePremiseRow(
    raw({ number: null, kind: 'villa', floor: '2.5', rooms: '-1', area: '0' }),
  );
  assert.equal(bad.values, null);
  assert.deepEqual(
    bad.errors.map((e) => `${e.field}:${e.code}`),
    [
      'number:REQUIRED',
      'kind:INVALID_KIND',
      'floor:INVALID_FLOOR',
      'rooms:INVALID_ROOMS',
      'area:INVALID_AREA',
    ],
  );
  assert.deepEqual(
    validatePremiseRow(raw({ area: '65.123' })).errors.map((e) => e.code),
    ['INVALID_AREA'],
  );
  assert.deepEqual(
    validatePremiseRow(raw({ number: 'x'.repeat(21) })).errors.map((e) => e.code),
    ['TOO_LONG'],
  );
});
test('premises workbook keeps real sheet row numbers across blank rows', async () => {
  const base64 = await book(templateHeaders.uz, [
    ['A', '1', 3, '12', 'Kvartira', 2, 65.4],
    [],
    [],
    ['A', null, 4, 15, 'Ombor', null, '4,5'],
  ]);
  const rows = await readPremisesWorkbook(base64);
  assert.deepEqual(
    rows.map((r) => [r.raw.row, r.raw.number, r.raw.floor, r.raw.area]),
    [
      [2, '12', '3', '65.4'],
      [5, '15', '4', '4,5'],
    ],
  );
});
test('premises workbook: Russian headers accepted, foreign layout and formulas rejected', async () => {
  const ru = await readPremisesWorkbook(
    await book(templateHeaders.ru, [[null, null, null, 'P-1', 'Паркинг', null, 13.25]]),
  );
  assert.equal(ru[0]!.raw.kind, 'Паркинг');
  await assert.rejects(
    readPremisesWorkbook(await book(['Raqam', 'Maydon'], [['1', 50]])),
    /TEMPLATE_MISMATCH/,
  );
  await assert.rejects(readPremisesWorkbook(await book(templateHeaders.uz, [])), /IMPORT_EMPTY/);
  const formula = await readPremisesWorkbook(
    await book(templateHeaders.uz, [[null, null, null, '1', 'Kvartira', 1, { formula: '20+30' }]]),
  );
  assert.deepEqual(formula[0]!.errors, [{ field: 'area', code: 'FORMULA_NOT_ALLOWED' }]);
});
test('floor may not exceed the nearest block floors_count', () => {
  const zones = [
    { id: 'b', parent_id: null, name: 'A', kind: 'block', floors_count: 9, block_id: 'b' },
    { id: 'e', parent_id: 'b', name: '1', kind: 'entrance', floors_count: null, block_id: 'b' },
    { id: 'o', parent_id: null, name: 'X', kind: 'other', floors_count: null, block_id: null },
  ];
  assert.equal(floorAllowed(zones, 'e', 9), true);
  assert.equal(floorAllowed(zones, 'e', 10), false);
  assert.equal(floorAllowed(zones, 'o', 99), true);
  assert.equal(floorAllowed(zones, null, 99), true);
});
