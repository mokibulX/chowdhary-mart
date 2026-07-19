alter table if exists coupons
  add column if not exists is_special boolean not null default false;
