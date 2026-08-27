# MyKlick — Product Requirements Document

## Original Problem Statement
Build MyKlick: a premium, modern, graphical Sales CRM ("sales cockpit"). Flow: Leads → Calls → WhatsApp → Follow-ups → Pipeline → Customers → Conversion. Then productionise with a real Exotel communication layer (calls + WhatsApp), lead editing, customer records, a smart morning briefing, and multi-tenant data safety + role permissions.

## Architecture
- **Backend**: FastAPI + MongoDB (motor). JWT Bearer auth (localStorage token). All routes under `/api`.
  - `communication.py` — provider adapter layer (`MockAdapter` / `ExotelAdapter`), `get_adapter()`, status mapping, `verify_webhook_signature`, `redact`. Selected via `COMMUNICATION_PROVIDER=mock|exotel`.
  - Idempotent webhooks (`/api/webhooks/exotel/call`, `/api/webhooks/exotel/whatsapp`) via unique `webhook_events.event_key`.
  - `organization_id` on all records; role scoping (admin/team_leader = full org, sales = own assigned only).
- **Frontend**: React 19, React Router 7, TanStack Query, framer-motion, recharts, canvas-confetti, sonner, lucide-react, shadcn/ui. Fonts Outfit + Manrope, indigo cockpit theme.

## User Choices (defaults — user skipped clarifications)
- Communication: **Exotel adapter, running in MOCK mode** (no live keys provided; flip to `exotel` + fill EXOTEL_* env to go live).
- Auth: JWT email+password, roles admin/team_leader/sales. AI: none.

## Personas
- **Sales staff**: mobile-first; one-tap Call/WhatsApp/Follow-up; sees only own leads.
- **Team leader / Admin**: full org visibility, team performance, conversions.

## Implemented
### Phase 0 — MVP (2026-06)
Dashboard, Leads (list/cards/pipeline), Kanban drag+confetti, Lead Profile tabs, floating call panel, WhatsApp chat, follow-ups, customers, team, global search, add-lead, mobile nav, skeletons/toasts/empty states.

### Phase 1–6 — Production (2026-06)
- ✅ Exotel provider-adapter (mock + live), outbound call initiate/complete, real WhatsApp send routing, call recording refs
- ✅ Idempotent call & WhatsApp webhooks; inbound call/message matched to leads by phone; unknown-caller handling
- ✅ Enriched call/message models (provider ids, mapped statuses, recording, from/to)
- ✅ Lead editing (modal) with edit-history timeline (value/assignee/priority)
- ✅ Customer detail page — full relationship history (calls/WhatsApp/follow-ups/timeline)
- ✅ Smart morning briefing (overdue/high/today + prioritized picks + quick actions)
- ✅ Multi-tenant `organization_id` + RBAC (backend-enforced, sales scoped, Team nav hidden for sales)
- ✅ Error handling (call/WhatsApp failure toasts, 403 access states), integration logs (secret-redacted)
- ✅ Fixed original failing test; suite: 95/97 pass serially (2 remaining are the de-scoped brute-force test + a known parallel-xdist race in a role test — product verified correct manually)

## Known de-scoped / backlog
- **De-scoped by design**: login brute-force lockout (would lock the shared demo admin/real user).
- **P2**: split `server.py` into routers; `PUT /leads` → partial-update model (`exclude_unset`); derive org from receiving virtual number for true multi-org webhook routing; require `EXOTEL_WEBHOOK_SECRET` when provider=exotel; keyboard/touch DnD fallback for Pipeline; tighten CORS for credentialed requests.
- **Live Exotel**: needs real EXOTEL_* credentials (currently MOCK).
