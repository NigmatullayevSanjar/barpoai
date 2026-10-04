# Barpo.AI — React + TypeScript frontend

Figma faylidagi 37 ekran va holat asosida tayyorlangan frontend demo.

## Ishga tushirish

Node.js 22.12+ yoki 24 va pnpm kerak.

```sh
pnpm install
pnpm dev
```

Brauzer: http://127.0.0.1:5173

```sh
pnpm build
pnpm preview
```

## Nimalar bor

- Boshqaruv paneli, obyektlar va bloklar, smetalar, vazifalar, xomashyolar, hisobotlar, xodimlar, profil, sozlamalar, login, ro‘yxatdan o‘tish, 404.
- Barcha 37 dizayn ekranini ochadigan “Ekranlar” menyusi.
- Yon menyu, tafsilotlarga o‘tish, qidiruv, ayrim filtrlar, forma kiritish, demo yozuv qo‘shish va qayta tahrirlash.
- Parolni ko‘rsatish/yashirish, haftalik/kunlik hisobot yo‘nalishi, Escape orqali qaytish.
- Original Figma rasmlari va SVG aktivlari `public/assets` ichida.
- Ekranlar alohida yuklanadi (React lazy); oddiy CSS, Tailwind talab qilinmaydi.

## Demo chegaralari

Backend ulanmagan. Figma raqamlari va dastlabki yozuvlar namunaviy. Yangi yozuvlar React xotirasida saqlanadi, sahifa yangilanganda yo‘qoladi va “Ushbu sessiyada qo‘shilganlar” bo‘limida ko‘rinadi. Figma namunaviy yozuvlari o‘zgartirilmaydi.

Login demo rejimida. Telegram, AI yordamchi, email/SMS va serverga fayl yuborish ulanmagan. Fayl tanlash fayl nomini oladi; eksport mavjud joyda oddiy matnni yuklaydi. Ayrim boshqaruvlar vizual holatda.

## Tuzilma

- `src/ui/App.tsx`: marshrutlar, umumiy menyu, demo ma’lumotlar.
- `src/ui/DesignNode.tsx`: Figma elementlarini boshqaruvlarga ulash.
- `src/screens/screen*.tsx`: original ekranlarning React komponentlari.
- `src/screens/index.ts`: ekranlar va Figma node ID mosligi.
- `src/design.css`: Figma uslublari.
- `src/app.css`: umumiy va moslashuvchan uslublar.

Ekranlar xaritasi: `SCREEN_MAP.md`. Brauzer tekshiruvi: `verification.json`.

## Rollar

Chap menyudagi **Rolni sinash Â· demo** tanlovi Admin, Menejer, Prorab va Buxgalter interfeyslarini almashtiradi. Tanlov brauzerda saqlanadi; boshlangâ€˜ich rol Menejer.

| Rol | Koâ€˜rish | Boshqarish |
|---|---|---|
| Admin | Barcha boâ€˜limlar | Barcha mavjud amallar va tizim sozlamalari |
| Menejer | Sozlamalardan tashqari barcha boâ€˜limlar | Obyektlar, xodimlar, smetalar, vazifalar, xomashyolar, hisobotlar |
| Prorab | Obyektlar, vazifalar, xomashyolar, hisobotlar | Vazifalar va hisobotlar |
| Buxgalter | Obyektlar, smetalar, xomashyolar, hisobotlar | Smetalar |

Har bir rol oâ€˜z profilini tahrirlashi mumkin. Prorab va buxgalter uchun alohida bosh sahifa mavjud. Menyu va ekranlar roâ€˜yxati rolga qarab filtrlanadi. URL orqali ruxsatsiz sahifaga kirilganda ruxsat yoâ€˜qligi koâ€˜rsatiladi; yozish huquqi boâ€˜lmagan amallar yashiriladi va saqlash/oâ€˜chirish handlerlari ham tekshiradi.

Bu demo rol almashinuvi, haqiqiy autentifikatsiya emas. Foydalanuvchining rolini ishonchli server sessiyasidan olish va API amallarini tekshirish backend integratsiyasida bajariladi. Namunaviy obyektlar barcha ruxsatli rollarga koâ€˜rinadi; foydalanuvchiga biriktirilgan obyekt boâ€˜yicha server filtri hali ulanmagan.

Ruxsatlar: src/ui/roles.ts. Rolga mos bosh sahifa va ruxsat yoâ€˜q koâ€˜rinishi: src/ui/RoleViews.tsx. Tekshiruv: 4 rol uchun 148 marshrut holati, menyular, rol saqlanishi, faqat koâ€˜rish amallari va mobil almashish.
