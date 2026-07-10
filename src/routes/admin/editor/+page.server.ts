import type { PageServerLoad } from './$types';
import { getParsedTemplate } from '$lib/server/db';

export const load: PageServerLoad = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) return { template: null };

	const template = getParsedTemplate(Number(id));
	return { template };
};
