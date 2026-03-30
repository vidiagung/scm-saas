import { prisma } from './db';

async function hashPassword(password: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
    // Seed nodes
    await prisma.node.upsert({ where: { id: 'WH-JKT' },  update: {}, create: { id: 'WH-JKT',  name: 'Jakarta Warehouse',    type: 'warehouse', lat: -6.2, lng: 106.8 } });
    await prisma.node.upsert({ where: { id: 'WH-SBY' },  update: {}, create: { id: 'WH-SBY',  name: 'Surabaya Warehouse',   type: 'warehouse', lat: -7.2, lng: 112.7 } });
    await prisma.node.upsert({ where: { id: 'TRK-001' }, update: {}, create: { id: 'TRK-001', name: 'Truk #001 (JKT-SBY)', type: 'truck',     lat: -7.0, lng: 110.2 } });
    await prisma.node.upsert({ where: { id: 'TRK-002' }, update: {}, create: { id: 'TRK-002', name: 'Truk #002 (SBY-MKS)', type: 'truck',     lat: -5.1, lng: 119.4 } });
    console.log('[seed] nodes created');

    // Seed users
    const adminHash  = await hashPassword('password123');
    const viewerHash = await hashPassword('password123');
    await prisma.user.upsert({ where: { email: 'admin@scm.dev' },  update: {}, create: { email: 'admin@scm.dev',  passwordHash: adminHash,  role: 'admin'  } });
    await prisma.user.upsert({ where: { email: 'viewer@scm.dev' }, update: {}, create: { email: 'viewer@scm.dev', passwordHash: viewerHash, role: 'viewer' } });
    console.log('[seed] users created: admin@scm.dev, viewer@scm.dev');
    console.log('[seed] password: password123');
}

main().catch(console.error).finally(() => prisma.$disconnect());
