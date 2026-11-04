import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";
import { describeError } from "../lib/errors";
import { getLocalOverview, listSellableOptions, saveSelectedBranch } from "../local-db/repository";
import type { LocalAccessContext, LocalBranch, PosOption } from "../local-db/types";
import { supabaseSnapshotDownloader, supabaseStockDownloader, synchronizeCatalog, synchronizeStock } from "../sync/catalog-sync";

/**
 * Catálogo operativo del POS: Supabase → sincronización → IndexedDB → UI.
 * La pantalla lee siempre las opciones locales (online u offline); sólo `syncNow`/`refreshStock` hablan con Supabase.
 */
export function usePosCatalog(access: LocalAccessContext, online: boolean) {
  const [branches, setBranches] = useState<LocalBranch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [options, setOptions] = useState<PosOption[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hasLocalData, setHasLocalData] = useState(false);
  const [revision, setRevision] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const autoSyncedBusiness = useRef<string | null>(null);

  const hydrate = useCallback(async (preferredBranchId?: string | null) => {
    const overview = await getLocalOverview(access.businessId);
    setBranches(overview.branches);
    setLastSync(overview.lastSyncAt);
    setHasLocalData(overview.hasLocalData);
    const next = overview.branches.some((branch) => branch.id === preferredBranchId)
      ? preferredBranchId!
      : overview.branches.find((branch) => branch.isActive)?.id ?? overview.branches[0]?.id ?? "";
    setBranchId(next);
    if (next) await saveSelectedBranch(access.userId, access.businessId, next);
    setRevision((current) => current + 1);
  }, [access.businessId, access.userId]);

  const syncNow = useCallback(async (preferredBranchId?: string | null) => {
    const client = getSupabaseClient();
    if (!client || !online) return false;
    setSyncing(true);
    setSyncError(null);
    try {
      await synchronizeCatalog(access.businessId, supabaseSnapshotDownloader(client));
      await hydrate(preferredBranchId);
      return true;
    } catch (failure) {
      setSyncError(`No se pudo sincronizar. Podés seguir usando los últimos datos locales disponibles.${import.meta.env.DEV ? ` [${describeError(failure)}]` : ""}`);
      return false;
    } finally {
      setSyncing(false);
    }
  }, [access.businessId, hydrate, online]);

  /** Después de cobrar sólo cambió el stock: se refresca únicamente eso, no todo el catálogo. */
  const refreshStock = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !online) return;
    try {
      await synchronizeStock(access.businessId, supabaseStockDownloader(client));
      setRevision((current) => current + 1);
    } catch (failure) {
      setSyncError(`No se pudo actualizar el stock conocido.${import.meta.env.DEV ? ` [${describeError(failure)}]` : ""}`);
    }
  }, [access.businessId, online]);

  useEffect(() => { void hydrate(access.selectedBranchId); }, [access.selectedBranchId, hydrate]);

  useEffect(() => {
    if (!online || autoSyncedBusiness.current === access.businessId) return;
    autoSyncedBusiness.current = access.businessId;
    void syncNow(access.selectedBranchId);
  }, [access.businessId, access.selectedBranchId, online, syncNow]);

  // Las opciones vendibles se leen de IndexedDB una vez por cambio de sucursal/sincronización; la búsqueda por tecla es en memoria.
  useEffect(() => {
    let current = true;
    if (!branchId || !hasLocalData) { setOptions([]); return; }
    void listSellableOptions(access.businessId, branchId).then((loaded) => { if (current) setOptions(loaded); });
    return () => { current = false; };
  }, [access.businessId, branchId, hasLocalData, revision]);

  const selectBranch = useCallback(async (nextBranchId: string) => {
    setBranchId(nextBranchId);
    await saveSelectedBranch(access.userId, access.businessId, nextBranchId);
  }, [access.businessId, access.userId]);

  return { branches, branchId, options, lastSync, hasLocalData, syncing, syncError, syncNow, refreshStock, selectBranch };
}
