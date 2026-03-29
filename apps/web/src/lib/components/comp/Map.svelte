<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
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
	let animFrame: number | null = null;

	interface TruckAnim {
		segIdx: number;
		segProg: number;
		bearing: number;
		route: [number, number][]; // decoded from OSRM
		ready: boolean;
	}

	const truckAnim = new Map<string, TruckAnim>();
	const markerMap = new Map<string, any>();

	// ── OSRM route fetch ──────────────────────────────────────────────────────────
	async function fetchOSRMRoute(
		fromLat: number,
		fromLng: number,
		toLat: number,
		toLng: number
	): Promise<[number, number][]> {
		try {
			// OSRM public demo server — no API key needed
			const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
			const res = await fetch(url);
			const json = await res.json();

			if (json.code !== 'Ok' || !json.routes?.[0]) throw new Error('OSRM no route');

			// GeoJSON coords are [lng, lat] — flip to [lat, lng]
			return json.routes[0].geometry.coordinates.map(
				([lng, lat]: [number, number]) => [lat, lng] as [number, number]
			);
		} catch (e) {
			console.warn('OSRM failed, using straight line:', e);
			return [
				[fromLat, fromLng],
				[toLat, toLng]
			];
		}
	}

	// ── Helpers ───────────────────────────────────────────────────────────────────
	function calcBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
		const r = Math.PI / 180;
		const dL = (lng2 - lng1) * r;
		const y = Math.sin(dL) * Math.cos(lat2 * r);
		const x =
			Math.cos(lat1 * r) * Math.sin(lat2 * r) -
			Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos(dL);
		return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
	}

	function lerpAngle(a: number, b: number, t: number): number {
		let d = b - a;
		if (d > 180) d -= 360;
		if (d < -180) d += 360;
		return a + d * t;
	}

	function segLen(a: [number, number], b: [number, number]): number {
		const dLat = b[0] - a[0],
			dLng = b[1] - a[1];
		return Math.sqrt(dLat * dLat + dLng * dLng);
	}

	// ── Icons ─────────────────────────────────────────────────────────────────────
	function makeWarehouseIcon(status: MapPoint['status']) {
		const c = {
			ok: { fill: '#052e16', stroke: '#16a34a', glow: '#22c55e33' },
			warn: { fill: '#451a03', stroke: '#d97706', glow: '#f59e0b33' },
			err: { fill: '#450a0a', stroke: '#dc2626', glow: '#ef444433' }
		}[status];
		return L.divIcon({
			html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
				<circle cx="16" cy="16" r="15" fill="${c.glow}"/>
				<rect x="6" y="11" width="20" height="13" rx="2" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>
				<polygon points="4,11 16,4 28,11" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>
				<rect x="13" y="16" width="6" height="8" rx="1" fill="${c.stroke}" opacity="0.7"/>
			</svg>`,
			className: '',
			iconSize: [32, 32],
			iconAnchor: [16, 16],
			popupAnchor: [0, -20]
		});
	}

	function makeTruckIcon(status: MapPoint['status'], bearing: number) {
		const c = {
			ok: { fill: '#052e16', stroke: '#16a34a', glow: '#22c55e55' },
			warn: { fill: '#451a03', stroke: '#d97706', glow: '#f59e0b55' },
			err: { fill: '#450a0a', stroke: '#dc2626', glow: '#ef444455' }
		}[status];
		return L.divIcon({
			html: `<div style="width:36px;height:36px;transform:rotate(${bearing}deg);transform-origin:50% 50%">
				<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
					<circle cx="18" cy="18" r="16" fill="${c.glow}"/>
					<rect x="4"  y="14" width="20" height="10" rx="2.5" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>
					<rect x="21" y="11" width="11" height="9"  rx="2"   fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>
					<rect x="23" y="13" width="7"  height="5"  rx="1"   fill="${c.stroke}" opacity="0.4"/>
					<circle cx="9"  cy="24" r="3" fill="${c.stroke}"/>
					<circle cx="24" cy="24" r="3" fill="${c.stroke}"/>
					<polygon points="33,15.5 28,12 28,19" fill="${c.stroke}" opacity="0.95"/>
				</svg>
			</div>`,
			className: '',
			iconSize: [36, 36],
			iconAnchor: [18, 18],
			popupAnchor: [0, -22]
		});
	}

	// ── Popup ─────────────────────────────────────────────────────────────────────
	function makePopup(p: MapPoint) {
		const pill = {
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
			<div style="margin-bottom:6px">${pill}</div>
			<table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table>
		</div>`;
	}

	// ── Animation loop ────────────────────────────────────────────────────────────
	const STEP = 0.00045; // degree/frame — consistent visual speed

	function animTick() {
		for (const p of points) {
			if (p.type !== 'truck') continue;
			const marker = markerMap.get(p.id);
			const anim = truckAnim.get(p.id);
			if (!marker || !anim || !anim.ready || anim.route.length < 2) continue;

			const route = anim.route;
			const from = route[anim.segIdx];
			const to = route[anim.segIdx + 1];
			if (!from || !to) continue;

			const sl = segLen(from, to);
			const step = sl > 0 ? STEP / sl : STEP;
			anim.segProg += step;

			if (anim.segProg >= 1) {
				anim.segIdx++;
				anim.segProg = 0;
				if (anim.segIdx >= route.length - 1) anim.segIdx = 0; // loop
			}

			const f = route[anim.segIdx];
			const t = route[anim.segIdx + 1] ?? route[0];

			const lat = f[0] + (t[0] - f[0]) * anim.segProg;
			const lng = f[1] + (t[1] - f[1]) * anim.segProg;

			const destBearing = calcBearing(f[0], f[1], t[0], t[1]);
			anim.bearing = lerpAngle(anim.bearing, destBearing, 0.15);

			marker.setLatLng([lat, lng]);
			marker.setIcon(makeTruckIcon(p.status, anim.bearing));
		}
		animFrame = requestAnimationFrame(animTick);
	}

	// ── Mount ─────────────────────────────────────────────────────────────────────
	onMount(async () => {
		if (!browser) return;

		const leaflet = await import('leaflet');
		L = leaflet.default;

		map = L.map(container, { zoomControl: true, attributionControl: false }).setView(
			[-6.8, 110.0],
			6
		);

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

		// Build all markers first (trucks start at origin while route loads)
		for (const p of points) {
			if (p.type === 'warehouse') {
				const m = L.marker([p.lat, p.lng], { icon: makeWarehouseIcon(p.status) })
					.addTo(map)
					.bindPopup(makePopup(p), { className: 'scm-popup', maxWidth: 220 });
				markerMap.set(p.id, m);
			} else {
				// Placeholder anim state — not ready yet
				truckAnim.set(p.id, { segIdx: 0, segProg: 0, bearing: 90, route: [], ready: false });

				const m = L.marker([p.lat, p.lng], { icon: makeTruckIcon(p.status, 90) })
					.addTo(map)
					.bindPopup(makePopup(p), { className: 'scm-popup', maxWidth: 220 });
				markerMap.set(p.id, m);
			}
		}

		// Start anim loop immediately (trucks with ready=false are skipped)
		animFrame = requestAnimationFrame(animTick);

		// Fetch OSRM routes async — trucks start moving as each route loads
		for (const p of points) {
			if (p.type !== 'truck' || p.targetLat == null || p.targetLng == null) continue;

			fetchOSRMRoute(p.lat, p.lng, p.targetLat, p.targetLng).then((route) => {
				// Draw route polyline
				L.polyline(route, {
					color: '#3f3f46',
					weight: 2,
					dashArray: '4 6',
					opacity: 0.6
				}).addTo(map);

				const initBearing =
					route.length >= 2 ? calcBearing(route[0][0], route[0][1], route[1][0], route[1][1]) : 90;

				const anim = truckAnim.get(p.id);
				if (anim) {
					anim.route = route;
					anim.bearing = initBearing;
					anim.ready = true;
				}
			});
		}
	});

	// ── Warehouse reactive update ─────────────────────────────────────────────────
	$effect(() => {
		if (!browser || !map || !L) return;
		for (const p of points) {
			if (p.type !== 'warehouse') continue;
			markerMap.get(p.id)?.setIcon(makeWarehouseIcon(p.status));
			markerMap.get(p.id)?.setPopupContent(makePopup(p));
		}
	});

	onDestroy(() => {
		if (!browser) return;
		if (animFrame !== null) cancelAnimationFrame(animFrame);
		map?.remove();
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
