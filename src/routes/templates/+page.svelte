<script lang="ts">
	import { goto } from '$app/navigation';
	import { shootState } from '$lib/stores/shoot.svelte';
	import TemplatePreview from '$lib/components/TemplatePreview.svelte';

	import type { TemplateRecord } from '$lib/data/admin-types';

	let { data }: { data: { templates: TemplateRecord[] } } = $props();
	let selectedId = $state<number | null>(null);

	function select(id: number) {
		selectedId = id;
	}
</script>

<svelte:head>
	<title>Pilih Template — potobut</title>
</svelte:head>

<div class="container">
	<div class="top-nav">
		<button class="btn btn-outline btn-sm" onclick={() => goto('/')}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
			Kembali
		</button>
	</div>

	<header class="page-header is-centered">
		<h1>Pilih Template</h1>
		<p>Pilih tata letak foto yang kamu inginkan</p>
	</header>

	{#if data.templates.length === 0}
		<div class="empty-state">
			<p>Belum ada template tersedia.</p>
		</div>
	{:else}
		<div class="grid-responsive">
			{#each data.templates as template (template.id)}
				<div
					class="card"
					role="button"
					tabindex="0"
					class:selected={selectedId === template.id}
					onclick={() => select(template.id)}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') select(template.id); }}
				>
					<div class="card-preview">
						<TemplatePreview {template} />
						<div class="slots-badge">{template.slot_count} Foto</div>
					</div>
					<div class="card-info">
						<h3>{template.name}</h3>
						<span class="meta">{template.slot_count} slot · {template.canvas_width}×{template.canvas_height}</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="actions">
		<button class="btn btn-pill action-btn" disabled={selectedId === null} onclick={() => { if (selectedId !== null) { shootState.reset(); goto(`/shoot?template=${selectedId}`); } }}>
			<span class="btn-text">Lanjut ke Pemotretan</span>
			<svg class="btn-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
		</button>
	</div>
</div>

<style lang="scss">
	@use '../../styles/variables' as *;

	.top-nav {
		margin-bottom: 0.5rem;
	}

	.slots-badge {
		position: absolute;
		bottom: 10px;
		right: 10px;
		background: rgba(15, 23, 42, 0.75);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: #ffffff;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		padding: 4px 12px;
		border-radius: 9999px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
	}

	.actions {
		margin-top: 2.75rem;
		text-align: center;
	}

	.action-btn {
		position: relative;
		padding: 0.85rem 3.5rem;

		.btn-text {
			display: inline-block;
			text-align: center;
		}

		.btn-arrow {
			position: absolute;
			right: 1.5rem;
			top: 50%;
			transform: translateY(-50%);
			transition: transform 0.2s $ease-apple;
		}

		&:hover:not(:disabled) .btn-arrow {
			transform: translateY(-50%) translateX(3px);
		}
	}
</style>

