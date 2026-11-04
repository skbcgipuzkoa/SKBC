export function TechniqueVideoLink({ url, name }: { url: string | null | undefined; name: string }) {
  if (!url?.trim()) return null;
  let videoUrl: URL;
  try {
    videoUrl = new URL(url.trim());
  } catch {
    return null;
  }
  if (!["https:", "http:"].includes(videoUrl.protocol)) return null;
  return (
    <a
      className="technical-progress-video-link"
      href={videoUrl.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Ver vídeo de ${name}`}
    >Ver vídeo</a>
  );
}
