import { WebSocketServer, WebSocket } from "ws";
import { prisma } from "./db";

const wss = new WebSocketServer( { port: 3001 } );

wss.on( "connection", async ( ws: WebSocket ) => {
	console.log( "[ws] client connected" );

	// Kirim welcome + snapshot terbaru dari DB saat client connect
	ws.send( JSON.stringify( {
		type: "welcome",
		message: "Connected to SCM WebSocket",
	} ) );

	// Kirim data terakhir tiap node dari DB supaya dashboard tidak kosong
	try {
		const latest = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT ON (node_id)
        node_id AS id, temperature, stock, speed, delay, status, time
      FROM sensor_events
      ORDER BY node_id, time DESC
    `;

		if ( latest.length > 0 ) {
			ws.send( JSON.stringify( {
				type: "snapshot",
				payload: latest,
			} ) );
		}
	} catch {
		// DB belum ada data saat pertama kali — tidak masalah
	}
} );

export function broadcast( data: any ) {
	const message = JSON.stringify( data );
	wss.clients.forEach( ( client: WebSocket ) => {
		if ( client.readyState === WebSocket.OPEN ) {
			client.send( message );
		}
	} );
}

console.log( "[ws] server running on ws://localhost:3001" );