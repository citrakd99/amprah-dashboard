# Dashboard Amprah (view only)

Web statis (HTML/CSS/JS murni, tanpa server & tanpa build) yang membaca sebuah Google Sheet
pelacakan pengeluaran, mengolah datanya di browser, lalu menampilkannya.

## Tidak ada data di repo ini
- Repo dan situs ini hanya berisi kode. Tidak ada data, dan **tidak ada link/ID sheet**.
- Link Google Sheet diberikan oleh pemakai:
  - lewat alamat `https://<situs>/#k=<link atau ID sheet>` (bagian setelah `#` tidak dikirim ke server), atau
  - ditempel di form saat halaman pertama dibuka.
- Link hanya disimpan di `localStorage` browser pemakai. Tombol **Keluar** menghapusnya.
- Jangan pernah mengisi `sheetId` di `js/config.js` lalu mem-push-nya.

## Format sheet
Sheet bernama `...PENGELUARAN...` dengan kolom: NO, TANGGAL, ITEM, JENIS AMPRAH, PIC, BANK, NOTA,
TOTAL PENGELUARAN, BUKTI TF, REMARKS. Kolom nomor rekening dan nama pemilik rekening tidak dibaca.
Sheet harus dibagikan "Siapa saja yang memiliki link → Pelihat".

## Menjalankan lokal

    python -m http.server 8765

## Dipasang sebagai aplikasi (PWA)
Situs ini bisa dipasang seperti aplikasi: tombol **Pasang aplikasi** (Chrome/Edge), atau di iPhone
Safari → Bagikan → **Tambahkan ke Layar Utama**. Service worker (`sw.js`) hanya menyimpan berkas
aplikasi; data sheet tidak pernah disimpan di cache.
