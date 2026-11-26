# Bakul Sayur — Pengeluaran Offline-First

Production web app untuk manajemen pengeluaran Bakul Sayur.

## Stack
- Frontend: HTML/CSS/JavaScript responsive + PWA
- Offline: Service Worker + IndexedDB
- Backend: Supabase PostgreSQL + RPC + Edge Function PIN
- Hosting: Vercel

## Production database
Aplikasi menggunakan project Supabase `nxnecmtlzfgududejput`. Data historis berada di tabel ber-prefix `bakul_`; dump transaksi nyata tidak disimpan di repository public.

## Data terverifikasi
- 244 master item
- 472 transaksi
- Total historis Rp23.237.900
- Rentang 2026-07-28 s.d. 2026-09-22

## Cara kerja offline
- Setelah login online pertama kali, master data/dashboard/riwayat yang pernah dibuka disimpan ke IndexedDB.
- Saat internet putus, aplikasi tetap dapat dibuka dari cache PWA.
- Input transaksi memakai item yang sudah ada dapat disimpan ke antrean lokal.
- Saat koneksi kembali, antrean otomatis dikirim ke Supabase lalu cache diperbarui.
- Penambahan master item baru tetap membutuhkan internet untuk menjaga konsistensi ID database.

## Local preview
```bash
python3 -m http.server 8080
```

## Pengembangan laporan dan kas inventory
- Branch pengembangan: feat/pengeluaran-laporan-kas. Jalankan SQL `supabase/cash-ledger.sql` hanya setelah database sehat. Deploy `supabase/functions/bakul-pin-api/index.ts` ke fungsi yang sama setelah migrasi; pertahankan autentikasi PIN yang sudah ada. Kemudian lakukan tes login, baca/tulis, dan rekonsiliasi sebelum merilis frontend.
- Saldo seharusnya = saldo awal + tambahan + transfer masuk − transfer keluar − belanja tunai. Saldo aktual − saldo seharusnya = selisih. Pengeluaran non-tunai tetap masuk laporan biaya, tidak mengurangi kas fisik. Transfer bukan biaya; ongkir yang benar-benar dibayar dicatat sebagai pengeluaran. Saldo awal diisi setiap hari (tidak otomatis carry-over). WITA.
- Laporan memilih tanggal/bulan, bukan menghapus data. Rekonsiliasi membutuhkan internet, saldo awal, metode tunai yang dikenali dan antrean offline kosong. Download CSV dan cetak PDF melalui browser. Analisis harga statistik berbasis harga tertimbang per satuan, belum memakai LLM.
