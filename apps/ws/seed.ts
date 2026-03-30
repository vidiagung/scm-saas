import { prisma } from './db';

async function hashPassword( password: string ): Promise<string> {
	const buf = await crypto.subtle.digest( 'SHA-256', new TextEncoder().encode( password ) );
	return Array.from( new Uint8Array( buf ) ).map( ( b ) => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
}

async function main() {
	const adminHash = await hashPassword( 'password123' );
	const viewerHash = await hashPassword( 'password123' );

	await prisma.user.upsert( {
		where: { email: 'admin@scm.dev' },
		update: {},
		create: { email: 'admin@scm.dev', passwordHash: adminHash, role: 'admin' },
	} );

	await prisma.user.upsert( {
		where: { email: 'viewer@scm.dev' },
		update: {},
		create: { email: 'viewer@scm.dev', passwordHash: viewerHash, role: 'viewer' },
	} );

	console.log( '[seed] users created: admin@scm.dev, viewer@scm.dev' );
	console.log( '[seed] password: password123' );
}

main()
	.catch( console.error )
	.finally( () => prisma.$disconnect() );