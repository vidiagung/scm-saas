import { WebSocketServer, WebSocket } from "ws";

const wss = new WebSocketServer( { port: 3001 } );

wss.on( "connection", ( ws: WebSocket ) => {
	console.log( "✅ Client connected" );

	ws.send(
		JSON.stringify( {
			type: "welcome",
			message: "Connected to SCM WS 🚀",
		} )
	);
} );

export function broadcast( data: any ) {
	const message = JSON.stringify( data );

	wss.clients.forEach( ( client: WebSocket ) => {
		if ( client.readyState === WebSocket.OPEN ) {
			client.send( message );
		}
	} );
}

console.log( "🚀 WS running on ws://localhost:3001" );