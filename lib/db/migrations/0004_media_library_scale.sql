alter table media_library add column if not exists storage_path text;
alter table media_library add column if not exists storage_provider varchar(40);
alter table media_library add column if not exists mime_type varchar(80);
alter table media_library add column if not exists size_bytes integer;

create index if not exists media_library_category_created_idx
  on media_library (category_id, created_at desc);

create index if not exists media_library_approved_created_idx
  on media_library (is_approved, created_at desc);

create index if not exists media_library_title_idx
  on media_library using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));

create index if not exists products_category_created_idx
  on products (category_id, created_at desc);

create index if not exists products_store_created_idx
  on products (store_id, created_at desc);

create index if not exists products_available_created_idx
  on products (is_available, created_at desc);
