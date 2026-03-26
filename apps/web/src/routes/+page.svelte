<script lang="ts">
	import { onMount } from 'svelte';
	import { ws } from '$lib/ws';

	let events = $state<any[]>([]);
	let totalStock = $state(0);

	onMount(() => {
		ws.onmessage = (event) => {
			const data = JSON.parse(event.data);

			if (data.type === 'sensor_update') {
				events = [data.payload, ...events];

				totalStock = events.reduce((acc, e) => acc + e.stock, 0);
			}
		};
	});
</script>

<h1>📡 Supply Chain Dashboard</h1>
<p>Total Stock: {totalStock}</p>

<ul>
	{#each events as e}
		<li>{e.temperature}°C - Stock: {e.stock}</li>
	{/each}
</ul>
