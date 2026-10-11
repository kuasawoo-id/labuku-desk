/*
 * LABUKU Desk — Jembatan fetch ke Apps Script (pengganti google.script.run)
 * ------------------------------------------------------------
 * Frontend lama memanggil server dengan pola:
 *   google.script.run.withSuccessHandler(fn).withFailureHandler(fn).namaFungsi(arg1, arg2)
 * Di GitHub Pages pola itu tidak tersedia, jadi file ini menyediakan objek yang
 * antarmukanya SAMA, tetapi isinya fetch() POST ke GAS_URL. Dengan begitu seluruh
 * logika aplikasi (js/app.js) tetap utuh — tidak ada fitur yang berubah.
 *
 * Aturan penting:
 * - Content-Type WAJIB text/plain;charset=utf-8 → browser tidak mengirim CORS preflight
 *   (Apps Script tidak bisa menjawab preflight OPTIONS).
 * - Body: {"fn": "namaFungsi", "args": [...]}. Server (doPost) hanya menjalankan
 *   fungsi yang ada di daftar izin.
 * - Respons {"__gasError": "..."} = fungsi server melempar error → withFailureHandler.
 */
(function () {
  function gasUrl() {
    var c = window.LABUKU_CONFIG || {};
    return String(c.GAS_URL || '').trim();
  }

  function urlValid(u) {
    return /^https?:/.test(u) && /\/exec(\?|$)/.test(u);
  }

  function pesanKoneksi(err) {
    var m = String((err && err.message) || err || '');
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) {
      return 'Tidak dapat terhubung ke server. Periksa koneksi internet, lalu coba lagi.';
    }
    return m || 'Koneksi gagal.';
  }

  function panggil(fn, args, okH, failH, userObj) {
    var url = gasUrl();
    function gagal(err) {
      if (failH) failH(err, userObj);
      else if (window.console) console.warn('[LABUKU] ' + fn + ': ' + (err && err.message ? err.message : err));
    }
    if (!urlValid(url)) {
      setTimeout(function () { gagal(new Error('GAS_URL belum diisi dengan benar di js/config.js (harus berakhiran /exec).')); }, 0);
      return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args }),
      redirect: 'follow'
    })
      .then(function (r) {
        return r.text().then(function (t) {
          var data;
          try { data = JSON.parse(t); } catch (e) {
            throw new Error('Respons server bukan JSON (HTTP ' + r.status + '). Pastikan Apps Script di-deploy sebagai Web app dengan akses "Anyone" dan GAS_URL benar.');
          }
          return data;
        });
      })
      .then(function (data) {
        if (data && typeof data === 'object' && !Array.isArray(data) && data.__gasError !== undefined) {
          gagal(new Error(String(data.__gasError)));
          return;
        }
        if (okH) {
          /* Error di dalam handler sukses tidak dialihkan ke handler gagal (perilaku sama dengan google.script.run). */
          try { okH(data, userObj); } catch (e) { setTimeout(function () { throw e; }, 0); }
        }
      }, function (err) {
        gagal(new Error(pesanKoneksi(err)));
      });
  }

  function runner(okH, failH, userObj) {
    return new Proxy({}, {
      get: function (_, name) {
        if (name === 'withSuccessHandler') return function (h) { return runner(h, failH, userObj); };
        if (name === 'withFailureHandler') return function (h) { return runner(okH, h, userObj); };
        if (name === 'withUserObject') return function (o) { return runner(okH, failH, o); };
        return function () {
          panggil(String(name), Array.prototype.slice.call(arguments), okH, failH, userObj);
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = { run: runner(null, null, undefined) };
  /* Dipakai halaman untuk memeriksa konfigurasi lebih awal. */
  window.LABUKU_GAS_SIAP = function () { return urlValid(gasUrl()); };
})();
