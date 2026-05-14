-- ============================================
-- Foundit — Row Level Security Policies
-- ============================================
-- Enables RLS on all public-facing tables and
-- adds granular policies for authenticated users.
-- Backend uses service_role key (bypasses RLS).
-- These policies protect the anon/authenticated roles.
--
-- NOTE: user IDs are TEXT (Clerk's 'user_xxx' format).
-- auth.uid() returns UUID, so we cast to ::text for comparisons.
-- Wrapping in (SELECT auth.uid()) avoids per-row re-evaluation.

-- ============================================
-- USERS TABLE
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Anyone can read basic user info (for display in messages, item listings)
CREATE POLICY "users_select_public" ON users
  FOR SELECT
  USING (true);

-- Users can update their own profile only
CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  USING ((SELECT auth.uid())::text = id)
  WITH CHECK ((SELECT auth.uid())::text = id);

-- Deny direct inserts/deletes via anon/authenticated (backend handles via service_role)
CREATE POLICY "users_deny_insert" ON users
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "users_deny_delete" ON users
  FOR DELETE
  USING (false);

-- ============================================
-- ITEMS TABLE
-- ============================================

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Anyone can read items (browse lost & found listings)
CREATE POLICY "items_select_public" ON items
  FOR SELECT
  USING (true);

-- Authenticated users can create their own items
CREATE POLICY "items_insert_own" ON items
  FOR INSERT
  WITH CHECK ((SELECT auth.uid())::text = user_id);

-- Users can update their own items only
CREATE POLICY "items_update_own" ON items
  FOR UPDATE
  USING ((SELECT auth.uid())::text = user_id)
  WITH CHECK ((SELECT auth.uid())::text = user_id);

-- Users can delete their own items only
CREATE POLICY "items_delete_own" ON items
  FOR DELETE
  USING ((SELECT auth.uid())::text = user_id);

-- ============================================
-- MATCHES TABLE
-- ============================================

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Revoke public anon access — matches contain sensitive match data
REVOKE ALL ON matches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON matches TO authenticated;
GRANT ALL ON matches TO service_role;

-- Users can see matches involving their items
CREATE POLICY "matches_select_involved" ON matches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM items
      WHERE (items.id = matches.lost_item_id OR items.id = matches.found_item_id)
        AND items.user_id = (SELECT auth.uid())::text
    )
  );

-- Deny direct inserts/updates/deletes (backend handles via service_role)
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

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Revoke public anon access — messages are private communication
REVOKE ALL ON messages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON messages TO authenticated;
GRANT ALL ON messages TO service_role;

-- Users can read messages they sent or received
CREATE POLICY "messages_select_involved" ON messages
  FOR SELECT
  USING ((SELECT auth.uid())::text = sender_id OR (SELECT auth.uid())::text = receiver_id);

-- Authenticated users can send messages (as themselves)
CREATE POLICY "messages_insert_as_sender" ON messages
  FOR INSERT
  WITH CHECK ((SELECT auth.uid())::text = sender_id);

-- Deny direct updates/deletes (backend handles via service_role)
CREATE POLICY "messages_deny_update" ON messages
  FOR UPDATE
  USING (false);

CREATE POLICY "messages_deny_delete" ON messages
  FOR DELETE
  USING (false);

-- ============================================
-- CLAIMS TABLE
-- ============================================

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

-- Revoke public anon access — claims contain OTP & verification data
REVOKE ALL ON claims FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON claims TO authenticated;
GRANT ALL ON claims TO service_role;

-- Users can see their own claims (as claimant) and claims on their items (as owner)
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

-- Deny direct inserts/updates/deletes (backend handles via service_role)
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