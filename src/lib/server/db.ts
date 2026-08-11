import Database from 'better-sqlite3';
import { dev } from '$app/environment';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DB_PATH = dev ? 'database/potobut.db' : 'data/potobut.db';

let db: Database.Database;
let _schemaInit = false;

const _templateCache = new Map<number, any>();

export function getDb(): Database.Database {
	if (!db) {
		const dir = dirname(DB_PATH);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		db = new Database(DB_PATH);
		db.pragma('journal_mode = WAL');
		db.pragma('foreign_keys = ON');
		if (!_schemaInit) {
			initSchema();
			_schemaInit = true;
		}
	}
	return db;
}

function initSchema() {
	db.exec(`
		CREATE TABLE IF NOT EXISTS templates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL DEFAULT 'Template Baru',
			canvas_width INTEGER NOT NULL,
			canvas_height INTEGER NOT NULL,
			background_path TEXT NOT NULL DEFAULT '',
			slot_count INTEGER NOT NULL DEFAULT 4,
			slots TEXT NOT NULL DEFAULT '[]',
			overlays TEXT NOT NULL DEFAULT '[]',
			bg_offset_x INTEGER NOT NULL DEFAULT 0,
			bg_offset_y INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`);

	try {
		db.exec('ALTER TABLE templates ADD COLUMN bg_offset_x INTEGER NOT NULL DEFAULT 0');
	} catch {}
	try {
		db.exec('ALTER TABLE templates ADD COLUMN bg_offset_y INTEGER NOT NULL DEFAULT 0');
	} catch {}

	db.exec(`
		CREATE TABLE IF NOT EXISTS canvas_presets (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			width INTEGER NOT NULL,
			height INTEGER NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`);
}

export interface CanvasPresetRecord {
	id: number;
	name: string;
	width: number;
	height: number;
	created_at: string;
}

export function getAllCanvasPresets(): CanvasPresetRecord[] {
	const db = getDb();
	return db.prepare('SELECT * FROM canvas_presets ORDER BY id ASC').all() as CanvasPresetRecord[];
}

export function addCanvasPresetDb(width: number, height: number): CanvasPresetRecord | null {
	const db = getDb();
	const countRow = db.prepare('SELECT COUNT(*) as count FROM canvas_presets').get() as { count: number };
	if (countRow.count >= 10) return null;

	const nextNum = countRow.count + 1;
	const name = `Default ${nextNum}`;

	const info = db.prepare('INSERT INTO canvas_presets (name, width, height) VALUES (?, ?, ?)').run(name, width, height);
	return db.prepare('SELECT * FROM canvas_presets WHERE id = ?').get(info.lastInsertRowid) as CanvasPresetRecord;
}

export function deleteCanvasPresetDb(id: number): boolean {
	const db = getDb();
	const info = db.prepare('DELETE FROM canvas_presets WHERE id = ?').run(id);
	return info.changes > 0;
}

export function getParsedTemplate(id: number) {
	if (_templateCache.has(id)) return _templateCache.get(id);
	const db = getDb();
	const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as any;
	if (!row) return null;
	const parsed = {
		...row,
		slots: JSON.parse(row.slots || '[]'),
		overlays: JSON.parse(row.overlays || '[]')
	};
	_templateCache.set(id, parsed);
	return parsed;
}

export function invalidateTemplateCache(id?: number) {
	if (id !== undefined) {
		_templateCache.delete(id);
	} else {
		_templateCache.clear();
	}
}
