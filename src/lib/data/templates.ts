export type TemplateId = 't1' | 't2' | 't3';

export interface SlotPosition {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface SlotGrid {
	cols: number;
	rows: number;
	marginX: number;
	marginY: number;
	gapX: number;
	gapY: number;
}

export interface Template {
	id: TemplateId;
	name: string;
	description: string;
	layout: string;
	slots: number;
	image: string;
	width: number;
	height: number;
	slotPositions: SlotPosition[];
}

function computeSlotPositions(grid: SlotGrid): SlotPosition[] {
	const { cols, rows, marginX, marginY, gapX, gapY } = grid;
	const positions: SlotPosition[] = [];
	const slotW = (100 - marginX * 2 - gapX * (cols - 1)) / cols;
	const slotH = (100 - marginY * 2 - gapY * (rows - 1)) / rows;
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			positions.push({
				x: Math.round((marginX + c * (slotW + gapX)) * 10) / 10,
				y: Math.round((marginY + r * (slotH + gapY)) * 10) / 10,
				w: Math.round(slotW * 10) / 10,
				h: Math.round(slotH * 10) / 10
			});
		}
	}
	return positions;
}

export const templates: Template[] = [
	{
		id: 't1',
		name: 'Template 1',
		description: 'Grid 2×2 — tata letak foto booth klasik',
		layout: '2x2',
		slots: 4,
		image: '/templates/t1.png',
		width: 4,
		height: 6,
		slotPositions: computeSlotPositions({ cols: 1, rows: 4, marginX: 5, marginY: 0, gapX: 0, gapY: 0 })
	},
	{
		id: 't2',
		name: 'Template 2',
		description: 'Strip vertikal 4 foto, dekorasi minimalis',
		layout: '4x1',
		slots: 4,
		image: '/templates/t2.png',
		width: 4,
		height: 6,
		slotPositions: computeSlotPositions({ cols: 1, rows: 4, marginX: 5, marginY: 0, gapX: 0, gapY: 0 })
	},
	{
		id: 't3',
		name: 'Template 3',
		description: 'Strip vertikal 4 foto, dekorasi penuh',
		layout: '1x4',
		slots: 4,
		image: '/templates/t3.png',
		width: 4,
		height: 6,
		slotPositions: computeSlotPositions({ cols: 1, rows: 4, marginX: 5, marginY: 2, gapX: 0, gapY: 1 })
	}
];
