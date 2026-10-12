BEGIN;

-- 1. Tabla simulations
CREATE TABLE IF NOT EXISTS public.simulations (
    id UUID DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    projected_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    actual_result JSONB DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'APLICADA', 'DESCARTADA')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_simulations PRIMARY KEY (id),
    CONSTRAINT uq_simulations_store_id UNIQUE (store_id, id)
);

CREATE INDEX IF NOT EXISTS idx_simulations_store_id ON public.simulations(store_id);
CREATE INDEX IF NOT EXISTS idx_simulations_status ON public.simulations(store_id, status);

-- 2. Tabla store_invitations
CREATE TABLE IF NOT EXISTS public.store_invitations (
    id UUID DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'CAJERO', 'REPOSITOR')),
    token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
    status TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'ACEPTADA', 'EXPIRADA', 'CANCELADA')),
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_store_invitations PRIMARY KEY (id),
    CONSTRAINT uq_store_invitations_token UNIQUE (token),
    CONSTRAINT uq_store_invitations_store_id UNIQUE (store_id, id)
);

-- Índice único parcial: una sola invitación PENDIENTE por tienda y correo
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_invitations_pending 
ON public.store_invitations (store_id, lower(email)) 
WHERE (status = 'PENDIENTE');

CREATE INDEX IF NOT EXISTS idx_store_invitations_token ON public.store_invitations(token);
CREATE INDEX IF NOT EXISTS idx_store_invitations_email ON public.store_invitations(lower(email));

-- 3. Tabla store_settings
CREATE TABLE IF NOT EXISTS public.store_settings (
    store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    daily_goal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (daily_goal >= 0),
    warn_slow_days INTEGER NOT NULL DEFAULT 15 CHECK (warn_slow_days >= 0),
    warn_low_stock INTEGER NOT NULL DEFAULT 5 CHECK (warn_low_stock >= 0),
    auto_backup BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Función RPC accept_invitation(token)
CREATE OR REPLACE FUNCTION public.accept_invitation(
    p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_user_email TEXT;
    v_inv RECORD;
    v_store RECORD;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
    END IF;

    -- Obtener correo del usuario actual desde profiles o auth.users
    SELECT email INTO v_user_email
    FROM public.profiles
    WHERE id = v_uid;

    -- Buscar invitación pendiente y no expirada
    SELECT * INTO v_inv
    FROM public.store_invitations
    WHERE token = trim(p_token)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitación no válida o no encontrada' USING ERRCODE = 'P0002';
    END IF;

    IF v_inv.status <> 'PENDIENTE' THEN
        RAISE EXCEPTION 'La invitación ya no está pendiente (estado: %)', v_inv.status USING ERRCODE = 'P0001';
    END IF;

    IF v_inv.expires_at < now() THEN
        UPDATE public.store_invitations 
        SET status = 'EXPIRADA' 
        WHERE id = v_inv.id;
        
        RAISE EXCEPTION 'La invitación ha expirado' USING ERRCODE = 'P0001';
    END IF;

    -- Validar que la tienda exista
    SELECT * INTO v_store 
    FROM public.stores 
    WHERE id = v_inv.store_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La tienda asociada ya no existe' USING ERRCODE = 'P0002';
    END IF;

    -- Registrar o actualizar la membresía del usuario
    INSERT INTO public.store_members (
        store_id, user_id, role, joined_at
    ) VALUES (
        v_inv.store_id, v_uid, v_inv.role, now()
    )
    ON CONFLICT (user_id, store_id) 
    DO UPDATE SET role = EXCLUDED.role;

    -- Actualizar active_store_id en el perfil del usuario si no tenía una activa
    UPDATE public.profiles
    SET active_store_id = COALESCE(active_store_id, v_inv.store_id)
    WHERE id = v_uid;

    -- Marcar la invitación como ACEPTADA
    UPDATE public.store_invitations
    SET status = 'ACEPTADA',
        accepted_at = now()
    WHERE id = v_inv.id;

    RETURN jsonb_build_object(
        'success', true,
        'store_id', v_inv.store_id,
        'store_name', v_store.name,
        'role', v_inv.role
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.accept_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(TEXT) TO authenticated;

COMMIT;
-- ROLLBACK;
