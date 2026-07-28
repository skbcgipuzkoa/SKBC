export function driveImageUrl(source: string | null | undefined) {
  const id = extractDriveFileId(source);
  return id ? `/api/drive-image/${id}` : null;
}

export function extractDriveFileId(source: string | null | undefined) {
  if (!source) return null;

  const value = source.trim();
  const idParam = value.match(/[?&]id=([^&]+)/);
  if (idParam?.[1]) return idParam[1];

  const filePath = value.match(/\/file\/d\/([^/]+)/);
  if (filePath?.[1]) return filePath[1];

  return null;
}
