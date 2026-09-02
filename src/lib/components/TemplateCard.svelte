<script lang="ts">
	import type { Template } from '$lib/data/templates';

	let {
		template,
		selected,
		onselect
	}: {
		template: Template;
		selected: boolean;
		onselect: (id: string) => void;
	} = $props();
</script>

<button
	class="card"
	class:selected
	onclick={() => onselect(template.id)}
>
	<div class="card-preview">
		<img src={template.image} alt={template.name} />
		<div class="slots-badge">{template.slots} Foto</div>
	</div>
	<div class="card-info">
		<h3>{template.name}</h3>
		<p>{template.description}</p>
		<span class="size">{template.width}″ × {template.height}″</span>
	</div>
</button>

<style>
	.card-preview {
		position: relative;
		border-radius: 10px;
		overflow: hidden;
		background: #f3f4f6;
	}
	.card-preview img {
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
	.card-info p {
		margin: 0.2rem 0 0;
		font-size: 0.9rem;
		color: #6b7280;
	}
	.size {
		font-size: 0.85rem;
		color: #9ca3af;
	}
</style>
