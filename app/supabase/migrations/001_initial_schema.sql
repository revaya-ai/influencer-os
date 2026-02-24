-- ============================================================================
-- InfluencerOS: Initial Schema Migration
-- 001_initial_schema.sql
--
-- Tables: brands, influencers, campaigns, campaign_influencers, payments, documents
-- Includes: Indexes, RLS policies, updated_at triggers
-- ============================================================================

-- ============================================================================
-- UTILITY: updated_at trigger function
-- ============================================================================

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- TABLE: brands
-- ============================================================================

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invoice_email text,
  invoice_instructions text,
  created_at timestamptz not null default now()
);

comment on table public.brands is 'Brand companies that run influencer campaigns.';

-- ============================================================================
-- TABLE: influencers
-- ============================================================================

create table public.influencers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  handle text,
  email text,
  platform text check (platform in ('instagram', 'tiktok')),
  content_type text,
  location text,
  rate numeric,
  follower_count integer,
  notes text,
  performance_rating numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.influencers is 'Influencer roster with contact info, rates, and performance data.';

create trigger set_influencers_updated_at
  before update on public.influencers
  for each row
  execute function public.handle_updated_at();

-- ============================================================================
-- TABLE: campaigns
-- ============================================================================

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  retailer text,
  region text,
  name text not null,
  quarter text,
  products text,
  budget numeric,
  posting_deadline date,
  status text not null default 'active' check (status in ('active', 'completed', 'draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.campaigns is 'Influencer marketing campaigns tied to a brand.';

create trigger set_campaigns_updated_at
  before update on public.campaigns
  for each row
  execute function public.handle_updated_at();

-- ============================================================================
-- TABLE: campaign_influencers
-- ============================================================================

create table public.campaign_influencers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  influencer_id uuid not null references public.influencers(id) on delete cascade,
  pipeline_stage text not null default 'contacted' check (
    pipeline_stage in (
      'contacted',
      'brief_sent',
      'content_received',
      'w9_done',
      'invoice_received',
      'paid',
      'posted'
    )
  ),
  deliverable text,
  w9_status text not null default 'pending' check (w9_status in ('pending', 'received', 'not_required')),
  invoice_status text not null default 'pending' check (invoice_status in ('pending', 'requested', 'received')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'processing', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, influencer_id)
);

comment on table public.campaign_influencers is 'Join table tracking each influencer assignment within a campaign and its pipeline status.';

create trigger set_campaign_influencers_updated_at
  before update on public.campaign_influencers
  for each row
  execute function public.handle_updated_at();

-- ============================================================================
-- TABLE: payments
-- ============================================================================

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  campaign_influencer_id uuid not null references public.campaign_influencers(id) on delete cascade,
  amount numeric,
  date_sent date,
  method text,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.payments is 'Payment records for influencer work on campaigns.';

-- ============================================================================
-- TABLE: documents
-- ============================================================================

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  campaign_influencer_id uuid not null references public.campaign_influencers(id) on delete cascade,
  type text not null check (type in ('w9', 'invoice')),
  file_url text,
  uploaded_at timestamptz not null default now()
);

comment on table public.documents is 'W9 and invoice documents uploaded for campaign influencer assignments.';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- campaigns: brand lookup and status filtering
create index idx_campaigns_brand_id on public.campaigns(brand_id);
create index idx_campaigns_status on public.campaigns(status);

-- campaign_influencers: FK lookups and pipeline filtering
create index idx_campaign_influencers_campaign_id on public.campaign_influencers(campaign_id);
create index idx_campaign_influencers_influencer_id on public.campaign_influencers(influencer_id);
create index idx_campaign_influencers_pipeline_stage on public.campaign_influencers(pipeline_stage);

-- payments: FK lookup
create index idx_payments_campaign_influencer_id on public.payments(campaign_influencer_id);

-- documents: FK lookup and type filtering
create index idx_documents_campaign_influencer_id on public.documents(campaign_influencer_id);
create index idx_documents_type on public.documents(type);

-- influencers: platform filtering
create index idx_influencers_platform on public.influencers(platform);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.brands enable row level security;
alter table public.influencers enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_influencers enable row level security;
alter table public.payments enable row level security;
alter table public.documents enable row level security;

-- Authenticated users get full CRUD on all tables.
-- Scope these down further if multi-tenant isolation is needed later.

create policy "Authenticated users can select brands"
  on public.brands for select to authenticated using (true);
create policy "Authenticated users can insert brands"
  on public.brands for insert to authenticated with check (true);
create policy "Authenticated users can update brands"
  on public.brands for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete brands"
  on public.brands for delete to authenticated using (true);

create policy "Authenticated users can select influencers"
  on public.influencers for select to authenticated using (true);
create policy "Authenticated users can insert influencers"
  on public.influencers for insert to authenticated with check (true);
create policy "Authenticated users can update influencers"
  on public.influencers for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete influencers"
  on public.influencers for delete to authenticated using (true);

create policy "Authenticated users can select campaigns"
  on public.campaigns for select to authenticated using (true);
create policy "Authenticated users can insert campaigns"
  on public.campaigns for insert to authenticated with check (true);
create policy "Authenticated users can update campaigns"
  on public.campaigns for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete campaigns"
  on public.campaigns for delete to authenticated using (true);

create policy "Authenticated users can select campaign_influencers"
  on public.campaign_influencers for select to authenticated using (true);
create policy "Authenticated users can insert campaign_influencers"
  on public.campaign_influencers for insert to authenticated with check (true);
create policy "Authenticated users can update campaign_influencers"
  on public.campaign_influencers for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete campaign_influencers"
  on public.campaign_influencers for delete to authenticated using (true);

create policy "Authenticated users can select payments"
  on public.payments for select to authenticated using (true);
create policy "Authenticated users can insert payments"
  on public.payments for insert to authenticated with check (true);
create policy "Authenticated users can update payments"
  on public.payments for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete payments"
  on public.payments for delete to authenticated using (true);

create policy "Authenticated users can select documents"
  on public.documents for select to authenticated using (true);
create policy "Authenticated users can insert documents"
  on public.documents for insert to authenticated with check (true);
create policy "Authenticated users can update documents"
  on public.documents for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete documents"
  on public.documents for delete to authenticated using (true);

-- ============================================================================
-- STORAGE NOTE
-- ============================================================================
-- Supabase Storage buckets cannot be created via SQL migrations.
-- Create a bucket named "documents" in the Supabase Dashboard under Storage.
-- Recommended settings:
--   - Public: false (private bucket, use signed URLs)
--   - Allowed MIME types: application/pdf, image/png, image/jpeg
--   - Max file size: 10MB
-- Then add a storage policy granting authenticated users insert/select/delete.
-- ============================================================================
