/*
 * v4 — Komponen bersama (dipakai Index & Form publik lewat include('Komponen')).
 * Aturan aman HtmlService: tidak ada garis miring ganda di dalam string, tanpa escape garis-miring terbalik.
 */
window.LabukuUI = (function () {
  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function kabPendek(n) { return String(n || '').replace(/^Kabupaten /, 'Kab. '); }

  /* ---------- Dropdown wilayah adaptif ----------
   * opts.home  : { prov:[k,n], kab:[k,n], utama:[k,n], kec:[[k,n,[[akhiran,n]]]], provinsi:[[k,n]] }
   * opts.id    : prefiks id elemen (untuk pengujian/aksesibilitas)
   * v5: luar kabupaten utama → provinsi dipilih, kab/kota, kecamatan, desa DIKETIK (tanpa memuat data server).
   */
  function Wilayah(root, opts) {
    var home = opts.home, pid = opts.id || 'wil';
    var st = { mode: 'utama', manual: false };
    root.innerHTML = '';
    var modeBox = mk('div', 'wil-mode');
    var MODES = [['utama', 'Kec. ' + home.utama[1]], ['kab', 'Kec. lain'], ['luar', 'Luar ' + kabPendek(home.kab[1])]];
    MODES.forEach(function (m) {
      var b = mk('button', 'wil-mode-btn', m[1]);
      b.type = 'button';
      b.id = pid + 'Mode_' + m[0];
      b.setAttribute('data-mode', m[0]);
      b.addEventListener('click', function () { setMode(m[0]); });
      modeBox.appendChild(b);
    });
    var grid = mk('div', 'wil-grid');
    var LBL = { prov: 'Provinsi', kab: 'Kabupaten/Kota', kec: 'Kecamatan', desa: 'Desa/Kelurahan' };
    var f = {};
    ['prov', 'kab', 'kec', 'desa'].forEach(function (k) {
      var wrap = mk('div', 'wil-f');
      var lab = mk('label', 'wil-lbl', LBL[k]);
      var sel = mk('select', 'form-select wil-sel');
      sel.id = pid + '_' + k;
      lab.setAttribute('for', sel.id);
      var inp = mk('input', 'form-control wil-inp');
      inp.type = 'text'; inp.id = pid + '_' + k + 'Txt'; inp.maxLength = 80;
      inp.placeholder = 'Ketik nama ' + LBL[k].toLowerCase();
      inp.style.display = 'none';
      wrap.appendChild(lab); wrap.appendChild(sel); wrap.appendChild(inp);
      grid.appendChild(wrap);
      f[k] = { wrap: wrap, sel: sel, inp: inp };
    });
    var ringkas = mk('div', 'wil-ringkas');
    var hint = mk('div', 'wil-hint');
    hint.style.display = 'none';
    root.appendChild(modeBox); root.appendChild(grid); root.appendChild(ringkas); root.appendChild(hint);

    function fill(k, list, ph, selected) {
      var sel = f[k].sel;
      sel.innerHTML = '';
      var o0 = mk('option', '', ph); o0.value = ''; sel.appendChild(o0);
      (list || []).forEach(function (x) {
        var o = mk('option', '', x[1]); o.value = x[0];
        if (selected && selected === x[0]) o.selected = true;
        sel.appendChild(o);
      });
      sel.disabled = false;
    }
    function kosong(k, ph) { fill(k, [], ph); f[k].sel.disabled = true; }
    function show(k, yes) { f[k].wrap.style.display = yes ? '' : 'none'; }
    function homeDesa(kecKode) {
      var kec = home.kec.filter(function (x) { return x[0] === kecKode; })[0];
      return kec ? kec[2].map(function (d) { return [kec[0] + '.' + d[0], d[1]]; }) : [];
    }
    function teks(k) { var s = f[k].sel; return s.value ? s.options[s.selectedIndex].text : ''; }
    function setManual(on) {
      st.manual = on;
      ['kab', 'kec', 'desa'].forEach(function (k) {
        f[k].sel.style.display = on ? 'none' : '';
        f[k].inp.style.display = on ? '' : 'none';
      });
      hint.textContent = '';
      hint.style.display = 'none';
      update();
    }
    function setMode(m) {
      st.mode = m;
      Array.prototype.forEach.call(modeBox.children, function (b) { b.classList.toggle('active', b.getAttribute('data-mode') === m); });
      ['kab', 'kec', 'desa'].forEach(function (k) { f[k].inp.value = ''; });
      show('prov', m === 'luar'); show('kab', m === 'luar'); show('kec', m !== 'utama'); show('desa', true);
      if (m === 'utama') fill('desa', homeDesa(home.utama[0]), 'Pilih desa/kelurahan...');
      else if (m === 'kab') { fill('kec', home.kec.map(function (x) { return [x[0], x[1]]; }), 'Pilih kecamatan...'); kosong('desa', 'Pilih kecamatan dulu'); }
      else fill('prov', home.provinsi, 'Pilih provinsi...');
      setManual(m === 'luar');
    }
    function onKec(done) {
      if (!f.kec.sel.value) { kosong('desa', 'Pilih kecamatan dulu'); update(); return; }
      fill('desa', homeDesa(f.kec.sel.value), 'Pilih desa/kelurahan...'); update(); if (done) done();
    }
    f.prov.sel.addEventListener('change', update);
    f.kec.sel.addEventListener('change', function () { onKec(); });
    f.desa.sel.addEventListener('change', update);
    ['kab', 'kec', 'desa'].forEach(function (k) { f[k].inp.addEventListener('input', update); });

    function bagian() {
      if (st.mode === 'utama') return [teks('desa'), home.utama[1], home.kab[1], home.prov[1]];
      if (st.mode === 'kab') return [teks('desa'), teks('kec'), home.kab[1], home.prov[1]];
      if (st.manual) return [f.desa.inp.value.trim(), f.kec.inp.value.trim(), f.kab.inp.value.trim(), teks('prov')];
      return [teks('desa'), teks('kec'), teks('kab'), teks('prov')];
    }
    function update() {
      var b = bagian();
      ringkas.textContent = b[0] ? b[0] + ', Kec. ' + b[1] + ', ' + b[2] + ', ' + b[3] : '';
    }
    function getValue() {
      if (st.mode === 'luar') {
        var b = bagian();
        if (!b[3] || !b[2] || !b[1] || !b[0]) return { ok: false, error: 'Lengkapi provinsi, kabupaten/kota, kecamatan, dan desa/kelurahan.' };
        return { ok: true, data: { manual: true, provinsiKode: f.prov.sel.value, provinsi: b[3], kabKota: b[2], kecamatan: b[1], desa: b[0] }, label: ringkas.textContent };
      }
      var d = f.desa.sel.value;
      if (!d) return { ok: false, error: 'Pilih alamat sampai desa/kelurahan.' };
      return { ok: true, data: { desaKode: d }, label: ringkas.textContent };
    }
    function getState() {
      return { mode: st.mode, manual: st.manual, prov: f.prov.sel.value, kab: f.kab.sel.value, kec: f.kec.sel.value, desa: f.desa.sel.value,
        txt: { kab: f.kab.inp.value, kec: f.kec.inp.value, desa: f.desa.inp.value } };
    }
    function pilih(k, v) { f[k].sel.value = v || ''; }
    function restore(s) {
      if (!s) return;
      setMode(s.mode || 'utama');
      if (s.mode === 'kab') { pilih('kec', s.kec); onKec(function () { pilih('desa', s.desa); update(); }); return; }
      if (s.mode !== 'luar') { pilih('desa', s.desa); update(); return; }
      pilih('prov', s.prov);
      ['kab', 'kec', 'desa'].forEach(function (k) { f[k].inp.value = (s.txt && s.txt[k]) || ''; });
      update();
    }
    setMode('utama');
    return { getValue: getValue, getState: getState, restore: restore, setMode: setMode };
  }

  /* ---------- Daftar layanan: cari + kategori yang bisa dibuka; paling sering dipakai di atas ----------
   * opts.items    : [{ id, nama, kategori, pakai }]
   * opts.kategori : urutan kategori
   * opts.onPick   : function (item)
   */
  function LayananList(box, opts) {
    var openKat = null; /* v5: hanya satu kategori terbuka; membuka kategori lain menutup yang sebelumnya */
    function urut(a, b) { return (b.pakai - a.pakai) || String(a.nama).localeCompare(String(b.nama)); }
    function pendek(k) { return String(k || '').replace(/^Layanan /, ''); }
    /* v6.1: cukup nama layanan — tanpa kategori kecil & angka pemakaian (lebih ringkas). */
    function itemBtn(it, sub) {
      var b = mk('button', 'lpx-item' + (sub ? ' sub' : ''));
      b.type = 'button';
      b.setAttribute('data-id', it.id);
      b.appendChild(mk('span', '', it.nama));
      b.addEventListener('click', function () { opts.onPick(it); });
      return b;
    }
    function render(query) {
      var items = (opts.items || []).slice().sort(urut);
      var q = String(query || '').toLowerCase().trim();
      var st = box.scrollTop;
      box.innerHTML = '';
      box.style.display = '';
      if (q) {
        var words = q.split(' ').filter(function (w) { return w; });
        var hasil = items.filter(function (it) {
          var hay = (it.nama + ' ' + it.kategori).toLowerCase();
          return words.every(function (w) { return hay.indexOf(w) !== -1; });
        }).slice(0, 40);
        if (!hasil.length) box.appendChild(mk('div', 'lpx-empty', 'Layanan tidak ditemukan.'));
        hasil.forEach(function (it) { box.appendChild(itemBtn(it, false)); });
        tambahLain();
        return;
      }
      var sering = items.filter(function (it) { return it.pakai > 0; }).slice(0, 5);
      if (sering.length) {
        box.appendChild(mk('div', 'lpx-head', 'Teratas'));
        sering.forEach(function (it) { box.appendChild(itemBtn(it, false)); });
      }
      tambahLain(); /* v6.4: langsung terlihat tanpa menggulir */
      box.appendChild(mk('div', 'lpx-head', 'Kategori'));
      (opts.kategori || []).forEach(function (kat) {
        var isi = items.filter(function (it) { return it.kategori === kat; });
        if (!isi.length) return;
        var h = mk('button', 'lpx-kat');
        h.type = 'button';
        h.setAttribute('data-kat', kat);
        var kiri = mk('span', '', (openKat === kat ? '▾ ' : '▸ ') + pendek(kat));
        h.appendChild(kiri);
        h.addEventListener('click', function () { openKat = openKat === kat ? null : kat; render(''); });
        box.appendChild(h);
        if (openKat === kat) isi.forEach(function (it) { box.appendChild(itemBtn(it, true)); });
      });
      box.scrollTop = st;
    }
    /* v6.4/6.12: pilihan "Layanan Lainnya (tulis sendiri)" selalu ada (di bawah Teratas, atau di akhir hasil cari) */
    function tambahLain() {
      if (!opts.lain) return;
      var b = itemBtn(opts.lain, false);
      b.className += ' lpx-lain';
      box.appendChild(b);
    }
    return { render: render, hide: function () { box.style.display = 'none'; } };
  }

  return { Wilayah: Wilayah, LayananList: LayananList };
})();
