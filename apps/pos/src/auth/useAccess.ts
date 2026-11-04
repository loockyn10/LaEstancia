import { useCallback, useEffect, useState } from "react";
import { configurationError } from "../config/env";
import { getSupabaseClient } from "../lib/supabase";
import { getCachedAccessContext, saveAccessContext } from "../local-db/repository";
import type { LocalAccessContext } from "../local-db/types";

export type PosAccess =
  | { status: "configuration-error"; message: string }
  | { status: "loading" }
  | { status: "signed-out"; expiredOffline: boolean }
  /** Sin red y sin contexto local previo: hace falta una primera sincronización. */
  | { status: "first-sync-required" }
  | { status: "no-access" }
  | { status: "ready"; access: LocalAccessContext };

type SessionLike = { user: { id: string }; expires_at?: number } | null;

/**
 * Sesión de Supabase → membresía → negocio, con contexto local para arrancar sin red.
 * Online la membresía se revalida siempre (una membresía revocada pierde el acceso); si la consulta
 * falla por la red se sigue con el último contexto conocido en lugar de mostrar "sin acceso".
 */
export function usePosAccess(online: boolean) {
  const configError = configurationError();
  const [userId, setUserId] = useState<string | null>(null);
  const [access, setAccess] = useState<LocalAccessContext | null>(null);
  const [loading, setLoading] = useState(!configError);
  const [expiredOffline, setExpiredOffline] = useState(false);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let current = true;
    const applySession = (session: SessionLike) => {
      if (!current) return;
      const expired = !online && Boolean(session?.expires_at && session.expires_at <= Math.floor(Date.now() / 1000));
      setExpiredOffline(expired);
      setUserId(session && !expired ? session.user.id : null);
      setLoading(false);
    };
    void client.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => applySession(session));
    return () => {
      current = false;
      subscription.subscription.unsubscribe();
    };
  }, [online]);

  useEffect(() => {
    if (!userId) {
      setAccess(null);
      return;
    }
    let current = true;
    setLoading(true);
    const finish = (next: LocalAccessContext | null) => {
      if (!current) return;
      setAccess(next);
      setLoading(false);
    };
    void (async () => {
      const cached = await getCachedAccessContext(userId);
      const client = getSupabaseClient();
      if (!online || !client) return finish(cached);

      const membership = await client.from("business_memberships").select("business_id,role").eq("is_active", true).order("created_at").limit(1).maybeSingle();
      if (!current) return;
      if (membership.error) return finish(cached);
      if (!membership.data) return finish(null);
      const business = await client.from("businesses").select("name").eq("id", membership.data.business_id).maybeSingle();
      if (!current) return;
      if (business.error) return finish(cached);
      if (!business.data) return finish(null);

      const next: LocalAccessContext = {
        userId,
        businessId: membership.data.business_id,
        businessName: business.data.name,
        role: membership.data.role,
        selectedBranchId: cached?.businessId === membership.data.business_id ? cached.selectedBranchId : null,
        updatedAt: new Date().toISOString(),
      };
      await saveAccessContext(next);
      finish(next);
    })();
    return () => {
      current = false;
    };
  }, [online, userId]);

  const signOut = useCallback(async () => {
    await getSupabaseClient()?.auth.signOut();
  }, []);

  let state: PosAccess;
  if (configError) state = { status: "configuration-error", message: configError };
  else if (loading) state = { status: "loading" };
  else if (!userId) state = { status: "signed-out", expiredOffline };
  else if (access) state = { status: "ready", access };
  else state = online ? { status: "no-access" } : { status: "first-sync-required" };

  return { state, signOut };
}
