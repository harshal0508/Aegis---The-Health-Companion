import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Downloads a page's original image buffer from Supabase Storage.
 * Checks patient-specific, custom storage_path, and legacy user folders.
 */
export async function downloadPageImageBuffer(
  supabase: SupabaseClient,
  userId: string,
  document: { id: string; patient_id?: string | null; storage_path?: string | null },
  pageNo: number
): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
  const documentId = document.id;
  const patientFolder = document.patient_id ? `${userId}/${document.patient_id}/${documentId}` : null;
  const legacyFolder = `${userId}/${documentId}`;
  const docStoragePath = document.storage_path?.trim();

  const candidateFolders = [patientFolder, docStoragePath, legacyFolder].filter(Boolean) as string[];

  let activeBlob: Blob | null = null;
  let matchedFilename = "";

  for (const folder of candidateFolders) {
    const { data: storageFiles } = await supabase.storage.from("medical-records").list(folder);

    if (storageFiles && storageFiles.length > 0) {
      const prefix = `page-${pageNo}.`;
      const matched = storageFiles.find((f) => f.name.toLowerCase().startsWith(prefix));
      if (matched) {
        const fullPath = `${folder}/${matched.name}`;
        const { data: b } = await supabase.storage.from("medical-records").download(fullPath);
        if (b) {
          activeBlob = b;
          matchedFilename = matched.name;
          break;
        }
      }
    }
  }

  if (!activeBlob) {
    const extensions = ["jpg", "jpeg", "png", "webp", "pdf"];
    for (const folder of candidateFolders) {
      for (const ext of extensions) {
        const p = `${folder}/page-${pageNo}.${ext}`;
        const { data: b } = await supabase.storage.from("medical-records").download(p);
        if (b) {
          activeBlob = b;
          matchedFilename = `page-${pageNo}.${ext}`;
          break;
        }
      }
      if (activeBlob) break;
    }
  }

  if (!activeBlob) {
    return null;
  }

  const arrayBuffer = await activeBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType =
    activeBlob.type ||
    (matchedFilename.endsWith(".png")
      ? "image/png"
      : matchedFilename.endsWith(".webp")
      ? "image/webp"
      : matchedFilename.endsWith(".pdf")
      ? "application/pdf"
      : "image/jpeg");

  return { buffer, mimeType, filename: matchedFilename };
}
