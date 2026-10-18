# LABUKU Desk v6.10 — Catatan update (Selamat Datang, daftar layanan di monitor, tombol Ambil Berkas)

## Yang berubah

**1. Tombol "Panggil Ambil" berwarna lain**
- Tombol ini sekarang hanya bergaris tepi biru dengan teks biru, berbentuk pil, tanpa isi warna.
- Tombol Verifikasi tetap emas berisi warna, jadi keduanya tidak tertukar lagi.
- Berlaku di Front Office, Back Office, dan Service Workspace.
- Di mode malam warnanya biru muda.

**2. Tombol "Selamat Datang" di Front Office**
- Letaknya di deret tombol atas Front Office. Di HP tombol ini hanya tampil sebagai ikon senyum.
- Dipakai saat ada pengunjung baru masuk. Petugas cukup klik sekali, lalu:
  - **speaker menyapa** setelah bel, misalnya: *"Selamat datang di KUA Sawoo. Silakan ambil nomor antrean secara mandiri. Pertama, pindai kode QR di layar… Kedua, isi NIK, nama, nomor WhatsApp, dan alamat, lalu pilih layanan. Ketiga, simpan nomor antrean Anda, lalu tunggu sampai nomor Anda dipanggil."*;
  - **monitor berganti selama 45 detik** ke layar sapaan, berisi:
    - judul **SELAMAT DATANG** dan nama KUA;
    - **QR besar** bertuliskan "PINDAI DI SINI";
    - **3 langkah bergambar**: pindai QR (dengan animasi garis pindai), isi data, dan tunggu dipanggil. Langkah yang disorot berpindah tiap 5 detik;
    - bilah hitung mundur. Setelah 45 detik monitor kembali sendiri ke tampilan antrean.
- Jika petugas menekan **Panggil** atau **Panggil Ambil** sebelum 45 detik, layar sapaan langsung ditutup dan nomor tampil.
- Monitor di komputer yang sama berganti seketika. Monitor di komputer lain ikut berganti paling lambat ±8 detik.
- Tata letak Tegak dan Strip juga punya versi layar sapaannya sendiri.
- Kalimat sapaan bisa diubah di **Pengaturan → Suara Panggilan → Kalimat sapaan "Selamat Datang"**, lengkap dengan pratinjau dan tombol **Coba sapaan**.

**3. Daftar semua layanan KUA bergulir di monitor**
- Kolom kanan monitor kini punya kartu **Layanan KUA**:
  - berisi semua layanan **aktif** di Katalog Layanan, dikelompokkan per kategori;
  - daftarnya bergulir pelan dari atas ke bawah tanpa henti.
- Supaya muat, saat kartu ini tampil:
  - "Berikutnya" menampilkan paling banyak 3 nomor;
  - ringkasan dan QR berdampingan di bawah, dengan QR sedikit lebih kecil;
  - bila tidak ada antrean menunggu, kotak "Berikutnya" disembunyikan dan daftar layanan mengisi ruangnya.
- Layanan yang dinonaktifkan di Katalog tidak ikut tampil.
- Kartu ini bisa dimatikan di **Pengaturan → Monitor → Bagian yang tampil → "Daftar layanan KUA (bergulir)"**.
- Di tata letak Strip (banner tipis) kartu ini tidak ditampilkan karena tidak cukup ruang.

## Hal yang perlu diketahui
- Suara sapaan keluar dari **komputer loket yang menekan tombol**, sama seperti suara panggilan. Monitor ikut bersuara hanya bila di layar itu "Bunyikan panggilan di layar ini" dinyalakan.
- Jika monitor baru dibuka atau dimuat ulang saat layar sapaan masih aktif, monitor menampilkan sisa waktunya tanpa suara.
- Daftar layanan mengikuti cache katalog (±5 menit). Perubahan di Katalog Layanan muncul di monitor paling lambat beberapa menit kemudian.

## File yang berubah
- Backend: **Kode.gs**:
  - fungsi baru `sapaPengunjung`;
  - `getMonitorData` kini juga mengirim `sapa` dan `daftarLayanan`;
  - pengaturan baru `suara_sapa`;
  - bagian monitor baru `daftar`.
  - Tidak ada kolom atau sheet baru.
- Frontend: `monitor.html`, `js/app.js`, `css/style.css`.

## Cara memasang
1. **Apps Script**:
   - Ganti isi Kode.gs dengan Kode.gs v6.10.
   - Isi lagi `FRONTEND_URL` bila sebelumnya sudah diisi.
   - Simpan → **Deploy → Manage deployments → Edit → New version → Deploy**.
2. **Frontend**: ekstrak `labuku-desk-update-v6.10.zip` ke folder `labuku-desk` → **Replace**. ZIP ini berisi `monitor.html`, `js/app.js`, dan `css/style.css`.
3. Di PowerShell, dari folder `labuku-desk`:
   ```powershell
   git add .
   git commit -m "LABUKU Desk v6.10"
   git push
   ```
4. Tunggu 1–2 menit, lalu tekan **Ctrl+Shift+R** di LABUKU Desk **dan** di jendela monitor. Setelah itu klik sekali di monitor untuk layar penuh.
5. Coba: Front Office → **Selamat Datang**.

> Deploy **Kode.gs dulu**. Bila frontend v6.10 dipasang dengan Kode.gs lama:
> - layar sapaan hanya muncul di monitor pada browser yang sama, dan petugas melihat pesan "Fungsi tidak diizinkan";
> - daftar layanan tidak tampil.
