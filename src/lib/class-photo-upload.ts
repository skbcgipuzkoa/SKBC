/** Browser-safe limits and signature detection shared by the upload route and mobile UI. */
export const UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
export type UploadPhotoMime = 'image/jpeg' | 'image/png' | 'image/webp';
export function detectPhotoMime(bytes: Uint8Array): UploadPhotoMime | null {
  if(bytes.length>=3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff) return 'image/jpeg';
  const png=[137,80,78,71,13,10,26,10];
  if(bytes.length>=8 && png.every((value,index)=>bytes[index]===value)) return 'image/png';
  if(bytes.length>=12 && [82,73,70,70].every((value,index)=>bytes[index]===value) && [87,69,66,80].every((value,index)=>bytes[index+8]===value)) return 'image/webp';
  return null;
}
