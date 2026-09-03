alter table public.techniques
  add column if not exists video_url text,
  add column if not exists video_title text,
  add column if not exists video_id text,
  add column if not exists video_matched_at timestamptz,
  add column if not exists video_match_status text not null default 'pending',
  add column if not exists video_match_source text;

create index if not exists techniques_video_match_status_idx
  on public.techniques (video_match_status);
