-- CreateEnum
CREATE TYPE "AlertLevel" AS ENUM ('info', 'warn', 'err');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('ok', 'warn', 'err');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('warehouse', 'truck');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'viewer');

-- CreateTable
CREATE TABLE "alert_events" (
    "id" BIGSERIAL NOT NULL,
    "time" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "node_id" TEXT NOT NULL,
    "level" "AlertLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id","time")
);

-- CreateTable
CREATE TABLE "nodes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "NodeType" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensor_events" (
    "id" BIGSERIAL NOT NULL,
    "time" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "node_id" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "stock" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "delay" INTEGER NOT NULL DEFAULT 0,
    "status" "NodeStatus" NOT NULL,

    CONSTRAINT "sensor_events_pkey" PRIMARY KEY ("id","time")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'viewer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_events_node_id_time_idx" ON "alert_events"("node_id", "time" DESC);

-- CreateIndex
CREATE INDEX "alert_events_level_resolved_idx" ON "alert_events"("level", "resolved");

-- CreateIndex
CREATE INDEX "sensor_events_node_id_time_idx" ON "sensor_events"("node_id", "time" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensor_events" ADD CONSTRAINT "sensor_events_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
