# Backend va frontendni birga ishga tushirish

Backendning ishlash mantiqi, mavjud imkoniyatlari va bajarish ketma-ketligi: [qadamma-qadam to-do reja](BACKEND_TODO.md). Node.js/TypeScript + PostgreSQL backend [backend/README.md](backend/README.md) da, texnik hujjatlar [backend/docs](backend/docs/BARPO_BACKEND_INDEX.md) da.

1. `backend/.env` ni to‘ldiring (DB parollari, `APP_ORIGIN=http://localhost:5173`, Telegram bot tokeni) va `docker compose up --build -d` bilan API, worker va bazani ko‘taring.
2. Birinchi platforma egasini `npm run bootstrap` bilan yarating (backend/README.md, 3-band).
3. Loyiha ildizida `pnpm install && pnpm dev`. Frontend `http://localhost:5173` da ochiladi; `/v1` so‘rovlari Vite orqali API ga proxy qilinadi, sessiya httpOnly cookie’da saqlanadi.
4. Platforma egasi sifatida kiring → Mijozlar → yangi kompaniya → taklif havolasi. Havolani boshqa brauzer oynasida ochib kompaniya adminini yarating; 14 kunlik sinov signupda boshlanadi.

Barcha sahifalar real API bilan ishlaydi; hali ulanmagan bo‘limlar “keyingi bosqich” bo‘sh holatini ko‘rsatadi, statik raqam yo‘q. Brauzer e2e sinovi: `cd backend && npm run test:ui`.
