import { useCallback, useEffect, useState } from "react";
import { configurationError } from "../config/env";
import { getSupabaseClient } from "../lib/supabase";
import { type Access, accessForMembership } from "./access";

/**
 * Sesión de Supabase Auth → membresía activa → negocio. Un único lugar resuelve "quién es el usuario
 * y qué puede ver"; el resto de la app sólo consume el resultado.
 */
export function useAccess() {
  const configError = configurationError();
  const [access, setAccess] = useState<Access>(
    configError ? { status: "configuration-error", message: configError } : { status: "resolving-session" },
  );
  const [userId, setUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let alive = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setAccess({ status: "error", message: error.message });
      else setUserId(data.session?.user.id ?? null);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (alive) setUserId(session?.user.id ?? null);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || userId === undefined) return;
    if (!userId) {
      setAccess({ status: "signed-out" });
      return;
    }
    let alive = true;
    setAccess({ status: "resolving-access" });
    void (async () => {
      // RLS sólo expone las membresías del propio usuario.
      const { data: memberships, error } = await client
        .from("business_memberships")
        .select("business_id,role")
        .eq("is_active", true)
        .order("created_at")
        .limit(1);
      if (!alive) return;
      if (error) return setAccess({ status: "error", message: error.message });
      const membership = memberships?.[0];
      if (!membership) return setAccess({ status: "no-access" });
      const { data: business, error: businessError } = await client
        .from("businesses")
        .select("name")
        .eq("id", membership.business_id)
        .maybeSingle();
      if (!alive) return;
      if (businessError) return setAccess({ status: "error", message: businessError.message });
      if (!business) return setAccess({ status: "no-access" });
      setAccess(accessForMembership(membership, business.name));
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const signOut = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) setAccess({ status: "error", message: error.message });
  }, []);

  return { access, signOut };
}
