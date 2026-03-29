<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';

	interface MapPoint {
		id: string;
		name: string;
		lat: number;
		lng: number;
		temperature: number;
		status: 'ok' | 'warn' | 'err';
		type: 'warehouse' | 'truck';
		speed?: number;
		delay?: number;
		stock?: number;
		targetLat?: number;
		targetLng?: number;
	}

	let { points = [] }: { points: MapPoint[] } = $props();

	let container: HTMLDivElement;
	let map: any = null;
	let L: any = null;
	let markerMap = new Map<string, any>();

	// ── Custom SVG marker ─────────────────────────────────────────────────────────
	function makeIcon(type: MapPoint['type'], status: MapPoint['status']) {
		const c = {
			ok: { fill: '#052e16', stroke: '#16a34a', glow: '#22c55e33' },
			warn: { fill: '#451a03', stroke: '#d97706', glow: '#f59e0b33' },
			err: { fill: '#450a0a', stroke: '#dc2626', glow: '#ef444433' }
		}[status];

		const shape =
			type === 'warehouse'
				? `<rect x="6" y="11" width="20" height="13" rx="2" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>
			   <polygon points="4,11 16,4 28,11" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>
			   <rect x="13" y="16" width="6" height="8" rx="1" fill="${c.stroke}" opacity="0.6"/>`
				: `<rect x="3" y="13" width="22" height="9" rx="3" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>
			   <rect x="17" y="9"  width="9"  height="8" rx="1.5" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>
			   <circle cx="8"  cy="22" r="3" fill="${c.stroke}"/>
			   <circle cx="22" cy="22" r="3" fill="${c.stroke}"/>`;

		return L.divIcon({
			html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
				<circle cx="16" cy="16" r="15" fill="${c.glow}"/>
				${shape}
			</svg>`,
			className: '',
			iconSize: [32, 32],
			iconAnchor: [16, 16],
			popupAnchor: [0, -20]
		});
	}

	// ── Popup HTML ────────────────────────────────────────────────────────────────
	function makePopup(p: MapPoint) {
		const statusPill = {
			ok: `<span style="color:#4ade80;font-size:10px">● OK</span>`,
			warn: `<span style="color:#fbbf24;font-size:10px">● WARN</span>`,
			err: `<span style="color:#f87171;font-size:10px">● ERR</span>`
		}[p.status];

		const rows =
			p.type === 'warehouse'
				? `<tr><td style="color:#71717a;padding-right:12px">Stock</td><td>${Math.round(p.stock ?? 0)} unit</td></tr>
			   <tr><td style="color:#71717a">Suhu</td><td>${p.temperature.toFixed(1)}°C</td></tr>`
				: `<tr><td style="color:#71717a;padding-right:12px">Speed</td><td>${Math.round(p.speed ?? 0)} km/h</td></tr>
			   <tr><td style="color:#71717a">Delay</td><td>${p.delay ? '+' + p.delay + ' min' : 'On Time'}</td></tr>
			   <tr><td style="color:#71717a">Suhu</td><td>${p.temperature.toFixed(1)}°C</td></tr>`;

		return `<div style="font-family:ui-monospace,monospace;font-size:12px;background:#18181b;color:#e4e4e7;border:1px solid #3f3f46;border-radius:8px;padding:10px 12px;min-width:160px;line-height:1.7">
			<div style="font-weight:600;font-size:13px;color:#f4f4f5;margin-bottom:4px">${p.name}</div>
			<div style="margin-bottom:6px">${statusPill}</div>
			<table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table>
		</div>`;
	}

	// ── Legend data ───────────────────────────────────────────────────────────────
	const legend = [
		{ label: 'OK', color: '#22c55e' },
		{ label: 'Warning', color: '#f59e0b' },
		{ label: 'Error', color: '#ef4444' },
		{ label: 'Warehouse', color: '#71717a', shape: 'house' },
		{ label: 'Truck', color: '#71717a', shape: 'truck' }
	];

	// ── Mount ─────────────────────────────────────────────────────────────────────
	onMount(async () => {
		const leaflet = await import('leaflet');
		L = leaflet.default;

		delete (L.Icon.Default.prototype as any)._getIconUrl;
		L.Icon.Default.mergeOptions({
			iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
			iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
			shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
		});

		map = L.map(container, {
			zoomControl: true,
			attributionControl: false
		}).setView([-3.5, 117.5], 5);

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: ''
		}).addTo(map);

		L.control.attribution({ prefix: false }).addAttribution('© OpenStreetMap').addTo(map);

		setTimeout(() => map.invalidateSize(), 150);
	});

	// ── Sync markers reactively ───────────────────────────────────────────────────
	$effect(() => {
		if (!map || !L) return;

		points.forEach((p) => {
			if (p.lat == null || p.lng == null) return;

			let marker = markerMap.get(p.id);

			if (!marker) {
				// buat marker sekali saja
				marker = L.marker([p.lat, p.lng], {
					icon: makeIcon(p.type, p.status)
				})
					.addTo(map)
					.bindPopup(makePopup(p), { className: 'scm-popup', maxWidth: 220 });

				markerMap.set(p.id, marker);
			} else {
				marker.setLatLng([p.lat, p.lng]);

				marker.setIcon(makeIcon(p.type, p.status));

				marker.setPopupContent(makePopup(p));
			}
		});

		const ids = new Set(points.map((p) => p.id));
		for (const [id, marker] of markerMap.entries()) {
			if (!ids.has(id)) {
				marker.remove();
				markerMap.delete(id);
			}
		}
	});
</script>

<Card.Root class="overflow-hidden border-zinc-800 bg-zinc-950">
	<Card.Header
		class="flex flex-row items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 py-2.5"
	>
		<Card.Title class="font-mono text-[10px] font-normal tracking-widest text-zinc-500 uppercase">
			Supply chain map — live nodes
		</Card.Title>
		<div class="flex items-center gap-3">
			{#each [{ label: 'OK', color: 'bg-emerald-500' }, { label: 'Warn', color: 'bg-amber-400' }, { label: 'Err', color: 'bg-red-500' }] as item}
				<span class="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
					<span class="h-1.5 w-1.5 rounded-full {item.color}"></span>
					{item.label}
				</span>
			{/each}
			<Badge
				variant="outline"
				class="border-zinc-700 px-1.5 py-0 font-mono text-[10px] text-zinc-500"
			>
				{points.length} nodes
			</Badge>
		</div>
	</Card.Header>

	<Card.Content class="p-0">
		<div bind:this={container} class="h-95 w-full"></div>
	</Card.Content>
</Card.Root>

<!-- Strip Leaflet popup default chrome -->
<style>
	:global(.scm-popup .leaflet-popup-content-wrapper) {
		background: transparent;
		box-shadow: none;
		padding: 0;
		border-radius: 0;
	}
	:global(.scm-popup .leaflet-popup-content) {
		margin: 0;
	}
	:global(.scm-popup .leaflet-popup-tip-container) {
		display: none;
	}
</style>
