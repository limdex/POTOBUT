// libgphoto2 camera worker — runs inside MSYS2 bash
// Protocol: JSON lines, stdin → stdout
const koffi = require('koffi');
const readline = require('readline');

const lib = koffi.load('C:/msys64/mingw64/bin/libgphoto2-6.dll');
const GP_OK = 0;

// ── Cached function bindings (created once, not per-frame) ──
const F = {
    ctxNew: lib.func('void *gp_context_new()'),
    ctxUnref: lib.func('void gp_context_unref(void *ctx)'),
    camNew: lib.func('int32_t gp_camera_new(void **camera)'),
    camInit: lib.func('int32_t gp_camera_init(void *camera, void *ctx)'),
    camExit: lib.func('int32_t gp_camera_exit(void *camera, void *ctx)'),
    camFree: lib.func('void gp_camera_free(void *camera)'),
    fileNew: lib.func('int32_t gp_file_new(void **file)'),
    fileFree: lib.func('void gp_file_free(void *file)'),
    fileData: lib.func('int32_t gp_file_get_data_and_size(void *file, void **data, uint64_t *size)'),
    capture: lib.func('int32_t gp_camera_capture(void *camera, int32_t type, void *path, void *ctx)'),
    capturePreview: lib.func('int32_t gp_camera_capture_preview(void *camera, void *file, void *ctx)'),
    fileGet: lib.func('int32_t gp_camera_file_get(void *camera, const char *folder, const char *filename, int32_t type, void *file, void *ctx)'),
    fileDelete: lib.func('int32_t gp_camera_file_delete(void *camera, const char *folder, const char *filename, void *ctx)'),
    getConfig: lib.func('int32_t gp_camera_get_config(void *camera, void **window, void *ctx)'),
    setConfig: lib.func('int32_t gp_camera_set_config(void *camera, void *window, void *ctx)'),
    getChild: lib.func('int32_t gp_widget_get_child_by_name(void *widget, const char *name, void **child)'),
    setValue: lib.func('int32_t gp_widget_set_value(void *widget, const char *value)'),
    freeWidget: lib.func('void gp_widget_free(void *widget)'),
};

// ── Cached memcpy ──
const _memcpy = koffi.load('ucrtbase.dll').func('void *memcpy(void *dst, void *src, uint64_t len)');

// ── Helpers ──
function allocBuf(size) { return Buffer.alloc(size || 8); }
function readPtr(b) { return b.readBigUInt64LE(0); }

let camera_val, ctx_val;

// ── Init with retries ──
(function doInit() {
    const ctx = F.ctxNew();
    const camBuf = allocBuf();
    F.camNew(camBuf);
    const camera = readPtr(camBuf);
    var err = F.camInit(camera, ctx);

    if (err !== GP_OK) {
        try { F.camExit(camera, ctx); } catch (_) {}
        try { F.camFree(camera); } catch (_) {}
        try { F.ctxUnref(ctx); } catch (_) {}

        var retries = (typeof _retryCount !== 'undefined' ? _retryCount : 0) + 1;
        if (retries <= 3) {
            _retryCount = retries;
            setTimeout(doInit, 2000);
            return;
        }

        process.stdout.write(JSON.stringify({ ok: false, error: 'init: ' + err }) + '\n');
        process.exit(1);
    }

    ctx_val = ctx;
    camera_val = camera;
    process.stdout.write(JSON.stringify({ ok: true, event: 'ready' }) + '\n');
})();

// ── Cleanup ──
process.on('exit', cleanup);
process.on('SIGTERM', function () { cleanup(); process.exit(0); });
process.on('SIGINT', function () { cleanup(); process.exit(0); });

function cleanup() {
    try { F.camExit(camera_val, ctx_val); } catch (_) {}
    try { F.camFree(camera_val); } catch (_) {}
    try { F.ctxUnref(ctx_val); } catch (_) {}
}

function memcopy(srcPtr, size) {
    if (srcPtr === 0n || size <= 0 || size > 50_000_000) return null;
    try {
        var dst = Buffer.alloc(size);
        _memcpy(dst, srcPtr, BigInt(size));
        return dst;
    } catch (_) { return null; }
}

// ── IPC ──
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', function (line) {
    try { handle(JSON.parse(line)); }
    catch (e) { respond('', { ok: false, error: e.message }); }
});

function respond(id, obj) {
    process.stdout.write(JSON.stringify({ id: id, ok: obj.ok, event: obj.event, data: obj.data, size: obj.size, error: obj.error }) + '\n');
}

function handle(msg) {
    var id = msg.id || '';
    switch (msg.cmd) {
        case 'preview': preview(id); break;
        case 'capture': capture(id); break;
        case 'config': configMsg(id, msg.key, msg.value); break;
        case 'exit': respond(id, { ok: true, event: 'bye' }); cleanup(); process.exit(0); break;
        default: respond(id, { ok: false, error: 'unknown' });
    }
}

function preview(id) {
    var fb = allocBuf();
    if (F.fileNew(fb) !== GP_OK) { respond(id, { ok: false }); return; }
    var file = readPtr(fb);
    if (F.capturePreview(camera_val, file, ctx_val) !== GP_OK) {
        F.fileFree(file);
        respond(id, { ok: false }); return;
    }
    var db = allocBuf(), sb = allocBuf();
    F.fileData(file, db, sb);
    var dp = readPtr(db), sz = Number(sb.readBigUInt64LE(0));
    if (sz > 500 && dp !== 0n) {
        var jpeg = memcopy(dp, sz);
        F.fileFree(file);
        respond(id, jpeg ? { ok: true, data: jpeg.toString('base64'), size: sz } : { ok: false });
    } else {
        F.fileFree(file);
        respond(id, { ok: false });
    }
}

function capture(id) {
    var pb = Buffer.alloc(1152);
    if (F.capture(camera_val, 0, pb, ctx_val) !== GP_OK) {
        respond(id, { ok: false }); return;
    }
    var name = pb.toString('utf8', 0, 128).replace(/\0/g, '').trim();
    var folder = pb.toString('utf8', 128, 128 + 1024).replace(/\0/g, '').trim();

    var fb = allocBuf();
    F.fileNew(fb);
    var df = readPtr(fb);
    if (F.fileGet(camera_val, folder, name, 1, df, ctx_val) !== GP_OK) {
        F.fileFree(df);
        respond(id, { ok: false }); return;
    }
    var db = allocBuf(), sb = allocBuf();
    F.fileData(df, db, sb);
    var dp = readPtr(db), sz = Number(sb.readBigUInt64LE(0));
    if (sz > 500 && dp !== 0n) {
        var jpeg = memcopy(dp, sz);
        F.fileFree(df);
        try { F.fileDelete(camera_val, folder, name, ctx_val); } catch (_) {}
        respond(id, jpeg ? { ok: true, data: jpeg.toString('base64'), size: sz } : { ok: false });
    } else {
        F.fileFree(df);
        respond(id, { ok: false });
    }
}

function configMsg(id, key, value) {
    var wb = allocBuf();
    if (F.getConfig(camera_val, wb, ctx_val) !== GP_OK) {
        respond(id, { ok: false }); return;
    }
    var win = readPtr(wb);
    var cb = allocBuf();
    if (F.getChild(win, key, cb) === GP_OK) {
        F.setValue(readPtr(cb), value);
    }
    F.setConfig(camera_val, win, ctx_val);
    F.freeWidget(win);
    respond(id, { ok: true });
}
