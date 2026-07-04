# potobut

Aplikasi **foto booth digital** berbasis web. Pengguna memilih template, berfoto dengan hitungan mundur 5 detik per jepretan, lalu melihat hasil yang dikomposit langsung ke template.

Dibangun dengan SvelteKit 5 (runes mode), TypeScript, Vite.

## Fitur

- **3 template** dengan tata letak foto vertikal dan dekorasi berbeda
- **Sesi pemotretan** dengan hitungan mundur animasi (5 detik per foto)
- **Pratinjau langsung** — thumbnail hasil foto muncul di strip bawah
- **Komposit otomatis** — foto ditempatkan ke slot template yang transparan

## Perangkat

3 perangkat terhubung:
- **Kamera** Canon DSLR (integrasi TBD)
- **Monitor** eksternal untuk konsumen
- **Laptop** tempat aplikasi berjalan
- **Printer** (integrasi TBD)

## Memulai

```sh
npm install
npm run dev
```

Buka `http://localhost:5173`.

## Scripts

| Perintah | Kegunaan |
|----------|----------|
| `npm run dev` | Jalankan server pengembangan |
| `npm run build` | Build produksi |
| `npm run preview` | Pratinjau build produksi |
| `npm run check` | Typecheck (svelte-check) |

## Struktur

```
src/
├── lib/
│   ├── components/    # TemplateCard, PhotoLayout
│   ├── data/          # templates.ts — data dan slot positions
│   └── stores/        # shoot.svelte.ts — state foto tertangkap
├── routes/
│   ├── +page.svelte           # Landing
│   ├── templates/+page.svelte # Pilih template
│   ├── shoot/+page.svelte     # Pemotretan
│   └── review/+page.svelte    # Hasil komposit
static/templates/              # Gambar template (PNG)
```
