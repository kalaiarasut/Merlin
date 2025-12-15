# PostgreSQL Initialization Script

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Create oceanographic data table
CREATE TABLE IF NOT EXISTS oceanographic_data (
    id SERIAL PRIMARY KEY,
    parameter VARCHAR(100) NOT NULL,
    value NUMERIC NOT NULL,
    unit VARCHAR(50),
    location GEOMETRY(POINT, 4326) NOT NULL,
    depth NUMERIC,
    timestamp TIMESTAMP NOT NULL,
    source VARCHAR(255),
    quality_flag VARCHAR(20),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create spatial index
CREATE INDEX idx_oceanographic_location ON oceanographic_data USING GIST(location);
CREATE INDEX idx_oceanographic_timestamp ON oceanographic_data(timestamp);
CREATE INDEX idx_oceanographic_parameter ON oceanographic_data(parameter);

-- Create survey stations table
CREATE TABLE IF NOT EXISTS survey_stations (
    id SERIAL PRIMARY KEY,
    survey_id INTEGER,
    station_number VARCHAR(50) NOT NULL,
    location GEOMETRY(POINT, 4326) NOT NULL,
    sampling_date TIMESTAMP,
    depth NUMERIC,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stations_location ON survey_stations USING GIST(location);

-- Create occurrence records table
CREATE TABLE IF NOT EXISTS occurrence_records (
    id SERIAL PRIMARY KEY,
    species_id VARCHAR(100),
    scientific_name VARCHAR(255) NOT NULL,
    location GEOMETRY(POINT, 4326) NOT NULL,
    occurrence_date TIMESTAMP,
    abundance INTEGER,
    basis_of_record VARCHAR(50),
    recorded_by VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_occurrences_location ON occurrence_records USING GIST(location);
CREATE INDEX idx_occurrences_species ON occurrence_records(species_id);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cmlre_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cmlre_admin;
