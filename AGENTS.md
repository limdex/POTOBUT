# potobut — Photobooth Web App

## Dev commands

```sh
npm run dev          # start dev server
npm run build        # production build
npm run preview      # preview production build
npm run check        # typecheck (svelte-check)
```

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing — title + "Mulai" button |
| `/templates` | Template selection (3 templates, 3-column grid) |
| `/shoot` | Shooting — 5s countdown per shot, preview strip at bottom |
| `/review` | Review all captured photos composited onto chosen template |

## Architecture

- SvelteKit with Svelte 5 runes mode, TypeScript, Vite
- All UI in Bahasa Indonesia
- Template data in `$lib/data/templates.ts`
- Shared shoot state via `$lib/stores/shoot.svelte.ts` (`$state` runes)
- Template images stored in `static/templates/`
- Photos simulated via canvas placeholders (camera integration TBD)
- Review composites photos onto template PNG using canvas (template has transparent slots, photos drawn behind template)

## Template model

```
id: string, name, description, layout, slots, image, width (inch), height (inch), slotPositions: [{x%, y%, w%, h%}]
```

- `slotPositions` — percentage coordinates within the template image where photos are placed
- Max 3 columns in template grid — if admin adds more, they wrap to next row

## Known SSR quirk

Module-level `$state` in `.svelte.ts` resets during SSR in production builds.
Always pass page-specific data (like template ID) via URL search params + `load()` function in `+page.ts`, not via module state.

## Admin — Template Manager (`/admin`)

Simplified template manager with SQLite persistence.

### Routes

| Path | Description |
|------|-------------|
| `/admin` | Template list — shows existing templates or empty state "Belum ada template, bikin dulu cok!" |
| `/admin/editor` | Template editor — import background, add slots (up to 8, fixed 400×500px), overlay/ornament images |

### Data model (SQLite)

```
templates
  ├── id (INTEGER PRIMARY KEY)
  ├── name (TEXT)
  ├── canvas_width, canvas_height (INTEGER — set by BG image)
  ├── background_path (TEXT — uploaded image path)
  ├── slot_count (INTEGER — 1-8)
  ├── slots (TEXT — JSON array of {x, y, width, height})
  ├── overlays (TEXT — JSON array of {id, src, x, y, width, height, rotation})
  ├── created_at, updated_at (TEXT)
```

### Key files

| File | Purpose |
|------|---------|
| `src/lib/server/db.ts` | SQLite setup (better-sqlite3) |
| `src/lib/data/admin-types.ts` | Slot, Overlay, TemplateRecord types |
| `src/routes/admin/+page.svelte` | Template list with empty state |
| `src/routes/admin/+page.server.ts` | Loads templates from DB |
| `src/routes/admin/editor/+page.svelte` | Simple editor: BG upload, slots, overlays |
| `src/routes/admin/editor/+page.server.ts` | Loads single template from DB |
| `src/routes/api/templates/+server.ts` | GET all, POST create |
| `src/routes/api/templates/[id]/+server.ts` | GET/PUT/DELETE single template |
| `src/routes/api/upload/+server.ts` | Image upload → `static/uploads/` |
| `src/routes/api/camera/+server.ts` | GET camera status, POST connect, DELETE disconnect |
| `src/routes/api/printer/+server.ts` | GET printer status, POST connect, DELETE disconnect |
| `src/lib/server/camera.ts` | Camera auto-detect + delegation |
| `src/lib/server/camera/driver.ts` | `CameraDriver` interface |
| `src/lib/server/camera/gphoto2.ts` | gphoto2 driver (Canon/Nikon/Sony DSLR) |
| `src/lib/server/camera/webcam.ts` | USB webcam driver (fswebcam/ffmpeg) |
| `src/lib/server/camera/gopro.ts` | GoPro Wi-Fi API driver (HTTP) |
| `src/lib/server/printer.ts` | Printer detection via wmic (Windows) / lpstat (Linux) |

### Hardware — Admin Settings

Gear button on `/admin` opens a modal with camera + printer connection panels.

**Camera**: Auto-detects by trying each `CameraDriver` in order:
1. `Gphoto2Driver` — `gphoto2 --auto-detect` (Canon/Nikon/Sony DSLRs)
2. `WebcamDriver` — `fswebcam` / `ffmpeg` (USB webcams)
3. `GoProDriver` — ping `10.5.5.9` (GoPro Wi-Fi)

To add a new camera type, implement `CameraDriver` in `src/lib/server/camera/` and register it in `src/lib/server/camera.ts`.

Status shown as Terhubung/Terputus.
**Printer**: Detects available printers via `wmic printer get name` (Windows) or `lpstat -e` (Linux). Auto-selects first found.

### Editor workflow

1. Upload background image → canvas auto-sizes to image dimensions
2. Click **+Slot** to add photo slots (fixed 400×500px, up to 8)
3. Click **+Overlay** to upload overlay/ornament images (draggable + 8-handle resize)
4. Click slot/overlay to select → edit position in sidebar or delete
5. **Simpan** saves to SQLite and redirects to template list

## Current status

- Photo capture is simulated (colored canvas placeholders)
- Camera (Canon DSLR) integration TBD — detection via gphoto2 scaffolded
- Printer integration TBD — detection via wmic/lpstat scaffolded
- `slotPositions` are estimated; may need adjustment per template image
- Old template model (`src/lib/data/templates.ts`) is kept for backward compat with existing routes
