
-- profiles
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  default_currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- categories
create type public.category_kind as enum ('expense','income','transfer');

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  color text not null default '#888888',
  icon text,
  kind public.category_kind not null default 'expense',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.categories enable row level security;
create policy "own categories all" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- merchant rules
create table public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  match_text text not null,
  category_id uuid references public.categories on delete set null,
  created_at timestamptz not null default now()
);
alter table public.merchant_rules enable row level security;
create policy "own rules all" on public.merchant_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- transactions
create type public.txn_type as enum ('debit','credit');
create type public.txn_source as enum ('sms_paste','sms_auto','manual');

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  bank text,
  account_last4 text,
  type public.txn_type not null,
  amount numeric(14,2) not null,
  currency text not null default 'INR',
  txn_datetime timestamptz not null default now(),
  counterparty text,
  reference text,
  category_id uuid references public.categories on delete set null,
  notes text,
  raw_sms text,
  source public.txn_source not null default 'manual',
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index transactions_dedupe on public.transactions (user_id, reference, amount) where reference is not null;
create index transactions_user_date on public.transactions (user_id, txn_datetime desc);
alter table public.transactions enable row level security;
create policy "own txns all" on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- sms imports
create table public.sms_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  raw_text text not null,
  parsed_count int not null default 0,
  unparsed_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.sms_imports enable row level security;
create policy "own imports all" on public.sms_imports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- handle new user trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));

  insert into public.categories (user_id, name, color, icon, kind) values
    (new.id, 'Food & Dining', '#f59e0b', '🍽️', 'expense'),
    (new.id, 'Groceries', '#84cc16', '🛒', 'expense'),
    (new.id, 'Transport', '#3b82f6', '🚗', 'expense'),
    (new.id, 'Shopping', '#ec4899', '🛍️', 'expense'),
    (new.id, 'Bills & Utilities', '#ef4444', '💡', 'expense'),
    (new.id, 'Entertainment', '#a855f7', '🎬', 'expense'),
    (new.id, 'Health', '#14b8a6', '💊', 'expense'),
    (new.id, 'Rent', '#dc2626', '🏠', 'expense'),
    (new.id, 'Other Expense', '#6b7280', '📦', 'expense'),
    (new.id, 'Salary', '#22c55e', '💼', 'income'),
    (new.id, 'Refund', '#10b981', '↩️', 'income'),
    (new.id, 'Other Income', '#06b6d4', '💰', 'income'),
    (new.id, 'Self Transfer', '#94a3b8', '🔁', 'transfer');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
