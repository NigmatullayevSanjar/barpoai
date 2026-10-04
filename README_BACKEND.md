# Backend va real ruxsatlar

Backendning ishlash mantiqi, mavjud imkoniyatlari va bajarish ketma-ketligi: [qadamma-qadam to-do reja](BACKEND_TODO.md).

Node.js/TypeScript + PostgreSQL backend [backend/README.md](backend/README.md) da. [Texnik hujjatlar](backend/docs/BARPO_BACKEND_INDEX.md) arxitektura, schema, OpenAPI, biznes qoidalari va tekshiruvlarni o‘z ichiga oladi.

`.env.example` ni `.env.local` ga ko‘chirib, `VITE_API_URL=http://localhost:3001` bilan frontendni qayta ishga tushiring. Shunda haqiqiy login, mijoz adminining rol–sahifa–CRUD matritsasi va server ruxsatlari asosida menyu/formalar filtri ishlaydi. 10 rol mavjud; har bir moliya sahifasi ham alohida sozlanadi. Qolgan Figma ekranlarining ma’lumotlari hali demo — live rejimda bu banner bilan ko‘rsatiladi.
