CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

SELECT  create_hypertable('sensor_events','time',chunk_time_interval => INTERVAL '1 day',if_not_exists => TRUE);

SELECT  create_hypertable('alert_events','time',chunk_time_interval => INTERVAL '7 days',if_not_exists => TRUE);

ALTER TABLE sensor_events

SET ( timescaledb.compress, timescaledb.compress_orderby => 'time DESC', timescaledb.compress_segmentby => 'node_id' );

SELECT  add_compression_policy('sensor_events',INTERVAL '7 days');

SELECT  add_retention_policy('sensor_events',INTERVAL '90 days');

CREATE MATERIALIZED VIEW sensor_hourly
WITH
(timescaledb.continuous
) AS
SELECT  time_bucket('1 hour',time) AS bucket
       ,node_id
       ,AVG(temperature)           AS avg_temp
       ,AVG(stock)                 AS avg_stock
       ,AVG(speed)                 AS avg_speed
       ,AVG(delay)                 AS avg_delay
       ,COUNT(*)                   AS reading_count
FROM sensor_events
GROUP BY  bucket
         ,node_id
WITH NO DATA;

SELECT  add_continuous_aggregate_policy('sensor_hourly',start_offset => INTERVAL '3 hours',end_offset => INTERVAL '1 hour',schedule_interval => INTERVAL '1 hour' );
INSERT INTO nodes (id, name, type, lat, lng) VALUES ('WH-JKT', 'Jakarta Warehouse', 'warehouse', -6.2, 106.8), ('WH-SBY', 'Surabaya Warehouse', 'warehouse', -7.2, 112.7), ('TRK-001', 'Truk #001 (JKT→SBY)', 'truck', -7.0, 110.2), ('TRK-002', 'Truk #002 (SBY→MKS)', 'truck', -5.1, 119.4)
ON CONFLICT (id) DO NOTHING;