import ExcelJS from 'exceljs';

/**
 * Soxta Form 5 fayli (D29; haqiqiy fayllar repoga kirmaydi): oddiy jadval varag'i, narxli «Локалка 1» va narxsiz
 * «Нормы». «Локалка 1» kutilgan natijasi: 11 qator, jami 18 337 980.00; 21 % qo'shilsa 22 188 955.80; Excel
 * «ВСЕГО ЗАТРАТ» (22-qator) 18 340 000.00, farq −2 020.00; 23-qator 21 % qo'shiladi, 24-qator QQS — yo'q;
 * 13-qator miqdori norma × hajmga teng emas; 14-qatorda narx yo'q; 16-qatorda birlik yo'q; 20-qator kg → t
 * (material 13-qatorda t); 21-qator hajmi «--» (o'tkaziladi); 18-qator «1 СЕКЦИЯ» — D32 da qo'shilgan birlik (seksiya).
 * «Нормы» 11-qatori — miqdori «П» (loyihadan) material: 0 miqdor bilan qo'shiladi va ogohlantiriladi (D35).
 * `brokenFormula` — 10-qator normasi natijasiz formula (qator xatosi).
 */
export function form5Workbook({ brokenFormula = false } = {}) {
  const book = new ExcelJS.Workbook();
  const plain = book.addWorksheet('Накладная');
  plain.addRow(['Nomi', 'Miqdor']);
  plain.addRow(['Sement', 10]);
  const header = (sheet: ExcelJS.Worksheet, priced: boolean) => {
    sheet.getCell('F1').value = 'Форма N 5';
    sheet.getCell('A3').value = 'ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ № 1';
    sheet.getRow(5).values = [
      'N п.п.',
      'Шифр номера нормативов и коды ресурсов',
      'Наименование работ и затрат',
      'Единица измерения',
      'Количество',
      'Количество',
      ...(priced ? ['Стоимость', 'Стоимость'] : []),
    ];
    sheet.getRow(6).values = [
      null,
      null,
      null,
      null,
      'на ед. измерения',
      'по проектным данным',
      ...(priced ? ['на ед. измерения', 'сумма'] : []),
    ];
    sheet.getRow(7).values = priced ? [1, 2, 3, 4, 5, 6, 7, 8] : [1, 2, 3, 4, 5, 6];
  };
  const local = book.addWorksheet('Локалка 1');
  header(local, true);
  const rows: [number, unknown[]][] = [
    [8, [null, null, 'Раздел 1. Кладка стен 1-этаж']],
    [9, [1, 'Е0804-003-01 ДОП. 12', 'КЛАДКА ПЕРЕГОРОДОК', '100 М2', 2, 2]],
    [
      10,
      [
        '1.1',
        1,
        'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ',
        'ЧЕЛ.-Ч',
        brokenFormula ? { formula: 'E9*31.2' } : 62.4,
        { formula: 'E10*E9', result: 124.8 },
        30000,
      ],
    ],
    [11, ['1.2', 762, 'КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ', 'МАШ.-Ч', 0.5, 1, 200000]],
    [12, ['1.3', 19412, 'СМЕСЬ РАСТВОРНАЯ СУХАЯ', 'КГ', 212.5, 425, 1500]],
    [13, ['1.4', 923565, 'АРМАТУРА', 'Т', 0.03, 0.09, 9000000]],
    [14, ['1.5', 9219, 'ВОДА', 'М3', 0.04, 0.08, null]],
    [15, [null, 'pcpc0281970', 'Блоки газобетонные', 'м3', 20, 20, 650000]],
    [16, [null, 'pcpc0315941', 'СМЕСЬ РАСТВОРНАЯ СУХАЯ', null, 100, 100, 1500]],
    [17, [null, null, 'Раздел 2. Монтаж 2 этаж']],
    [18, [2, 'Е0501-061-01', 'УСТАНОВКА КАРКАСА', '1 СЕКЦИЯ', 3, 3]],
    [19, ['2.1', 1, 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 3.55, 10.65, 3200]],
    [20, ['2.2', 35310, 'АРМАТУРА', 'КГ', 1.2, 3.6, 9000]],
    [21, [3, 'Е0503-007-03', 'ПРИГОТОВЛЕНИЕ РАСТВОРА', '100М', '--', '--']],
    [22, [null, null, 'ВСЕГО ЗАТРАТ:', 'СУМ', null, null, null, 18340000]],
    [23, [null, null, 'ПРОЧИЕ ЗАТРАТЫ СУБПОДРЯДЧИКА', 'СУМ', null, null, 0.21, 3851400]],
    [24, [null, null, 'НДС', 'СУМ', null, null, 0.12, 2663868]],
  ];
  for (const [r, values] of rows) local.getRow(r).values = values as ExcelJS.CellValue[];
  const norms = book.addWorksheet('Нормы');
  header(norms, false);
  norms.getRow(8).values = [1, 'Е0101-001-01', 'РАЗРАБОТКА ГРУНТА', '1000 М3', 1, 1];
  norms.getRow(9).values = ['1.1', 1, 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 10, 10];
  norms.getRow(10).values = ['1.2', 1199, 'ЭКСКАВАТОРЫ', 'МАШ.-Ч', 5, 5];
  norms.getRow(11).values = [null, 'П54889', 'СМЕСЬ БЕТОННАЯ НАЛИВНОГО ТИПА', 'кг', 'П'];
  return book;
}
