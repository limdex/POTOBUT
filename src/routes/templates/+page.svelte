<script lang="ts">
	import { goto } from '$app/navigation';
	import { shootState } from '$lib/stores/shoot.svelte';

	let { data }: { data: { templates: any[] } } = $props();
	let selectedId = $state<number | null>(null);

	function select(id: number) {
		selectedId = id;
	}
</script>

<svelte:head>
	<title>Pilih Template — potobut</title>
</svelte:head>

<div class="page">
	<header>
		<h1>Pilih Template</h1>
		<p>Pilih tata letak foto yang kamu inginkan</p>
	</header>

	{#if data.templates.length === 0}
		<div class="empty">
			<p>Belum ada template tersedia.</p>
		</div>
	{:else}
		<div class="grid">
			{#each data.templates as template (template.id)}
				<button
					class="card"
					class:selected={selectedId === template.id}
					onclick={() => select(template.id)}
				>
					<div class="preview">
						<img src={template.background_path} alt={template.name} />
						<div class="slots-badge">{template.slot_count} Foto</div>
					</div>
					<div class="info">
						<h3>{template.name}</h3>
					</div>
				</button>
			{/each}
		</div>
	{/if}

	<div class="actions">
		<button class="btn" disabled={selectedId === null} onclick={() => { if (selectedId !== null) { shootState.reset(); goto(`/shoot?template=${selectedId}`); } }}>
		Lanjut
		</button>
	</div>
</div>

<style>
	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1.5rem 2rem;
	}
	header {
		text-align: center;
		margin-bottom: 1.5rem;
	}
	header h1 {
		font-size: 2rem;
		font-weight: 700;
		margin: 0;
	}
	header p {
		margin: 0.4rem 0 0;
		color: #6b7280;
		font-size: 1rem;
	}
	.empty {
		text-align: center;
		padding: 3rem 0;
		color: #9ca3af;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.5rem;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 0.85rem;
		border: 3px solid #e5e7eb;
		border-radius: 14px;
		background: #fff;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		font: inherit;
		width: 100%;
	}
	.card:hover {
		border-color: #4f46e5;
		box-shadow: 0 6px 20px rgba(79, 70, 229, 0.16);
	}
	.card.selected {
		border-color: #4f46e5;
		background: #eef2ff;
	}
	.preview {
		position: relative;
		border-radius: 10px;
		overflow: hidden;
		background: #f3f4f6;
	}
	.preview img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 3 / 4;
		object-fit: cover;
		max-height: 70vh;
	}
	.slots-badge {
		position: absolute;
		bottom: 8px;
		right: 8px;
		background: rgba(0, 0, 0, 0.65);
		color: #fff;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 4px 12px;
		border-radius: 8px;
	}
	.info h3 {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 600;
	}
	.actions {
		margin-top: 1.5rem;
		text-align: center;
	}
	.btn {
		padding: 1rem 3rem;
		font-size: 1.1rem;
		font-weight: 600;
		border: none;
		border-radius: 12px;
		background: #4f46e5;
		color: #fff;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.btn:not(:disabled):hover {
		opacity: 0.9;
	}
</style>
