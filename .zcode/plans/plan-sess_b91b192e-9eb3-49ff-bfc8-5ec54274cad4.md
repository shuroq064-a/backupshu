## Plan: Replace MiniCalendar with an Ark UI Calendar

### What we're doing
Replace the hand-rolled `MiniCalendar` in `frontend/app/dashboard/client/bookings/page.tsx` (lines 551-629) with a proper **Ark UI (`@ark-ui/react`) calendar** component, styled to match the project's teal/glass design theme.

### Steps

**1. Install dependencies**
```bash
cd frontend
npm install @ark-ui/react
```
(Ark UI calendar uses `@ark-ui/react/date-picker` — no extra date libs needed since it handles dates internally. Also no `clsx`/`tailwind-merge` needed since the project doesn't use `cn()` anywhere — we'll use plain `template literals` for className joining like the existing codebase does.)

**2. Create `frontend/lib/utils.ts`** — add a simple `cn()` helper (the Ark UI component code uses it), using a minimal approach without extra dependencies:
```ts
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
```

**3. Create `frontend/components/ui/calendar.tsx`** — The full Ark UI calendar component from the user's pasted code, with styling customized to match the project's teal theme:
- Replace generic accent colors with `primary` (#00535b) and `primary-container` (#006d77)
- Use `rounded-xl` / `rounded-2xl` to match existing border-radius patterns
- Use glassmorphism-inspired card styling consistent with the bookings page
- Keep booking-day highlighting logic (dots for days with scheduled bookings)
- Add month navigation support

**4. Update `frontend/app/dashboard/client/bookings/page.tsx`**
- Replace the `MiniCalendar` function (lines 551-629) with the new component
- Wire it to show booking dots on the calendar days
- Keep the same card wrapper styling (`rounded-3xl`, `shadow-sm`, `border-outline-variant`)

### Files changed
1. `frontend/lib/utils.ts` — **NEW** (cn utility)
2. `frontend/components/ui/calendar.tsx` — **NEW** (Ark UI calendar)
3. `frontend/app/dashboard/client/bookings/page.tsx` — **MODIFY** (replace MiniCalendar usage)
4. `frontend/package.json` — **MODIFY** (new dep `@ark-ui/react`)

### Design style
The calendar will use the existing project palette:
- **Primary teal** (#00535b) for selected dates, navigation icons
- **Surface containers** for hover/focus states
- **Rounded-xl cells** matching the existing card design
- **Glass card wrapper** matching the sidebar cards
- Booking dots in teal for scheduled days, today marker in primary