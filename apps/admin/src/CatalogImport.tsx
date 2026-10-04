import { type ChangeEvent, useMemo, useState } from "react";
import { getSupabaseClient } from "./lib/supabase";
import {
  type ColumnMapping,
  type ImportPlanRow,
  type SheetPreview,
  importFields,
  makeImportPlan,
  readSheet,
  readSpreadsheet,
  suggestMapping,
  type Spreadsheet,
} from "./catalog-import";

type ExistingVariant = {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  barcodes: string[];
};
type Branch = { id: string; name: string; is_active: boolean };
type ImportResult = { source_row_number: number; outcome: string; detail: string };

export function CatalogImport({
  businessId,
  canEdit,
  branches,
  existing,
}: {
  businessId: string;
  canEdit: boolean;
  branches: Branch[];
  existing: ExistingVariant[];
}) {
  const [spreadsheet, setSpreadsheet] = useState<Spreadsheet | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [sheet, setSheet] = useState<SheetPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [branchId, setBranchId] = useState("");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [plan, setPlan] = useState<ImportPlanRow[] | null>(null);
  const [result, setResult] = useState<ImportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);

  const summary = useMemo(() => ({
    total: plan?.length ?? 0,
    new: plan?.filter((item) => item.status === "new" || item.status === "warning").length ?? 0,
    existing: plan?.filter((item) => item.status === "existing").length ?? 0,
    warnings: plan?.filter((item) => item.status === "warning").length ?? 0,
    invalid: plan?.filter((item) => item.status === "invalid").length ?? 0,
  }), [plan]);
  const needsBranch = Boolean(plan?.some((item) => item.payload && (item.payload.stock_quantity !== null || item.payload.minimum_quantity !== null)));

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setError("Elegí un archivo .xlsx o .csv.");
      return;
    }
    setLoadingFile(true);
    setError(null);
    try {
      const nextSpreadsheet = await readSpreadsheet(file);
      const nextSheetName = nextSpreadsheet.sheetNames[0];
      const nextSheet = await readSheet(nextSpreadsheet, nextSheetName);
      setSpreadsheet(nextSpreadsheet);
      setSheetName(nextSheetName);
      setSheet(nextSheet);
      setMapping(suggestMapping(nextSheet.headers));
      setPlan(null);
      setResult(null);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "No pudimos leer el archivo.");
    } finally {
      setLoadingFile(false);
    }
  }

  async function chooseSheet(nextSheetName: string) {
    if (!spreadsheet) return;
    try {
      const nextSheet = await readSheet(spreadsheet, nextSheetName);
      setSheetName(nextSheetName);
      setSheet(nextSheet);
      setMapping(suggestMapping(nextSheet.headers));
      setPlan(null);
      setResult(null);
      setError(null);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "No pudimos leer la hoja.");
    }
  }

  function createPreview() {
    if (!sheet) return;
    if (mapping.productName === undefined) {
      setError("Mapeá la columna obligatoria «Nombre de producto».");
      return;
    }
    setError(null);
    setResult(null);
    setPlan(makeImportPlan(sheet.rows, mapping, existing, updateExisting));
  }

  async function applyImport() {
    if (!plan || summary.invalid || (needsBranch && !branchId)) return;
    const rows = plan.flatMap((item) => item.payload ? [item.payload] : []);
    const supabase = getSupabaseClient();
    if (!supabase) return setError("Falta configurar la conexión a Supabase.");
    setSaving(true);
    setError(null);
    const { data, error: importError } = await supabase.rpc("import_catalog_rows_v2", {
      target_business_id: businessId,
      target_branch_id: branchId || undefined,
      import_rows: rows,
      update_existing: updateExisting,
    });
    setSaving(false);
    if (importError) {
      setError(`La importación no aplicó cambios: ${importError.message}`);
      return;
    }
    setResult(data ?? []);
  }

  if (!canEdit) return <section className="state-box"><h2>Sin permisos para importar</h2><p>Solo owner y admin pueden importar catálogo.</p></section>;

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Catálogo</p><h1>Importar</h1><p className="subtle">Leé, mapeá y validá el archivo antes de confirmar. El archivo no se guarda.</p></div>
      </header>
      <section className="form-section import-panel">
        <h2>1. Seleccioná un archivo</h2>
        <label>Archivo Excel o CSV<input accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" disabled={loadingFile || saving} onChange={(event) => void chooseFile(event)} type="file" /></label>
        {loadingFile && <p className="muted">Leyendo archivo…</p>}
        {spreadsheet && spreadsheet.sheetNames.length > 1 && <label>Hoja<select disabled={saving} onChange={(event) => chooseSheet(event.target.value)} value={sheetName}>{spreadsheet.sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>}
      </section>
      {sheet && <>
        <section className="form-section import-panel">
          <h2>2. Encabezados y muestra</h2>
          <p className="muted">{sheet.rows.length} filas leídas. Revisá que la primera fila sea la de encabezados.</p>
          <div className="table-wrap"><table><thead><tr>{sheet.headers.map((header, index) => <th key={`${header}-${index}`}>{header || `Columna ${index + 1}`}</th>)}</tr></thead><tbody>{sheet.rows.slice(0, 5).map((row, rowIndex) => <tr key={rowIndex}>{sheet.headers.map((_, index) => <td key={index}>{row[index]}</td>)}</tr>)}</tbody></table></div>
        </section>
        <section className="form-section import-panel">
          <h2>3. Mapeá las columnas</h2>
          <p className="muted">Las sugerencias se pueden corregir. Solo el nombre de producto es obligatorio.</p>
          <div className="grid">{importFields.map((field) => <label key={field.key}>{field.label}{field.key === "productName" ? " *" : ""}<select disabled={saving} onChange={(event) => { const value = event.target.value; setMapping((current) => ({ ...current, [field.key]: value === "" ? undefined : Number(value) })); setPlan(null); setResult(null); }} value={mapping[field.key] ?? ""}><option value="">Sin mapear</option>{sheet.headers.map((header, index) => <option key={index} value={index}>{header || `Columna ${index + 1}`}</option>)}</select></label>)}</div>
          {(mapping.stock !== undefined || mapping.minimum !== undefined) && <label className="import-branch">Sucursal para el stock<select disabled={saving} onChange={(event) => { setBranchId(event.target.value); setResult(null); }} value={branchId}><option value="">Elegí una sucursal antes de confirmar</option>{branches.filter((branch) => branch.is_active).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
          <label className="check import-option"><input checked={updateExisting} disabled={saving} onChange={(event) => { setUpdateExisting(event.target.checked); setPlan(null); setResult(null); }} type="checkbox" />Actualizar campos mapeados de presentaciones existentes</label>
          <p className="muted">Sin esta opción, los existentes quedan intactos. El stock inicial nunca se repite sobre una presentación existente.</p>
          <div className="form-actions"><button disabled={saving} onClick={createPreview} type="button">Validar y ver preview</button></div>
        </section>
      </>}
      {plan && <section className="form-section import-panel">
        <h2>4. Preview</h2>
        <div className="import-summary"><strong>{summary.total} filas</strong><span>{summary.new} nuevas</span><span>{summary.existing} existentes</span><span>{summary.warnings} con advertencias</span><span className={summary.invalid ? "invalid-count" : ""}>{summary.invalid} inválidas</span></div>
        {needsBranch && !branchId && <p className="form-error">Seleccioná la sucursal destino antes de importar stock o mínimo.</p>}
        <div className="table-wrap"><table><thead><tr><th>Fila</th><th>Producto</th><th>Presentación</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>{plan.slice(0, 30).map((item) => <tr key={item.rowNumber}><td>{item.rowNumber}</td><td>{item.productName || "—"}</td><td>{item.variantName}</td><td><span className={`import-status ${item.status}`}>{item.status === "new" ? "Nueva" : item.status === "existing" ? "Existente" : item.status === "warning" ? "Advertencia" : "Inválida"}</span></td><td>{item.messages.join(" ")}</td></tr>)}</tbody></table></div>
        {plan.length > 30 && <p className="muted">Se muestran 30 filas como ejemplo. El resumen contempla las {plan.length} filas.</p>}
        {summary.invalid > 0 && <p className="form-error">Corregí las filas inválidas en el archivo o en el mapeo y generá un nuevo preview. No se importará parcialmente.</p>}
        <div className="form-actions"><button disabled={saving || summary.invalid > 0 || (needsBranch && !branchId)} onClick={() => void applyImport()} type="button">{saving ? "Importando…" : "Confirmar importación"}</button></div>
      </section>}
      {result && <section className="form-section import-panel"><h2>5. Resultado</h2><p className="notice">Se aplicaron {result.length} filas en una única transacción.</p><div className="table-wrap"><table><thead><tr><th>Fila</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>{result.map((item) => <tr key={item.source_row_number}><td>{item.source_row_number}</td><td>{item.outcome}</td><td>{item.detail}</td></tr>)}</tbody></table></div></section>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  );
}
