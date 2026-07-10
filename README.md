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
- **Kamera** Canon DSLR via USB + gphoto2
- **Monitor** eksternal untuk konsumen
- **Laptop Windows** tempat aplikasi berjalan
- **Printer** (via USB/WiFi, dikelola di panel admin)

## Setup Kamera (Canon DSLR)

Aplikasi menggunakan **gphoto2** untuk mengontrol kamera Canon/Nikon/Sony DSLR melalui USB.

### 1. Install gphoto2 di Windows

Download dan install MSYS2 dari [msys2.org](https://www.msys2.org), lalu buka **MSYS2 MINGW64** terminal dan jalankan:

```sh
pacman -Syu
pacman -S mingw-w64-x86_64-gphoto2
```

### 2. Tambahkan ke PATH

Buka **Edit environment variables** di Windows, tambahkan ke `Path`:

```
C:\msys64\mingw64\bin
```

### 3. Tes koneksi

Colok Canon DSLR via kabel USB, nyalakan kamera, lalu jalankan:

```sh
gphoto2 --auto-detect
```

Harus muncul nama kamera (mis. `Canon EOS 2000D`) dan port USB.

### 4. Jalankan aplikasi

```sh
npm install
npm run dev
```

Buka `http://localhost:5173/admin` → klik gear ⚙ → **Sambungkan Kamera**. Status berubah ke **Terhubung** jika kamera terdeteksi.

### Driver alternatif

| Driver | Kebutuhan | Kualitas |
|--------|-----------|----------|
| **gphoto2** (utama) | gphoto2 via MSYS2 | Full-res DSLR + kontrol exposure |
| **DirectShow** (fallback) | ffmpeg terinstall | Webcam-grade, cocok untuk tes tanpa DSLR |
| **Webcam** | ffmpeg/fswebcam | 640×480, fallback terakhir |

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
