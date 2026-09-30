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
