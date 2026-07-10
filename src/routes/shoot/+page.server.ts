import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getParsedTemplate } from '$lib/server/db';

export const load: PageServerLoad = async ({ url }) => {
	const id = url.searchParams.get('template');
	if (!id) throw redirect(302, '/');

	const template = getParsedTemplate(Number(id));
	if (!template) throw redirect(302, '/');

	return { template };
};
