# Raqamlarni ajratish — qo‘lda test case’lar (O.docx, 2026-10-26)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| RA-01 | Bank va kassa → “Operatsiya qo‘shish” → Summa maydoniga `3000000` yozing | Yozish paytida `3 000 000` ko‘rinadi; saqlangach jadvalda ham `3 000 000` |
| RA-02 | Summaga `12345` yozing, kursorni `12 ` dan keyinga qo‘yib Backspace bosing | `1 345` qoladi (bo‘sh joy emas, oldingi raqam o‘chadi); kursor `1` dan keyin |
| RA-03 | Summa maydonining o‘rtasiga raqam yozing (`1 000` → `1 5000`) | Guruhlar qayta quriladi: `15 000`, kursor yozilgan raqamdan keyin qoladi |
| RA-04 | Kasr: `65,4` va `1250.50` | `65,4` va `1 250.50` ko‘rinadi, saqlangan qiymat to‘g‘ri |
| RA-05 | Smeta muharriri: Miqdor `5000`, Narx `1200000` | Jadval kataklarida `5 000` va `1 200 000`; saqlangan smeta jami to‘g‘ri |
| RA-06 | Platforma egasi: tarif narxi `450000.00`, kompaniyaga to‘lov `100000` | `450 000.00`, `100 000` ko‘rinadi, saqlanadi |
| RA-07 | 2FA kod maydoni | Ajratilmaydi (oddiy kod) |
