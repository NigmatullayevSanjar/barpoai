# Smetani fayldan yangilash va ombor rejasi — qo‘lda test case’lar (D35, 2026-11-10)

**Tayyorgarlik:** yangi “D35 obyekt” (Asosiy ombor bilan), ombor mudiri shu obyekt va Asosiy omborga biriktirilgan. Excel fayl `smeta-v1.xlsx` (ustunlar: Turi, Nomi, Material, Birlik, Miqdor, Narx):

| Turi | Nomi | Material | Birlik | Miqdor | Narx |
|---|---|---|---|---|---|
| material | Sement | D35 Sement | kg | 100 | 10 |
| material | Qum | D35 Qum | m3 | 5 | 50 |
| material | Gips | D35 Gips | kg | 4 | 20 |
| ish | Suvoq | | m2 | 20 | 30 |

`smeta-v2.xlsx`: Sement → material nomi **D35 Sement M400**, miqdor 80; Qum va Gips qatorlari o‘chirilgan; yangi qator `material | Shag‘al | D35 Shag‘al | t | 3 | 90`; Suvoq miqdori 30.

Kirish: mijoz admini (smeta), ombor mudiri (ombor).

| ID | Qadam | Kutilgan natija |
|---|---|---|
| SR-01 | Smetalar → “Excel import” → “Qayerga yuklash” = **Yangi smeta**, `smeta-v1.xlsx`, ustunlarni moslash, tekshirish, tasdiqlash | Smeta “D35 smeta” (rev. 1) yaratiladi; “3 ta material yaratildi” xabari |
| SR-02 | Ombor mudiri: Ombor → Qoldiqlar (Asosiy ombor) | D35 Gips, D35 Qum, D35 Sement qatorlari: **Reja (smeta)** 4 / 5 / 100, **Kirim** 0, qoldiq 0, holati **“Kirim yo‘q”** |
| SR-03 | Kirim: D35 Sement 120 kg, D35 Gips 2 kg | Sement: kirim 120, qoldiq 120, Reja 100 yonida **“Rejadan oshgan”**; Gips: kirim 2, qoldiq 2 |
| SR-04 | Kirim oynasida nakladnoy nomi “D35 Sement M400” → “+” → o‘xshash materialdan “D35 Sement” ni tanlang (muqobil nom) → bekor qiling | Muqobil nom saqlanadi (D32) |
| SR-05 | Admin: Excel import → “Qayerga yuklash” = **D35 smeta (rev. 1) — yangi reviziya** | Smeta nomi o‘zi “D35 smeta” bo‘ladi |
| SR-06 | `smeta-v2.xlsx` ni tekshirish | “1 ta material yaratildi” (faqat D35 Shag‘al; Sement muqobil nom bo‘yicha topildi); “reviziya: reja fayldan, fakt o‘zgarmaydi” xabari |
| SR-07 | Tasdiqlash | Obyektda smeta bitta qoladi, revision 2; Sement qatori reja 80; reviziyalar tarixida rev. 1 va rev. 2 |
| SR-08 | Ombor mudiri: Qoldiqlar | **D35 Sement**: Reja 80, kirim 120, qoldiq 120, “Rejadan oshgan”. **D35 Gips**: Reja “—”, kirim 2, qoldiq 2 (o‘zgarmagan). **D35 Shag‘al**: Reja 3, qoldiq 0, “Kirim yo‘q”. **D35 Qum** ro‘yxatda yo‘q |
| SR-09 | SR-05 dan ikki oyna oching, ikkalasida `smeta-v2.xlsx` ni tekshiring; birinchisini tasdiqlang, keyin ikkinchisini | Ikkinchisi: “Smeta shu orada o‘zgargan yoki arxivlangan. Faylni qayta tekshiring.” — smeta o‘zgarmaydi |
| SR-10 | `smeta-v2.xlsx` da Sement birligini `m3` qilib, mavjud smetaga yuklang | Qator raqami bilan birlik xatosi (kg ≠ m3); material birligi o‘zgarmaydi |
| SR-11 | Form 5 fayl, ikki varaq; ikkalasiga bir xil mavjud smetani tanlashga urining | Ikkinchi varaq ro‘yxatida o‘sha smeta tanlab bo‘lmaydi (API: `DUPLICATE_TARGET`) |
| SR-12 | Finansist (smeta tahrirlash huquqisiz) bilan Excel import | “Qayerga yuklash” tanlovi chiqmaydi — faqat yangi smeta (API `estimate_id` bilan — 403) |
| SR-13 | Ombor → “Excel” eksport | Ustunlar: Reja (smeta), Kirim, Rejadan oshgan — SR-08 dagi qiymatlar |
