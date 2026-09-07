# Bakul Sayur — Pengeluaran Fullstack

Production web app untuk manajemen pengeluaran Bakul Sayur.

## Stack
- Frontend: HTML/CSS/JavaScript responsive/PWA
- Backend: Supabase Auth + PostgreSQL + RPC + RLS
- Hosting: Vercel

## Production database
Database menggunakan tabel ber-prefix `bakul_` pada Supabase. Data historis telah dimigrasikan langsung ke Supabase.

**Catatan keamanan:** SQL dump transaksi nyata tidak disimpan di repository public ini. Data operasional hanya berada di Supabase.

## Data migrasi terverifikasi
- 241 master item
- 450 transaksi
- Total historis Rp22.766.900
- Rentang 2026-07-28 s.d. 2026-09-05
- 0 transaksi tanpa relasi item

## Local preview
```bash
python3 -m http.server 8080
```
