# SafeGuard - Siginon Safety Culture System

A workplace safety reporting and tracking app built for Siginon, developed as a JKUAT industrial attachment project.

## What it does

- Staff can submit safety reports (near misses, hazards, good catches, incidents) with photos.
- Reports are auto-assigned to the supervisor of the site they were submitted at, who's notified by email.
- Admins, HSE officers, and supervisors get role-scoped dashboards, a corrective actions board, zone/site breakdowns, and analytics.
- Admins create user accounts directly (role + site assigned at setup), and can edit, deactivate, or reactivate them.
- Reassigning a report emails both the previous and new assignee.

## Tech stack

React + TypeScript + Vite, TanStack Router, Supabase (database, auth, storage, edge functions), shadcn/ui, Tailwind CSS, Recharts.


Supabase connection details are in `.env`. No further setup is needed to view the public report form; pages that require sign-in need a real staff account (see below).

## Getting a staff account

There's no self-serve signup. Ask an admin to create your account from the Users page inside the app they'll set your role, site, and a password you can sign in with at `/auth`.


- `src/integrations/supabase/` — Supabase client and types
- `supabase/migrations/` — database changes, applied in order
- `supabase/functions/` — edge functions (email notifications, account creation)
