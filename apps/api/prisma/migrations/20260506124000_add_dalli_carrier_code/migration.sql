-- Add DALLI carrier enum value for tms carrier connections.
ALTER TYPE "CarrierCode" ADD VALUE IF NOT EXISTS 'DALLI';
