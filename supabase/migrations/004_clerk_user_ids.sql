-- Migration: Change users.id from UUID to TEXT to support Clerk user IDs (user_xxx format)
-- Also update foreign keys in items, messages, matches, and claims tables

-- Drop existing foreign key constraints
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_user_id_fkey;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_receiver_id_fkey;
ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_claimant_id_fkey;

-- Change users.id column to TEXT
ALTER TABLE users ALTER COLUMN id SET DATA TYPE TEXT;

-- Change matching foreign key columns to TEXT
ALTER TABLE items ALTER COLUMN user_id SET DATA TYPE TEXT;
ALTER TABLE messages ALTER COLUMN sender_id SET DATA TYPE TEXT;
ALTER TABLE messages ALTER COLUMN receiver_id SET DATA TYPE TEXT;
ALTER TABLE claims ALTER COLUMN claimant_id SET DATA TYPE TEXT;

-- Remove default gen_random_uuid() from users.id since Clerk provides the ID
ALTER TABLE users ALTER COLUMN id DROP DEFAULT;

-- Re-add foreign keys
ALTER TABLE items ADD CONSTRAINT items_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE messages ADD CONSTRAINT messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE claims ADD CONSTRAINT claims_claimant_id_fkey FOREIGN KEY (claimant_id) REFERENCES users(id) ON DELETE SET NULL;
