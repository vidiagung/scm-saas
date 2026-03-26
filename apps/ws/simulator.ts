import { broadcast } from "./server";

function generateData() {
	return {
		type: "sensor_update",
		payload: {
			id: crypto.randomUUID(),
			temperature: 25 + Math.random() * 5,
			lat: -6 + Math.random(),
			lng: 106 + Math.random(),
			stock: Math.floor( Math.random() * 100 ),
			timestamp: new Date().toISOString(),
		},
	};
}

setInterval( () => {
	const data = generateData();

	console.log( "📡 Sending:", data );

	broadcast( data );
}, 2000 );