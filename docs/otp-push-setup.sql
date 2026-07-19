-- ChowdharyMart real OTP, push notification and 3-accounts-per-phone setup.
-- Run this once in Supabase SQL Editor or your Postgres admin console.

alter table if exists users drop constraint if exists users_phone_unique;
drop index if exists users_phone_unique;

create table if not exists otp_codes (
  id serial primary key,
  target varchar(255) not null,
  channel varchar(20) not null,
  purpose varchar(40) not null,
  code_hash varchar(255) not null,
  attempts integer not null default 0,
  is_used boolean not null default false,
  expires_at timestamp not null,
  created_at timestamp not null default now()
);

create index if not exists otp_codes_lookup_idx
  on otp_codes (target, channel, purpose, is_used, expires_at desc);

create table if not exists push_tokens (
  id serial primary key,
  user_id integer not null references users(id) on delete cascade,
  token text not null,
  platform varchar(30) not null default 'web',
  device_id varchar(255),
  is_active boolean not null default true,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create unique index if not exists push_tokens_token_unique_idx on push_tokens (token);
create index if not exists push_tokens_user_idx on push_tokens (user_id, is_active);

create index if not exists users_phone_idx on users (phone);
