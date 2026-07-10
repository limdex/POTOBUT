export interface Slot {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Overlay {
	id: string;
	src: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
}

export interface TemplateRecord {
	id: number;
	name: string;
	canvas_width: number;
	canvas_height: number;
	background_path: string;
	slot_count: number;
	slots: Slot[];
	overlays: Overlay[];
	created_at: string;
	updated_at: string;
}

export const SLOT_WIDTH = 500;
export const SLOT_HEIGHT = 400;
