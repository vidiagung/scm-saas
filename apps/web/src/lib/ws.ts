export const ws = new WebSocket( "ws://localhost:3001" );

ws.onopen = () => {
	console.log( "✅ WS connected" );
};