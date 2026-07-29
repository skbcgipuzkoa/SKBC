import { createAdminClient } from "@/lib/supabase/admin";

const bucketName = "member-photos";
const maxPhotoBytes = 5 * 1024 * 1024;

export async function uploadMemberPhoto(file: File | null, memberLegacyId: string) {
  if (!file || file.size === 0) return null;
  if (!file.type.startsWith("image/")) {
    throw new Error("El archivo debe ser una imagen.");
  }
  if (file.size > maxPhotoBytes) {
    throw new Error("La imagen no puede superar 5 MB.");
  }

  const supabase = createAdminClient();
  await ensurePhotoBucket();

  const extension = extensionFromFile(file);
  const safeLegacyId = memberLegacyId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const path = `${safeLegacyId}/${Date.now()}${extension}`;
  const bytes = await file.arrayBuffer();

  const { error } = await supabase.storage.from(bucketName).upload(path, bytes, {
    contentType: file.type,
    upsert: true
  });

  if (error) throw error;

  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
  return data.publicUrl;
}

async function ensurePhotoBucket() {
  const supabase = createAdminClient();
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (buckets.some((bucket) => bucket.name === bucketName)) return;

  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: true,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    fileSizeLimit: maxPhotoBytes
  });

  if (createError) throw createError;
}

function extensionFromFile(file: File) {
  const nameExtension = file.name.match(/\.[a-zA-Z0-9]+$/)?.[0]?.toLowerCase();
  if (nameExtension && [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(nameExtension)) {
    return nameExtension;
  }

  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif"
  };
  return map[file.type] ?? ".jpg";
}
