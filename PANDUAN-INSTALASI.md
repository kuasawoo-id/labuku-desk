# Panduan Migrasi LABUKU Desk ke GitHub Pages (v6)

Fitur aplikasi **tidak berubah**. Yang berubah hanya tempat tampilan dibuka:

| | Sebelum (v5.1) | Sesudah (v6) |
|---|---|---|
| Tampilan (frontend) | Apps Script (`.../exec`) | GitHub Pages (`https://USERNAME.github.io/labuku-desk/`) |
| Data & logika (backend) | Apps Script + Google Sheets | **Tetap** Apps Script + Google Sheets (proyek & data yang sama) |
| Cara tampilan bicara ke server | `google.script.run` | `fetch()` ke URL `/exec` |

Urutan pengerjaan: **A. Backend → B. Isi config.js → C. Git & GitHub → D. Aktifkan Pages → E. Rapikan link lama**.
Kerjakan berurutan. Jangan lompat.

---

## A. Perbarui backend Apps Script (proyek LAMA, jangan buat baru)

Memakai proyek lama berarti data, password tim, dan pengaturan tetap utuh.

1. Buka proyek Apps Script LABUKU Desk yang sekarang dipakai.
2. Buka file **Kode.gs** → pilih semua isinya (Ctrl+A) → hapus → tempel isi **Kode.gs v6** yang diberikan terpisah → **Simpan** (Ctrl+S).
3. **DataWilayah.gs**: isinya sama dengan v5.1. Boleh dibiarkan, atau ditimpa dengan file yang diberikan (hasilnya sama).
4. File HTML lama — **Index, Form, JavaScript, Stylesheet, Komponen** — sudah tidak dipakai. Boleh dihapus (klik titik tiga di samping nama file → Hapus). Kalau dibiarkan pun tidak mengganggu.
5. Deploy ulang **di deployment yang sama** supaya URL `/exec` tidak berubah:
   - **Deploy** → **Manage deployments** → klik ikon **pensil (Edit)**
   - **Version**: pilih **New version**
   - **Execute as**: **Me**
   - **Who has access**: **Anyone** ← wajib "Anyone", bukan "Anyone with Google account"
   - Klik **Deploy**, lalu **salin Web app URL** (berakhiran `/exec`). Simpan di Notepad.
6. Uji: buka di browser `URL_EXEC_ANDA?action=ping`. Harus tampil teks JSON berisi `"api":"ok"`.

> Mengapa "Anyone"? Halaman di github.io memanggil Apps Script dari situs lain. Browser tidak mengirim login Google
> dalam panggilan seperti itu, jadi pilihan "Anyone with Google account" akan selalu gagal. Keamanan data tetap
> dijaga oleh password tim + token sesi seperti sebelumnya.

---

## B. Ekstrak ZIP dan isi `js/config.js`

1. Klik kanan **labuku-desk.zip** → **Extract All...** → tujuan misalnya `C:\Users\NAMA\Documents\labuku-desk` → **Extract**.
2. Buka folder **`C:\Users\NAMA\Documents\labuku-desk`**. Isinya harus langsung terlihat seperti ini:

   ```
   labuku-desk\              ← FOLDER INI yang nanti di-git init
   ├── index.html
   ├── antrean.html
   ├── README.md
   ├── PANDUAN-INSTALASI.md
   ├── css\   (style.css, komponen.css)
   └── js\    (config.js, gas-run.js, komponen.js, app.js)
   ```

   Kalau yang terlihat justru satu folder `labuku-desk` lagi, masuk ke folder itu dulu. Folder kerja yang benar adalah
   folder yang **langsung berisi `index.html`**.
3. Buka `js\config.js` dengan **Notepad** (klik kanan → Open with → Notepad). Ganti teks
   `ISI_URL_EXEC_APPS_SCRIPT_DI_SINI` dengan URL `/exec` dari langkah A.5. Tanda kutip tunggal `'` tetap ada:

   ```js
   window.LABUKU_CONFIG = {
     GAS_URL: 'https://script.google.com/macros/s/AKfycb.../exec'
   };
   ```
4. Simpan (Ctrl+S).

---

## C. Kirim ke GitHub lewat terminal

Jangan memakai tombol "Upload files" di web GitHub: struktur folder `css\` dan `js\` akan hilang dan tampilan rusak.

### C1. Pasang Git (sekali saja)
Unduh dari https://git-scm.com/download/win → pasang dengan pilihan bawaan (Next terus).
Buka **PowerShell** dari Start Menu, ketik:

```powershell
git --version
```
Hasil normal: `git version 2.xx...`

### C2. Akun GitHub
Daftar di https://github.com bila belum punya. **Username** akan menjadi bagian alamat aplikasi
(`USERNAME.github.io`), jadi pilih yang pantas untuk instansi.

### C3. Identitas Git (sekali saja per komputer)
```powershell
git config --global user.name "Fahchurizal Ahzani"
git config --global user.email "email-akun-github@contoh.com"
```
`user.name` hanya label riwayat, bukan username GitHub. Tidak ada output = berhasil.

### C4. Buat repository kosong
Di github.com: tombol **+** (kanan atas) → **New repository**
- **Repository name**: `labuku-desk`
- **Public** (wajib untuk GitHub Pages gratis)
- **JANGAN** centang *Add a README*, *.gitignore*, atau *license*
- Klik **Create repository**. Biarkan halaman itu terbuka.

> Repository publik berarti kode tampilan bisa dilihat orang. Ini aman: tidak ada password atau data pemohon di
> dalamnya. Yang terlihat hanya URL `/exec`, yang memang harus publik agar aplikasi bisa dipakai.

### C5. Masuk ke folder yang BENAR lalu periksa isinya
Buka folder `C:\Users\NAMA\Documents\labuku-desk` di File Explorer → klik address bar → ketik `powershell` → Enter.
PowerShell terbuka tepat di folder itu. Lalu:

```powershell
dir
```
Yang **wajib** terlihat: `index.html`, `antrean.html`, folder `css`, folder `js`.
Kalau yang terlihat hanya folder `labuku-desk`, jalankan `cd labuku-desk` lalu `dir` lagi. **Jangan lanjut sebelum
`index.html` terlihat**, karena git tidak akan memberi peringatan bila foldernya salah.

### C6. Kirim (jalankan satu per satu)
```powershell
git init
```
Hasil normal: `Initialized empty Git repository in ...\labuku-desk\.git\`

```powershell
git add .
```
Ada **titik** di akhir. Tidak ada output = berhasil.

```powershell
git commit -m "LABUKU Desk v6 - frontend GitHub Pages"
```
Hasil normal: daftar `create mode 100644 index.html`, dst.

```powershell
git branch -M main
git remote add origin https://github.com/USERNAME/labuku-desk.git
```
Ganti `USERNAME`. Tidak ada output = berhasil.

```powershell
git push -u origin main
```
Biasanya muncul jendela login GitHub → pilih **Sign in with your browser** → setujui. Selesai.
Bila diminta di terminal:
- **Username**: username GitHub
- **Password**: **Personal Access Token**, bukan password akun (lihat C7)

Saat menempel token, layar **tetap kosong**. Itu normal. Klik kanan untuk tempel, lalu Enter.
Tanda berhasil: `Writing objects: 100%` dan `* [new branch] main -> main`.

### C7. Bila muncul "Password authentication is not supported"
1. Buka https://github.com/settings/tokens → **Generate new token** → **Generate new token (classic)**
2. Note: `labuku-push` · Expiration: `90 days` · centang **repo**
3. **Generate token** → salin `ghp_...` (hanya tampil sekali) → simpan di Notepad
4. Jalankan lagi `git push -u origin main`, tempel token sebagai password.

---

## D. Aktifkan GitHub Pages

1. Buka `https://github.com/USERNAME/labuku-desk`. Pastikan di halaman depan repo terlihat `index.html`, folder `css`,
   folder `js` (bukan file `.gs`).
2. **Settings** → **Pages** (menu kiri):
   - Source: **Deploy from a branch**
   - Branch: **main** · **/ (root)** → **Save**
3. Tunggu 1–2 menit, muat ulang halaman Settings → Pages sampai muncul
   *Your site is live at https://USERNAME.github.io/labuku-desk/*
4. Centang **Enforce HTTPS** (wajib, agar fitur salin otomatis & unduhan berjalan normal).
5. Buka `https://USERNAME.github.io/labuku-desk/` → masukkan **password tim** → pilih nama.

> Semua anggota tim perlu **masuk sekali lagi** di alamat baru. Browser menyimpan sesi per alamat situs, jadi sesi dari
> alamat lama tidak ikut pindah. Password tim tidak berubah.

---

## E. Rapikan link & QR lama

1. Kembali ke Apps Script → **Kode.gs** → baris paling atas, isi:
   ```js
   const FRONTEND_URL = 'https://USERNAME.github.io/labuku-desk/';
   ```
   (akhiri dengan garis miring `/`) → Simpan → **Deploy → Manage deployments → Edit → New version → Deploy**.
2. Sekarang siapa pun yang membuka link/QR lama (`.../exec` atau `.../exec?page=antrean`) akan melihat halaman
   "LABUKU Desk pindah alamat" dengan tombol menuju alamat baru (perlu satu ketukan).
3. Cetak ulang QR form publik: di aplikasi baru → **Front Office** → **Link & QR Form Publik** → **Unduh QR**.
   QR baru langsung menuju `https://USERNAME.github.io/labuku-desk/antrean.html`.

---

## Memperbarui aplikasi di kemudian hari

**Tampilan (frontend)**: ubah file di folder `labuku-desk`, lalu dari PowerShell di folder itu:
```powershell
git add .
git commit -m "Deskripsi singkat perubahan"
git push
```
Tunggu 1–2 menit, lalu tekan **Ctrl+Shift+R** di browser.

**Backend (Kode.gs)**: tempel kode baru → Simpan → **Deploy → Manage deployments → Edit → New version → Deploy**.
Jangan memilih "New deployment", karena itu menghasilkan URL `/exec` baru dan `js/config.js` harus diubah lagi.

---

## Masalah yang sering muncul

| Yang terlihat | Penyebab | Solusi |
|---|---|---|
| Layar muat: *GAS_URL belum diisi di js/config.js* | `config.js` belum diisi / belum di-push | Isi GAS_URL (langkah B.3), lalu `git add .` → `git commit -m "isi GAS_URL"` → `git push` |
| *Respons server bukan JSON* | Akses deploy bukan **Anyone**, atau URL bukan `/exec` | Ulangi langkah A.5; pastikan URL berakhiran `/exec` |
| *Tidak dapat terhubung ke server* | Internet putus / URL salah ketik | Cek koneksi; buka `URL?action=ping` di browser |
| Situs 404 *File not found* | `git init` dijalankan di folder yang salah | Pastikan `dir` menampilkan `index.html`, lalu push ulang dengan `git push -u origin main --force` dari folder yang benar |
| Tampilan polos tanpa warna | Folder `css`/`js` tidak ikut | Periksa repo di GitHub; jangan pakai "Upload files" |
| Masih tampil versi lama | Cache browser | **Ctrl+Shift+R** atau jendela Incognito |
| *Sesi berakhir. Silakan masuk kembali.* | Normal saat pertama kali di alamat baru | Masuk dengan password tim |
| `remote origin already exists` | `git remote add` sudah pernah dijalankan | Lewati, lanjut `git push -u origin main` |

Bila macet, kirim screenshot PowerShell atau Console browser (F12 → tab Console).
