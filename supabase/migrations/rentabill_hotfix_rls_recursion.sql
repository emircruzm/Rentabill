-- =============================================================================
-- Migration: rentabill_hotfix_rls_recursion.sql
-- Description: Fix infinite recursion (42P17) in store_members and stores RLS policies
-- =============================================================================

-- 1. Helper function with SECURITY DEFINER to bypass RLS when checking membership
CREATE OR REPLACE FUNCTION public.is_member_of_store(p_store_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.store_members 
        WHERE store_id = p_store_id AND user_id = p_user_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_member_of_store(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_member_of_store(UUID, UUID) FROM anon, public;

-- 2. Alter policy for store_members to eliminate self-referential RLS recursion
ALTER POLICY "members_select_colleagues" ON public.store_members
USING (
    user_id = auth.uid() OR
    public.is_member_of_store(store_id, auth.uid())
);

-- 3. Alter policy for stores using the helper to avoid recursion through store_members
ALTER POLICY "stores_select_member" ON public.stores
USING (
    owner_id = auth.uid() OR
    public.is_member_of_store(id, auth.uid())
);
