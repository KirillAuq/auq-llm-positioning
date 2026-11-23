-- Visitors can now give their name and an llms.txt address on the intake.
alter table public.leads add column if not exists name text not null default '';
alter table public.leads add column if not exists llms_txt text not null default '';
