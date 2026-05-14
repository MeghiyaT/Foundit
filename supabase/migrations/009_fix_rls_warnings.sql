-- ============================================
-- Foundit — Fix RLS Advisory Warnings
-- ============================================
-- 1. auth_rls_initplan: wrap auth.uid() in (SELECT ...) for single evaluation
-- 2. pg_graphql_anon_table_exposed: revoke anon from matches/messages/claims
-- 3. function_search_path_mutable: fix match_items search_path

-- ============================================
-- Drop all existing RLS policies to recreate with fixes
-- ============================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('users', 'items', 'matches', 'messages', 'claims')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END;
$$;

-- ============================================
-- USERS TABLE
-- ============================================

CREATE POLICY "users_select_public" ON users
  FOR SELECT
  USING (true);

CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  USING ((SELECT auth.uid())::text = id)
  WITH CHECK ((SELECT auth.uid())::text = id);

CREATE POLICY "users_deny_insert" ON users
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "users_deny_delete" ON users
  FOR DELETE
  USING (false);

-- ============================================
-- ITEMS TABLE
-- ============================================

CREATE POLICY "items_select_public" ON items
  FOR SELECT
  USING (true);

CREATE POLICY "items_insert_own" ON items
  FOR INSERT
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY "items_update_own" ON items
  FOR UPDATE
  USING ((SELECT auth.uid())::text = user_id)
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY "items_delete_own" ON items
  FOR DELETE
  USING ((SELECT auth.uid())::text = user_id);

-- ============================================
-- MATCHES TABLE
-- ============================================

-- Revoke public anon access — matches contain sensitive match data
REVOKE ALL ON matches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON matches TO authenticated;
GRANT ALL ON matches TO service_role;

CREATE POLICY "matches_select_involved" ON matches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM items
      WHERE (items.id = matches.lost_item_id OR items.id = matches.found_item_id)
        AND items.user_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "matches_deny_insert" ON matches
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "matches_deny_update" ON matches
  FOR UPDATE
  USING (false);

CREATE POLICY "matches_deny_delete" ON matches
  FOR DELETE
  USING (false);

-- ============================================
-- MESSAGES TABLE
-- ============================================

-- Revoke public anon access — messages are private communication
REVOKE ALL ON messages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO authenticated;
GRANT ALL ON messages TO service_role;

CREATE POLICY "messages_select_involved" ON messages
  FOR SELECT
  USING ((SELECT auth.uid())::text = sender_id OR (SELECT auth.uid())::text = receiver_id);

CREATE POLICY "messages_insert_as_sender" ON messages
  FOR INSERT
  WITH CHECK ((SELECT auth.uid())::text = sender_id);

CREATE POLICY "messages_deny_update" ON messages
  FOR UPDATE
  USING (false);

CREATE POLICY "messages_deny_delete" ON messages
  FOR DELETE
  USING (false);

-- ============================================
-- CLAIMS TABLE
-- ============================================

-- Revoke public anon access — claims contain OTP & verification data
REVOKE ALL ON claims FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON claims TO authenticated;
GRANT ALL ON claims TO service_role;

CREATE POLICY "claims_select_involved" ON claims
  FOR SELECT
  USING (
    (SELECT auth.uid())::text = claimant_id
    OR EXISTS (
      SELECT 1 FROM items
      WHERE items.id = claims.item_id
        AND items.user_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "claims_deny_insert" ON claims
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "claims_deny_update" ON claims
  FOR UPDATE
  USING (false);

CREATE POLICY "claims_deny_delete" ON claims
  FOR DELETE
  USING (false);

-- ============================================
-- Fix match_items function search_path
-- ============================================

ALTER FUNCTION match_items(VECTOR(512), TEXT, FLOAT, INT)
  SET search_path = '';

-- ============================================
-- Update migration 008 to reflect final state
-- ============================================