# LABUKU Desk — Layanan Administrasi dan Pembukuan KUA

Frontend statis LABUKU Desk untuk GitHub Pages. Backend tetap Google Apps Script
(Web App JSON API) dan Google Sheets.

## Isi repository

```
index.html            Aplikasi tim (dashboard, Front Office, Back Office, Katalog, Pengaturan)
antrean.html          Form antrean publik (untuk link & QR pemohon)
css/style.css         Tampilan aplikasi
css/komponen.css      Komponen bersama (wilayah, daftar layanan)
js/config.js          ← ISI GAS_URL (URL /exec Apps Script)
js/gas-run.js         Jembatan fetch() ke Apps Script
js/komponen.js        Komponen bersama
js/app.js             Logika aplikasi
PANDUAN-INSTALASI.md  Langkah instalasi lengkap
```

## Alamat setelah online

- Aplikasi tim: `https://USERNAME.github.io/labuku-desk/`
- Form antrean publik: `https://USERNAME.github.io/labuku-desk/antrean.html`

## Update

```
git add .
git commit -m "Deskripsi perubahan"
git push
```

by Ahzani Labs
