# Class photo albums

Approved by the club owner: originals remain private in their Drive; admin reviews a class album and publishes selected photos; only attendees see it in their own ficha history. The shared album may contain other attendees. No facial recognition, no automatic image publishing, no public Drive permissions, no image copies in Supabase or the repository.

Root folder created with the Google Drive connector: `15Fl2RjeqV0ui-xCt8f6esGh6hzCTT5eS`, “SKBC · Fotos de entrenamientos”. Use the application's existing Google OAuth/service-account integration to list/stream private files. Album metadata also lives in Drive, attached to per-class folders, avoiding a new database migration. Bind folders to immutable SKBC class UUIDs; store only approved image IDs in published metadata. Limit and validate images; detect malformed metadata. Draft changes require explicit publication; unpublishing removes access immediately.

1. Drive adapter and tests: ensure class folder under the configured root, list supported images, load/update bounded metadata, validate photo membership before publication; never create public permissions. Paginate lists and surface access failures clearly.
2. Service authorization and tests: internal-only administration; public ficha token must resolve to an active member and have attendance for the exact class ID. Recheck publication/allowlist and attendance on every media request. Private no-store responses, no arbitrary file proxy.
3. Admin UI on each class: create/open Drive subfolder, caption, select images, save draft, publish/withdraw. Families: photo/activity cards inside attendance history, responsive lazy images and private source links.
4. Verify absent attendee/other class, inactive/bad token, draft/withdrawn/foreign photo, image types, pagination/errors, existing fiche behavior. Independent review, build, deploy, verify production. Do not publish any real class album while testing.

## Approved direct-upload and compact-history follow-up

Upload from the class on desktop/mobile: browser optimizes images sequentially to bounded JPEGs; one authenticated same-origin multipart request per image, max3MiB, header signatures and actual body bytes checked before private Drive upload. Upload never publishes or changes the published selection. Preserve unsaved caption/checkbox DOM across refresh, report progress and failed files without automatic replay.

Every existing normal-class creation path provisions its own album folder, including distinct children/adult companion UUIDs. A total3.5s cancellable Drive deadline prevents optional provisioning from stalling class creation; groups provision in parallel. Failure leaves a recoverable pending-folder notice and upload/manual retry can create the folder later.

Family history uses closed per-class capsules and mounts private images only when opened. Handle legitimate Google media redirects with a bounded allowlist and no OAuth credentials on cross-origin hops; do not weaken private publication/attendance checks. Verify actual published photo renders after deploying, without creating real classes or publishing families' photos as tests.
