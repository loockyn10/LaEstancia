export type OpenAiErrorDetails = { status: number; type: string | null; code: string | null; message: string | null; request_id: string | null };

export function openAiErrorDetailsFrom(status: number, headers: Headers, payload: unknown): OpenAiErrorDetails {
  const body = payload && typeof payload === "object" ? payload as { error?: { type?: unknown; code?: unknown; message?: unknown } } : null;
  const error = body?.error;
  return {
    status,
    type: typeof error?.type === "string" ? error.type : null,
    code: typeof error?.code === "string" ? error.code : null,
    message: typeof error?.message === "string" ? error.message.slice(0, 1000) : null,
    request_id: headers.get("x-request-id") ?? headers.get("request-id"),
  };
}

export async function toOpenAiFileData(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}
