<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';

	interface Waypoint {
		lat: number;
		lng: number;
		type: 'land' | 'sea';
	}

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
		waypoints?: Waypoint[];
	}

	let { points = [] }: { points: MapPoint[] } = $props();

	let container: HTMLDivElement;
	let map: any = null;
	let L: any = null;
	let animFrame: number | null = null;

	type VehicleMode = 'land' | 'sea';

	interface TruckAnim {
		segIdx: number;
		segProg: number;
		bearing: number;
		flatRoute: [number, number][];
		flatModes: VehicleMode[];
		ready: boolean;
		currentMode: VehicleMode;
	}

	const truckAnim = new Map<string, TruckAnim>();
	const markerMap = new Map<string, any>();

	// ── OSRM fetch ────────────────────────────────────────────────────────────────
	async function fetchOSRMRoute(
		fromLat: number,
		fromLng: number,
		toLat: number,
		toLng: number
	): Promise<[number, number][]> {
		try {
			const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
			const res = await fetch(url);
			const json = await res.json();
			if (json.code !== 'Ok' || !json.routes?.[0]) throw new Error('no route');
			return json.routes[0].geometry.coordinates.map(
				([lng, lat]: [number, number]) => [lat, lng] as [number, number]
			);
		} catch {
			const steps = 30;
			const pts: [number, number][] = [];
			for (let i = 0; i <= steps; i++) {
				const t = i / steps;
				pts.push([fromLat + (toLat - fromLat) * t, fromLng + (toLng - fromLng) * t]);
			}
			return pts;
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

	// ── Colors ────────────────────────────────────────────────────────────────────
	const clr = {
		ok: { bg: '#052e16', stroke: '#16a34a', glow: '#22c55e88', icon: '#4ade80' },
		warn: { bg: '#451a03', stroke: '#d97706', glow: '#f59e0b88', icon: '#fbbf24' },
		err: { bg: '#450a0a', stroke: '#dc2626', glow: '#ef444488', icon: '#f87171' }
	};

	// ── Icon builders ─────────────────────────────────────────────────────────────
	function makeWarehouseIcon(status: MapPoint['status']) {
		const c = clr[status];
		return L.divIcon({
			html: `<div style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${c.bg};border:2px solid ${c.stroke};box-shadow:0 0 8px ${c.glow}">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" fill="${c.icon}">
					<path d="M341.8 72.6C329.5 61.2 310.5 61.2 298.3 72.6L74.3 280.6C64.7 289.6 61.5 303.5 66.3 315.7C71.1 327.9 82.8 336 96 336L112 336L112 512C112 547.3 140.7 576 176 576L464 576C499.3 576 528 547.3 528 512L528 336L544 336C557.2 336 569 327.9 573.8 315.7C578.6 303.5 575.4 289.5 565.8 280.6L341.8 72.6zM304 384L336 384C362.5 384 384 405.5 384 432L384 528L256 528L256 432C256 405.5 277.5 384 304 384z"/>
				</svg>
			</div>`,
			className: '',
			iconSize: [38, 38],
			iconAnchor: [19, 19],
			popupAnchor: [0, -24]
		});
	}

	function makeTruckIcon(status: MapPoint['status'], bearing: number) {
		const c = clr[status];
		return L.divIcon({
			html: `<div style="width:38px;height:38px;transform:rotate(${bearing}deg);transform-origin:50% 50%">
				<div style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${c.bg};border:2px solid ${c.stroke};box-shadow:0 0 8px ${c.glow}">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" fill="${c.icon}" style="transform:rotate(-90deg)">
						<path d="M32 160C32 124.7 60.7 96 96 96L384 96C419.3 96 448 124.7 448 160L448 192L498.7 192C515.7 192 532 198.7 544 210.7L589.3 256C601.3 268 608 284.3 608 301.3L608 448C608 483.3 579.3 512 544 512L540.7 512C530.3 548.9 496.3 576 456 576C415.7 576 381.8 548.9 371.3 512L268.7 512C258.3 548.9 224.3 576 184 576C143.7 576 109.8 548.9 99.3 512L96 512C60.7 512 32 483.3 32 448L32 160zM544 352L544 301.3L498.7 256L448 256L448 352L544 352zM224 488C224 465.9 206.1 448 184 448C161.9 448 144 465.9 144 488C144 510.1 161.9 528 184 528C206.1 528 224 510.1 224 488zM456 528C478.1 528 496 510.1 496 488C496 465.9 478.1 448 456 448C433.9 448 416 465.9 416 488C416 510.1 433.9 528 456 528z"/>
					</svg>
				</div>
			</div>`,
			className: '',
			iconSize: [38, 38],
			iconAnchor: [19, 19],
			popupAnchor: [0, -24]
		});
	}

	function makeShipIcon(status: MapPoint['status'], bearing: number) {
		const c = clr[status];
		return L.divIcon({
			html: `<div style="width:38px;height:38px;transform:rotate(${bearing}deg);transform-origin:50% 50%">
				<div style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:${c.bg};border:2px solid ${c.stroke};box-shadow:0 0 10px ${c.glow}">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" fill="${c.icon}" style="transform:rotate(-90deg)">
						<path d="M272 64C245.5 64 224 85.5 224 112L224 128L208 128C163.8 128 128 163.8 128 208L128 316.8L106.4 325.4C91.6 331.3 83.9 347.8 89 362.9C99.4 394.2 115.8 422.2 136.7 446C156.8 436.8 178.4 432.1 200 432C233.1 431.8 266.3 442.2 294.4 463.4L296 464.6L296 249.6L192 291.2L192 208C192 199.2 199.2 192 208 192L432 192C440.8 192 448 199.2 448 208L448 291.2L344 249.6L344 464.6L345.6 463.4C373.1 442.7 405.5 432.2 438 432C460.3 431.9 482.6 436.5 503.3 446C524.2 422.3 540.6 394.2 551 362.9C556 347.7 548.4 331.3 533.6 325.4L512 316.8L512 208C512 163.8 476.2 128 432 128L416 128L416 112C416 85.5 394.5 64 368 64L272 64zM403.4 540.1C424.7 524 453.3 524 474.6 540.1C493.6 554.5 516.5 568.3 541.8 573.4C568.3 578.8 596.1 574.2 622.5 554.3C633.1 546.3 635.2 531.3 627.2 520.7C619.2 510.1 604.2 508 593.6 516C578.7 527.2 565 529.1 551.3 526.3C536.4 523.3 520.4 514.4 503.5 501.7C465.1 472.7 413 472.7 374.5 501.7C350.5 519.8 333.8 528 320 528C306.2 528 289.5 519.8 265.5 501.7C227.1 472.7 175 472.7 136.5 501.7C114.9 518 95.2 527.5 77.6 527.4C68 527.3 57.7 524.4 46.4 515.9C35.8 507.9 20.8 510 12.8 520.6C4.8 531.2 7 546.3 17.6 554.3C36.7 568.7 57 575.3 77.4 575.4C111.3 575.6 141.7 558 165.5 540.1C186.8 524 215.4 524 236.7 540.1C260.9 558.4 289 576 320.1 576C351.2 576 379.2 558.3 403.5 540.1z"/>
					</svg>
				</div>
			</div>`,
			className: '',
			iconSize: [38, 38],
			iconAnchor: [19, 19],
			popupAnchor: [0, -24]
		});
	}

	// ── Popup ─────────────────────────────────────────────────────────────────────
	function makePopup(p: MapPoint, mode: VehicleMode = 'land') {
		const pill = {
			ok: `<span style="color:#4ade80;font-size:10px">● OK</span>`,
			warn: `<span style="color:#fbbf24;font-size:10px">● WARN</span>`,
			err: `<span style="color:#f87171;font-size:10px">● ERR</span>`
		}[p.status];
		const modeRow =
			p.type === 'truck'
				? `<tr><td style="color:#71717a;padding-right:12px">Mode</td><td style="color:#60a5fa;font-weight:600">${mode === 'sea' ? '⛵ Kapal' : '🚚 Darat'}</td></tr>`
				: '';
		const rows =
			p.type === 'warehouse'
				? `<tr><td style="color:#71717a;padding-right:12px">Stock</td><td>${Math.round(p.stock ?? 0)} unit</td></tr>
			   <tr><td style="color:#71717a">Suhu</td><td>${p.temperature.toFixed(1)}°C</td></tr>`
				: `${modeRow}
			   <tr><td style="color:#71717a;padding-right:12px">Speed</td><td>${Math.round(p.speed ?? 0)} km/h</td></tr>
			   <tr><td style="color:#71717a">Delay</td><td>${p.delay ? '+' + p.delay + ' min' : 'On Time'}</td></tr>
			   <tr><td style="color:#71717a">Suhu</td><td>${p.temperature.toFixed(1)}°C</td></tr>`;
		return `<div style="font-family:ui-monospace,monospace;font-size:12px;background:#18181b;color:#e4e4e7;border:1px solid #3f3f46;border-radius:8px;padding:10px 12px;min-width:160px;line-height:1.7">
			<div style="font-weight:600;font-size:13px;color:#f4f4f5;margin-bottom:4px">${p.name}</div>
			<div style="margin-bottom:6px">${pill}</div>
			<table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table>
		</div>`;
	}

	// ── Build flat route dari waypoints ───────────────────────────────────────────
	//
	// Aturan sederhana dan konsisten:
	//   - from.type === 'land' && to.type === 'land'  → OSRM (rute jalan darat)
	//   - Semua segmen lainnya (ada 'sea')             → interpolasi lurus (jalur laut)
	//
	// Dengan waypoints baru yang memakai koordinat pelabuhan berbeda,
	// tidak ada lagi masalah titik duplikat atau OSRM mencoba nyeberang laut.
	//
	async function buildRoute(
		p: MapPoint
	): Promise<{ flatRoute: [number, number][]; flatModes: VehicleMode[] }> {
		const flatRoute: [number, number][] = [];
		const flatModes: VehicleMode[] = [];
		const wps = p.waypoints;

		if (!wps || wps.length < 2) {
			if (p.targetLat != null && p.targetLng != null) {
				const coords = await fetchOSRMRoute(p.lat, p.lng, p.targetLat, p.targetLng);
				coords.forEach((c) => {
					flatRoute.push(c);
					flatModes.push('land');
				});
			}
			return { flatRoute, flatModes };
		}

		for (let i = 0; i < wps.length - 1; i++) {
			const from = wps[i];
			const to = wps[i + 1];

			// Skip segmen dengan koordinat identik
			if (from.lat === to.lat && from.lng === to.lng) continue;

			// Mode ditentukan oleh titik TUJUAN (to.type):
			// - to.type === 'land' → kita menuju daratan → pakai OSRM (termasuk setelah turun kapal)
			// - to.type === 'sea'  → kita menuju laut    → interpolasi lurus
			const mode: VehicleMode = to.type === 'land' ? 'land' : 'sea';

			let coords: [number, number][];

			if (mode === 'land') {
				coords = await fetchOSRMRoute(from.lat, from.lng, to.lat, to.lng);
			} else {
				coords = [];
				for (let s = 0; s <= 40; s++) {
					const t = s / 40;
					coords.push([from.lat + (to.lat - from.lat) * t, from.lng + (to.lng - from.lng) * t]);
				}
			}

			const startIdx = flatRoute.length === 0 ? 0 : 1;
			for (let j = startIdx; j < coords.length; j++) {
				flatRoute.push(coords[j]);
				flatModes.push(mode);
			}
		}

		return { flatRoute, flatModes };
	}

	// ── Animation loop ────────────────────────────────────────────────────────────
	const STEP = 0.00045;

	function animTick() {
		for (const p of points) {
			if (p.type !== 'truck') continue;
			const marker = markerMap.get(p.id);
			const anim = truckAnim.get(p.id);
			if (!marker || !anim || !anim.ready || anim.flatRoute.length < 2) continue;

			const route = anim.flatRoute;
			const from = route[anim.segIdx];
			const to = route[anim.segIdx + 1];
			if (!from || !to) continue;

			const sl = segLen(from, to);
			const step = sl > 0 ? STEP / sl : STEP;
			anim.segProg += step;

			if (anim.segProg >= 1) {
				anim.segIdx++;
				anim.segProg = 0;
				if (anim.segIdx >= route.length - 1) anim.segIdx = 0;
			}

			const f = route[anim.segIdx];
			const t = route[anim.segIdx + 1] ?? route[0];

			const lat = f[0] + (t[0] - f[0]) * anim.segProg;
			const lng = f[1] + (t[1] - f[1]) * anim.segProg;

			const destBearing = calcBearing(f[0], f[1], t[0], t[1]);
			anim.bearing = lerpAngle(anim.bearing, destBearing, 0.15);

			marker.setLatLng([lat, lng]);

			// Ambil mode berdasarkan segmen saat ini
			const newMode: VehicleMode = anim.flatModes[anim.segIdx] ?? 'land';

			// Update popup dan ikon saat mode berubah
			if (newMode !== anim.currentMode) {
				anim.currentMode = newMode;
				marker.setPopupContent(makePopup(p, newMode));
			}

			// Render ikon yang sesuai: kapal di laut, truk di darat
			if (anim.currentMode === 'sea') {
				marker.setIcon(makeShipIcon(p.status, anim.bearing));
			} else {
				marker.setIcon(makeTruckIcon(p.status, anim.bearing));
			}
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

		for (const p of points) {
			if (p.type === 'warehouse') {
				const m = L.marker([p.lat, p.lng], { icon: makeWarehouseIcon(p.status) })
					.addTo(map)
					.bindPopup(makePopup(p), { className: 'scm-popup', maxWidth: 220 });
				markerMap.set(p.id, m);
			} else {
				truckAnim.set(p.id, {
					segIdx: 0,
					segProg: 0,
					bearing: 90,
					flatRoute: [],
					flatModes: [],
					ready: false,
					currentMode: 'land'
				});
				const m = L.marker([p.lat, p.lng], { icon: makeTruckIcon(p.status, 90) })
					.addTo(map)
					.bindPopup(makePopup(p, 'land'), { className: 'scm-popup', maxWidth: 220 });
				markerMap.set(p.id, m);
			}
		}

		animFrame = requestAnimationFrame(animTick);

		for (const p of points) {
			if (p.type !== 'truck') continue;

			buildRoute(p).then(({ flatRoute, flatModes }) => {
				if (flatRoute.length < 2) return;

				// Gambar polyline per segmen dengan warna berbeda (laut vs darat)
				let i = 0;
				while (i < flatRoute.length - 1) {
					const mode = flatModes[i];
					let j = i + 1;
					while (j < flatRoute.length - 1 && flatModes[j] === mode) j++;

					L.polyline(flatRoute.slice(i, j + 1), {
						color: mode === 'sea' ? '#3b82f6' : '#71717a',
						weight: 2,
						dashArray: mode === 'sea' ? '6 5' : '4 6',
						opacity: 0.75
					}).addTo(map);

					i = j;
				}

				const initBearing =
					flatRoute.length >= 2
						? calcBearing(flatRoute[0][0], flatRoute[0][1], flatRoute[1][0], flatRoute[1][1])
						: 90;

				const anim = truckAnim.get(p.id);
				if (anim) {
					anim.flatRoute = flatRoute;
					anim.flatModes = flatModes;
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
			{#each [{ label: 'OK', color: 'bg-emerald-500' }, { label: 'Warn', color: 'bg-amber-400' }, { label: 'Err', color: 'bg-red-500' }, { label: 'Sea', color: 'bg-blue-500' }, { label: 'Land', color: 'bg-zinc-500' }] as item}
				<span class="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
					<span class="h-1.5 w-1.5 rounded-full {item.color}"></span>
					{item.label}
				</span>
			{/each}
			<Badge
				variant="outline"
				class="border-zinc-700 px-1.5 py-0 font-mono text-[10px] text-zinc-500"
			>
				{points.length} Nodes
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
