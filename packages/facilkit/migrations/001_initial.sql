-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
-- [native]
-- x402Interop production persistence baseline.
-- Apply with a transactional migration runner.

CREATE TABLE IF NOT EXISTS facilitator_quotes (
  quote_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  deposit_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS facilitator_nonces (
  nonce TEXT PRIMARY KEY,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facilitator_deposits (
  quote_id TEXT PRIMARY KEY REFERENCES facilitator_quotes(quote_id) ON DELETE CASCADE,
  deposit_address TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_resources (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  payload JSONB NOT NULL,
  health TEXT NOT NULL CHECK (health IN ('healthy', 'unhealthy', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_resources_owner_idx ON marketplace_resources(owner);
CREATE INDEX IF NOT EXISTS marketplace_resources_updated_idx ON marketplace_resources(updated_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_fee_options (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('registration', 'featured')),
  duration_days INTEGER,
  network TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount TEXT NOT NULL,
  treasury TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, duration_days, network, asset)
);

CREATE TABLE IF NOT EXISTS marketplace_payments (
  payment_id UUID PRIMARY KEY,
  resource_id TEXT,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('registration', 'featured', 'renewal')),
  duration_days INTEGER,
  network TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount TEXT NOT NULL,
  treasury TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'settled', 'rejected', 'refunded')),
  idempotency_key TEXT NOT NULL UNIQUE,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_audit_events (
  event_id UUID PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_id TEXT,
  payment_id UUID REFERENCES marketplace_payments(payment_id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_rate_limits (
  subject TEXT NOT NULL,
  bucket TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, bucket, window_started_at)
);
