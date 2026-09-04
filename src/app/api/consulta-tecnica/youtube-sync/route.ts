import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTechniqueVideoKey, type ConsultationTechnique } from "@/lib/technical-consultation-core";

const channelId = "UCnrh0j6aLgGRt7h1fLz0uwA";
const uploadsPlaylistId = `UU${channelId.slice(2)}`;

type YoutubeVideo = {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
};

type YoutubeLoadResult = {
  source: "oauth" | "api_key" | "feed";
  videos: YoutubeVideo[];
};

export async function POST() {
  if (!(await hasInternalAccess())) {
    return NextResponse.json({ error: "Acceso interno requerido." }, { status: 403 });
  }

  let youtubeResult: YoutubeLoadResult;
  let techniques: ConsultationTechnique[];
  try {
    [youtubeResult, techniques] = await Promise.all([loadYoutubeVideos(), loadUnlinkedTechniques()]);
  } catch (error) {
    console.error("Error loading YouTube videos for technique sync", error);
    const detail = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: "No se ha podido leer el canal de YouTube.", detail }, { status: 502 });
  }

  const videos = youtubeResult.videos;
  const matches = buildMatches(techniques, videos);

  if (!matches.length) {
    return NextResponse.json({ source: youtubeResult.source, scannedVideos: videos.length, matched: 0, updated: 0 });
  }

  const supabase = createAdminClient();
  let updated = 0;
  for (const match of matches) {
    const { error } = await supabase
      .from("techniques")
      .update({
        video_url: match.video.url,
        video_title: match.video.title,
        video_id: match.video.id,
        video_match_status: "auto",
        video_match_source: "youtube_sync",
        video_matched_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", match.technique.id);
    if (!error) updated += 1;
  }

  revalidatePath("/consulta-tecnica");
  revalidatePath("/tecnicas");

  return NextResponse.json({ source: youtubeResult.source, scannedVideos: videos.length, matched: matches.length, updated });
}

async function loadUnlinkedTechniques() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("techniques")
    .select("id,legacy_id,grade,base_name,name,variant,variant_note,category,content_type,summary_es,active,active_in_planning,video_url,video_title,video_id,video_matched_at,video_match_status,video_match_source")
    .is("video_url", null)
    .eq("active", true)
    .returns<ConsultationTechnique[]>();

  if (error) throw error;
  return data ?? [];
}

async function loadYoutubeVideos() {
  const oauthRefreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN?.trim();
  const oauthClientId = process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim() || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const oauthClientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim() || process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (oauthRefreshToken && oauthClientId && oauthClientSecret) {
    const accessToken = await refreshYoutubeAccessToken(oauthClientId, oauthClientSecret, oauthRefreshToken);
    return { source: "oauth" as const, videos: await loadYoutubeVideosFromOAuth(accessToken) };
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (apiKey) return { source: "api_key" as const, videos: await loadYoutubeVideosFromApi(apiKey) };
  return { source: "feed" as const, videos: await loadYoutubeVideosFromFeed() };
}

async function refreshYoutubeAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    next: { revalidate: 0 }
  });
  if (!response.ok) {
    const detail = await safeReadYoutubeError(response);
    throw new Error(`YouTube OAuth token error ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const token = await response.json();
  if (!token.access_token) throw new Error("YouTube OAuth token missing access_token");
  return String(token.access_token);
}

async function loadYoutubeVideosFromOAuth(accessToken: string) {
  const videos: YoutubeVideo[] = [];
  let pageToken = "";

  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,status");
    url.searchParams.set("playlistId", uploadsPlaylistId);
    url.searchParams.set("maxResults", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      next: { revalidate: 0 }
    });
    if (!response.ok) throw new Error(`YouTube OAuth API error ${response.status}`);
    const body = await response.json();
    for (const item of body.items ?? []) {
      const videoId = item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title;
      if (videoId && title && title !== "Private video" && title !== "Deleted video") {
        videos.push({
          id: videoId,
          title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          publishedAt: item.snippet?.publishedAt ?? null
        });
      }
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);

  return videos;
}

async function loadYoutubeVideosFromApi(apiKey: string) {
  const videos: YoutubeVideo[] = [];
  let pageToken = "";

  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("playlistId", uploadsPlaylistId);
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) throw new Error(`YouTube API error ${response.status}`);
    const body = await response.json();
    for (const item of body.items ?? []) {
      const videoId = item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title;
      if (videoId && title) {
        videos.push({
          id: videoId,
          title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          publishedAt: item.snippet?.publishedAt ?? null
        });
      }
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);

  return videos;
}

async function loadYoutubeVideosFromFeed() {
  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, { next: { revalidate: 0 } });
  if (!response.ok) throw new Error(`YouTube feed error ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((entry) => {
    const block = entry[1];
    const id = textBetween(block, "<yt:videoId>", "</yt:videoId>");
    const title = decodeXml(textBetween(block, "<title>", "</title>"));
    return {
      id,
      title,
      url: `https://www.youtube.com/watch?v=${id}`,
      publishedAt: textBetween(block, "<published>", "</published>") || null
    };
  }).filter((video) => video.id && video.title);
}

function buildMatches(techniques: ConsultationTechnique[], videos: YoutubeVideo[]) {
  const videoKeys = videos.map((video) => ({ video, key: normalizeTechniqueVideoKey(video.title) }));
  const usedVideos = new Set<string>();
  const matches: Array<{ technique: ConsultationTechnique; video: YoutubeVideo }> = [];

  for (const technique of techniques) {
    const keys = [technique.name, technique.base_name ? `${technique.base_name} ${technique.variant ?? ""}` : null]
      .map(normalizeTechniqueVideoKey)
      .filter((key) => key.length >= 4);
    const match = videoKeys.find(({ video, key }) => !usedVideos.has(video.id) && keys.some((techniqueKey) => key === techniqueKey || key.includes(techniqueKey)));
    if (match) {
      matches.push({ technique, video: match.video });
      usedVideos.add(match.video.id);
    }
  }

  return matches;
}

function textBetween(value: string, start: string, end: string) {
  const from = value.indexOf(start);
  if (from === -1) return "";
  const to = value.indexOf(end, from + start.length);
  if (to === -1) return "";
  return value.slice(from + start.length, to).trim();
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function safeReadYoutubeError(response: Response) {
  try {
    const body = await response.json();
    const error = typeof body?.error === "string" ? body.error : "";
    const description = typeof body?.error_description === "string" ? body.error_description : "";
    return [error, description].filter(Boolean).join(" - ");
  } catch {
    return "";
  }
}
