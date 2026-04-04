<script lang="ts">
	import './layout.css';
	import 'leaflet/dist/leaflet.css';
	import favicon from '$lib/images/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher />
{@render children()}
