import Database from 'better-sqlite3';
import { dev } from '$app/environment';

const DB_PATH = dev ? 'database/potobut.db' : '/data/potobut.db';

let db: Database.Database;

export function getDb(): Database.Database {
	if (!db) {
		db = new Database(DB_PATH);
		db.pragma('journal_mode = WAL');
		db.pragma('foreign_keys = ON');
		initSchema();
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
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`);
}
