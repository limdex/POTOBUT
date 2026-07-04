<script lang="ts">
	import { goto } from '$app/navigation';
</script>

<svelte:head>
	<title>POTOBUT— Foto Booth</title>
</svelte:head>

<div class="landing">
	<div class="hero">
		<h1>POTOBUT</h1>
		<p class="tagline">Foto Booth Digital — Cetak Langsung</p>
		<button class="btn" onclick={() => goto('/templates')}>
			Masuk
		</button>
	</div>
</div>

<style>
	.landing {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: 2rem;
	}
	.hero {
		text-align: center;
	}
	.hero h1 {
		font-size: 4rem;
		font-weight: 800;
		margin: 0;
		letter-spacing: -0.02em;
	}
	.tagline {
		font-size: 1.15rem;
		color: #6b7280;
		margin: 0.75rem 0 2rem;
	}
	.btn {
		padding: 1rem 3rem;
		font-size: 1.15rem;
		font-weight: 600;
		border: none;
		border-radius: 12px;
		background: #4f46e5;
		color: #fff;
		cursor: pointer;
		transition: opacity 0.15s, transform 0.15s;
	}
	.btn:hover {
		opacity: 0.9;
		transform: scale(1.03);
	}
</style>
