insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('skbc-shop-images', 'skbc-shop-images', true, 4000000, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
