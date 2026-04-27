CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    iso_a2 VARCHAR(2) NOT NULL UNIQUE,
    iso_a3 VARCHAR(3) NOT NULL UNIQUE,
    capital VARCHAR(100),
    metadata TEXT DEFAULT 'this is metadata',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_countries_iso_a3 ON countries (iso_a3);
CREATE INDEX idx_countries_iso_a2 ON countries (iso_a2);
