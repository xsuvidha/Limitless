-- ============================================================
-- THE SYMPHONY OF SHADOWS — gallery schema
-- Run in Supabase → SQL Editor. Phase: persistence (v1.1).
-- ============================================================

create extension if not exists "pgcrypto";

-- Each row is one frozen performance: a shadow that was cast once.
create table if not exists performances (
  id           uuid primary key default gen_random_uuid(),
  seed         text        not null check (char_length(seed) between 1 and 200),
  program      jsonb       not null,          -- the six voices, as returned
  provider     text,                          -- which provider sang it
  is_public    boolean     not null default false,
  owner_id     uuid        references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index if not exists performances_created_idx on performances (created_at desc);
create index if not exists performances_seed_idx    on performances using gin (to_tsvector('english', seed));
create index if not exists performances_owner_idx   on performances (owner_id);

-- ---- Row Level Security -------------------------------------
-- RLS means the DATABASE enforces who sees what, not your app code.
-- With RLS on and no policy, nothing is readable. Policies open doors.
alter table performances enable row level security;

-- Anyone may read performances explicitly marked public.
create policy "public shadows are readable"
  on performances for select
  using (is_public = true);

-- Signed-in users may read their own, public or not.
create policy "owners read their own"
  on performances for select
  using (auth.uid() = owner_id);

-- Signed-in users may save, but only as themselves.
create policy "owners insert their own"
  on performances for insert
  with check (auth.uid() = owner_id);

-- Owners may update / delete only their own.
create policy "owners update their own"
  on performances for update
  using (auth.uid() = owner_id);

create policy "owners delete their own"
  on performances for delete
  using (auth.uid() = owner_id);

-- ============================================================
-- LATER (v2): the semantic gallery — "seeds that rhyme with yours"
-- Store an embedding per performance and find neighbours by meaning.
-- ------------------------------------------------------------
-- create extension if not exists vector;
-- alter table performances add column if not exists embedding vector(768);
-- create index on performances using hnsw (embedding vector_cosine_ops);
--
-- create or replace function match_performances(
--   query_embedding vector(768), match_count int default 5
-- ) returns table (id uuid, seed text, similarity float)
-- language sql stable as $$
--   select id, seed, 1 - (embedding <=> query_embedding) as similarity
--   from performances
--   where is_public = true and embedding is not null
--   order by embedding <=> query_embedding
--   limit match_count;
-- $$;
-- ============================================================
