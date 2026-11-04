import { type ChangeEvent, useMemo, useState } from "react";
import { Badge, Button, Card, Field, Notice, PageHeader, Select } from "@pet-shop/ui";
import { describeError } from "../../lib/errors";
import { useCatalog } from "../catalog/catalog-context";
import { type ColumnMapping, type ImportPlanRow, type SheetPreview, type Spreadsheet, importFields, makeImportPlan, readSheet, readSpreadsheet, suggestMapping } from "./catalog-import";
import { type ImportResult, importCatalogRows } from "./imports-api";

const statusLabel: Record<ImportPlanRow["status"], string> = { new: "Nueva", existing: "Existente", warning: "Advertencia", invalid: "Inválida" };
const statusTone: Record<ImportPlanRow["status"], "success" | "info" | "warning" | "danger"> = { new: "success", existing: "info", warning: "warning", invalid: "danger" };
const columnLabel = (header: string, index: number) => header || `Columna ${index + 1}`;

export function CatalogImportPage() {
  const { businessId, branches, variants, reload } = useCatalog();
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

  const summary = useMemo(
    () => ({
      total: plan?.length ?? 0,
      new: plan?.filter((item) => item.status === "new" || item.status === "warning").length ?? 0,
      existing: plan?.filter((item) => item.status === "existing").length ?? 0,
      warnings: plan?.filter((item) => item.status === "warning").length ?? 0,
      invalid: plan?.filter((item) => item.status === "invalid").length ?? 0,
    }),
    [plan],
  );
  const needsBranch = Boolean(plan?.some((item) => item.payload && (item.payload.stock_quantity !== null || item.payload.minimum_quantity !== null)));

  function resetOutput() {
    setPlan(null);
    setResult(null);
  }

  async function loadSheet(source: Spreadsheet, name: string, readError: string) {
    try {
      const next = await readSheet(source, name);
      setSheetName(name);
      setSheet(next);
      setMapping(suggestMapping(next.headers));
      resetOutput();
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : readError);
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) return setError("Elegí un archivo .xlsx o .csv.");
    setLoadingFile(true);
    setError(null);
    try {
      const next = await readSpreadsheet(file);
      setSpreadsheet(next);
      await loadSheet(next, next.sheetNames[0], "No pudimos leer el archivo.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No pudimos leer el archivo.");
    } finally {
      setLoadingFile(false);
    }
  }

  function createPreview() {
    if (!sheet) return;
    if (mapping.productName === undefined) return setError("Mapeá la columna obligatoria «Nombre de producto».");
    setError(null);
    setResult(null);
    setPlan(makeImportPlan(sheet.rows, mapping, variants, updateExisting));
  }

  async function applyImport() {
    if (!plan || summary.invalid || (needsBranch && !branchId)) return;
    setSaving(true);
    setError(null);
    try {
      const rows = plan.flatMap((item) => (item.payload ? [item.payload] : []));
      setResult(await importCatalogRows({ businessId, branchId, rows, updateExisting }));
      await reload();
    } catch (failure) {
      setError(`La importación no aplicó cambios: ${describeError(failure)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader description="Leé, mapeá y validá el archivo antes de confirmar. El archivo no se guarda." eyebrow="Catálogo" title="Importar" />

      <Card className="import-panel" title="1. Seleccioná un archivo">
        <Field label="Archivo Excel o CSV">
          <input accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" disabled={loadingFile || saving} onChange={(event) => void chooseFile(event)} type="file" />
        </Field>
        {loadingFile && <p className="muted">Leyendo archivo…</p>}
        {spreadsheet && spreadsheet.sheetNames.length > 1 && (
          <Field label="Hoja">
            <Select aria-label="Hoja" disabled={saving} onChange={(name) => void loadSheet(spreadsheet, name, "No pudimos leer la hoja.")} options={spreadsheet.sheetNames.map((name) => ({ value: name, label: name }))} value={sheetName} />
          </Field>
        )}
      </Card>

      {sheet && (
        <>
          <Card className="import-panel" description={`${sheet.rows.length} filas leídas. Revisá que la primera fila sea la de encabezados.`} title="2. Encabezados y muestra">
            <div className="table-wrap">
              <table>
                <thead><tr>{sheet.headers.map((header, index) => <th key={`${header}-${index}`}>{columnLabel(header, index)}</th>)}</tr></thead>
                <tbody>{sheet.rows.slice(0, 5).map((row, rowIndex) => <tr key={rowIndex}>{sheet.headers.map((_, index) => <td key={index}>{row[index]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </Card>

          <Card className="import-panel" description="Las sugerencias se pueden corregir. Solo el nombre de producto es obligatorio." title="3. Mapeá las columnas">
            <div className="grid">
              {importFields.map((field) => (
                <Field key={field.key} label={`${field.label}${field.key === "productName" ? " *" : ""}`}>
                  <Select
                    aria-label={field.label}
                    disabled={saving}
                    onChange={(value) => {
                      setMapping((current) => ({ ...current, [field.key]: value === "" ? undefined : Number(value) }));
                      resetOutput();
                    }}
                    options={[{ value: "", label: "Sin mapear" }, ...sheet.headers.map((header, index) => ({ value: String(index), label: columnLabel(header, index) }))]}
                    value={mapping[field.key] === undefined ? "" : String(mapping[field.key])}
                  />
                </Field>
              ))}
            </div>
            {(mapping.stock !== undefined || mapping.minimum !== undefined) && (
              <Field className="import-branch" label="Sucursal para el stock">
                <Select
                  aria-label="Sucursal para el stock"
                  disabled={saving}
                  onChange={(value) => { setBranchId(value); setResult(null); }}
                  options={branches.filter((branch) => branch.is_active).map((branch) => ({ value: branch.id, label: branch.name }))}
                  placeholder="Elegí una sucursal antes de confirmar"
                  value={branchId}
                />
              </Field>
            )}
            <label className="check import-option">
              <input checked={updateExisting} disabled={saving} onChange={(event) => { setUpdateExisting(event.target.checked); resetOutput(); }} type="checkbox" />
              Actualizar campos mapeados de presentaciones existentes
            </label>
            <p className="muted">Sin esta opción, los existentes quedan intactos. El stock inicial nunca se repite sobre una presentación existente.</p>
            <div className="form-actions"><Button disabled={saving} onClick={createPreview}>Validar y ver preview</Button></div>
          </Card>
        </>
      )}

      {plan && (
        <Card className="import-panel" title="4. Preview">
          <div className="import-summary">
            <strong>{summary.total} filas</strong>
            <span>{summary.new} nuevas</span>
            <span>{summary.existing} existentes</span>
            <span>{summary.warnings} con advertencias</span>
            <span className={summary.invalid ? "invalid-count" : ""}>{summary.invalid} inválidas</span>
          </div>
          {needsBranch && !branchId && <p className="form-error">Seleccioná la sucursal destino antes de importar stock o mínimo.</p>}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fila</th><th>Producto</th><th>Presentación</th><th>Resultado</th><th>Detalle</th></tr></thead>
              <tbody>
                {plan.slice(0, 30).map((item) => (
                  <tr key={item.rowNumber}>
                    <td>{item.rowNumber}</td>
                    <td>{item.productName || "—"}</td>
                    <td>{item.variantName}</td>
                    <td><Badge tone={statusTone[item.status]}>{statusLabel[item.status]}</Badge></td>
                    <td>{item.messages.join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.length > 30 && <p className="muted">Se muestran 30 filas como ejemplo. El resumen contempla las {plan.length} filas.</p>}
          {summary.invalid > 0 && <p className="form-error">Corregí las filas inválidas en el archivo o en el mapeo y generá un nuevo preview. No se importará parcialmente.</p>}
          <div className="form-actions">
            <Button disabled={summary.invalid > 0 || (needsBranch && !branchId)} loading={saving} onClick={() => void applyImport()}>{saving ? "Importando…" : "Confirmar importación"}</Button>
          </div>
        </Card>
      )}

      {result && (
        <Card className="import-panel" title="5. Resultado">
          <Notice tone="success">Se aplicaron {result.length} filas en una única transacción.</Notice>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fila</th><th>Resultado</th><th>Detalle</th></tr></thead>
              <tbody>{result.map((item) => <tr key={item.source_row_number}><td>{item.source_row_number}</td><td>{item.outcome}</td><td>{item.detail}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  );
}
