export interface PaperSize {
	label: string;
	width: number;
	height: number;
}

export const paperSizes: Record<string, PaperSize> = {
	a4: { label: 'A4', width: 3508, height: 2480 },
	'4r': { label: '4R', width: 1800, height: 1200 },
};
