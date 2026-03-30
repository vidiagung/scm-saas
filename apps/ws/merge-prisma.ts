import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const baseFile = "prisma/migrate.prisma";
const modelsDir = "prisma/models";
const enumsDir = "prisma/enums";
const output = "prisma/schema.prisma";

let schema = readFileSync( baseFile, "utf-8" );

// enums dulu
for ( const file of readdirSync( enumsDir ) ) {
	schema += "\n" + readFileSync( join( enumsDir, file ), "utf-8" );
}

// models
for ( const file of readdirSync( modelsDir ) ) {
	schema += "\n" + readFileSync( join( modelsDir, file ), "utf-8" );
}

writeFileSync( output, schema );

console.log( "✅ Prisma schema merged!" );