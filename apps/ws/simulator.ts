import { broadcast } from "./server";
import { prisma } from "./db";

// ── Node definitions (fixed positions, match DB seed) ────────────────────────
const NODES = [
	{ id: "WH-JKT", name: "Jakarta Warehouse", type: "warehouse" as const, lat: -6.2, lng: 106.8 },
	{ id: "WH-SBY", name: "Surabaya Warehouse", type: "warehouse" as const, lat: -7.2, lng: 112.7 },
	{ id: "TRK-001", name: "Truk #001 (JKT-SBY)", type: "truck" as const, lat: -7.0, lng: 110.2 },
	{ id: "TRK-002", name: "Truk #002 (SBY-MKS)", type: "truck" as const, lat: -5.1, lng: 119.4 },
];

// ── In-memory state ───────────────────────────────────────────────────────────
type NodeStatus = "ok" | "warn" | "err";

interface NodeState {
	id: string;
	name: string;
	type: "warehouse" | "truck";
	lat: number;
	lng: number;
	temperature: number;
	stock: number;
	speed: number;
	delay: number;
	status: NodeStatus;
}

let state: NodeState[] = NODES.map( ( n ) => ( {
	...n,
	temperature: 22 + Math.random() * 4,
	stock: n.type === "warehouse" ? 200 + Math.floor( Math.random() * 200 ) : 0,
	speed: n.type === "truck" ? 60 + Math.floor( Math.random() * 30 ) : 0,
	delay: 0,
	status: "ok",
} ) );

// ── Helpers ───────────────────────────────────────────────────────────────────
function rand( min: number, max: number ) { return min + Math.random() * ( max - min ); }
function clamp( v: number, min: number, max: number ) { return Math.max( min, Math.min( max, v ) ); }

// ── Persist batch to TimescaleDB (fire-and-forget) ───────────────────────────
async function persistSnapshot( snapshot: NodeState[] ) {
	try {
		await prisma.sensorEvent.createMany( {
			data: snapshot.map( ( n ) => ( {
				nodeId: n.id,
				temperature: n.temperature,
				stock: n.type === "warehouse" ? n.stock : null,
				speed: n.type === "truck" ? n.speed : null,
				delay: n.delay,
				status: n.status,
			} ) ),
		} );
	} catch ( err ) {
		console.error( "[db] sensor_events write failed:", err );
	}
}

// ── Tick: update state + broadcast + persist ──────────────────────────────────
function tick() {
	state = state.map( ( n ) => {
		const s = { ...n };

		s.temperature = clamp( s.temperature + rand( -0.3, 0.3 ), 18, 35 );

		if ( s.type === "truck" ) {
			s.speed = clamp( s.speed + rand( -5, 5 ), 40, 100 );
			s.delay = Math.max( 0, s.delay - 1 );
		} else {
			s.stock = clamp( s.stock + rand( -15, 15 ), 50, 600 );
		}

		s.status =
			s.temperature > 30 ? "warn"
				: s.type === "warehouse" && s.stock < 80 ? "warn"
					: "ok";

		return s;
	} );

	// 1. Broadcast ke semua WebSocket client (same format seperti sebelumnya)
	broadcast( {
		type: "sensor_update",
		payload: state,
	} );

	// 2. Persist ke TimescaleDB — non-blocking
	persistSnapshot( state );

	console.log( `[simulator] tick — ${state.length} nodes broadcasted & queued to DB` );
}

// ── Start interval ────────────────────────────────────────────────────────────
setInterval( tick, 2000 );
console.log( "[simulator] started — broadcasting every 2s" );