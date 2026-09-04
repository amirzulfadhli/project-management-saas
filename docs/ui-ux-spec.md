# FlowPlan — UI/UX & Design System Specification

> **Provenance:** This document is a verbatim extraction of the UI/UX and design-system requirements from `docs/engineering-plan.md` (Sections "Context", "Design System Application", "Technical Architecture — Frontend", "Design System Implementation", "Key Features Implementation", "Accessibility & Internationalization", "Technical Spikes", and relevant Phase descriptions). No requirements have been added or changed. It is intended to be readable standalone, without consulting the engineering plan.

---

## 1. Design Philosophy

The platform must be a minimalist, modern, elegant, and clean next-generation Project Management SaaS platform — inspired by Claude, Linear, Notion, GitHub Projects, and Raycast. The interface should feel like **Claude AI mixed with Linear and Notion**.

Guiding qualities:

- Minimalist, modern, elegant, clean
- Large whitespace
- Smooth animations
- Zero visual clutter
- Premium enterprise SaaS feel
- Fast workflow
- Keyboard-first
- AI-first
- Developer-first

---

## 2. Design Principles

1. Minimalist aesthetic with large whitespace and zero visual clutter.
2. Premium feel inspired by Claude, Linear, Notion, Apple, Stripe, Vercel.
3. Developer-first approach with keyboard navigation as the primary interaction method.
4. AI-first integration throughout the user experience.
5. Smooth animations (60 FPS target) using physics-based motion.
6. Every element must have a purpose — no decoration.
7. Reduce clicks for common operations.
8. Everything is searchable through global search and command palette.
9. Keyboard-first — every important action has a keyboard equivalent.
10. One primary action per page.
11. Progressive disclosure — show advanced information only when needed.
12. Context over navigation — prefer contextual panels, drawers, popovers.
13. Content before chrome — content visually dominates navigation and controls.
14. No dashboard theater — avoid meaningless charts, metrics, or decorative cards.
15. Calm visual hierarchy — use spacing, typography, and alignment before color.

---

## 3. Grid System & Layout

| Context | Grid / Layout |
|---|---|
| Desktop | 12-column grid, 1440px reference frame, max content width 1280px |
| Sidebar | 240px |
| Top navigation | 64px |
| Optional right panel | 360px |
| Laptop | Adapt the 1440px layout without excessive density |
| Tablet | 8-column grid with collapsible sidebar and contextual panels |
| Mobile | 4-column grid prioritizing content, primary action, navigation, controls |
| Ultra-wide | 1920px+ with appropriate scaling |

---

## 4. Spacing System (8px base)

| Token | Value |
|---|---|
| space-1 | 4px |
| space-2 | 8px |
| space-3 | 12px |
| space-4 | 16px |
| space-5 | 24px |
| space-6 | 32px |
| space-7 | 40px |
| space-8 | 48px |
| space-9 | 64px |
| space-10 | 96px |
| space-11 | 128px |

---

## 5. Typography

**Font family:** Inter (Variable), weights 400 Regular, 500 Medium, 600 Semibold, 700 Bold.

**Type scale (Section "Design System Implementation"):**

| Style | Size |
|---|---|
| Display | 40px |
| H1 | 32px |
| H2 | 24px |
| H3 | 20px |
| Body | 16px |
| Small | 14px |
| Caption | 12px |

- Line height: 1.5 for body text, optimized for readability.

> **Note (discrepancy in source):** The frontend architecture section separately lists an "Inter font family with defined scale (32px/24px/18px/15px/13px)". This secondary scale conflicts with the table above. The dedicated "Typography" specification above is treated as primary; both are recorded here for completeness.

---

## 6. Color System

### Light Mode

| Token | Value |
|---|---|
| Background | #FAFAFA |
| Surface | #FFFFFF |
| Primary Text | #111827 |
| Secondary Text | #6B7280 |
| Border | #E5E7EB |
| Hover | #F3F4F6 |
| Primary | #2563EB (blue) |
| Success | #16A34A (green) |
| Warning | #D97706 (amber) |
| Danger | #DC2626 (red) |
| Purple | #7C3AED |

### Dark Mode

| Token | Value |
|---|---|
| Background | #09090B |
| Surface | #18181B |
| Border | #27272A |
| Primary Text | #FAFAFA |
| Secondary Text | #A1A1AA |

> **Note:** The source re-defines only the five colors above for dark mode. Primary, Success, Warning, Danger, and Purple are not separately re-specified in the dark section.

### Semantic Tokens

Colors are consumed via semantic tokens: `color.background`, `color.surface`, `color.text-primary`, etc. Never reference raw hex values directly in components.

---

## 7. Border Radius

| Token | Value | Use |
|---|---|---|
| radius-sm | 8px | Compact controls |
| radius-md | 12px | Normal interactive elements (default) |
| radius-lg | 16px | Larger surfaces |
| radius-xl | 20px | Dialogs and major overlays |

The consistent default border radius is 12px (radius-md).

---

## 8. Elevation & Shadows

Shadow/elevation tokens are listed as part of the design-token architecture but **no explicit elevation values are specified** in the source. (See §9.)

---

## 9. Design Token Architecture

The design system is defined as a token architecture covering:

- **Semantic tokens** — colors, spacing, typography, radius, shadows, opacity.
- **Grid tokens** — columns, breakpoints, container widths.
- **z-index layers** — dropdowns, modals, drawers, toast notifications.
- **Transition tokens** — duration (100–400ms), easing (cubic-bezier curves).
- **Icon sizes** — consistent sizing for the Lucide-style icon system.
- **Motion** — physics-based animations with short durations.

---

## 10. Dark Mode / Theming

- Implemented via `next-themes` with CSS variables.
- Automatic system preference detection.
- Design variables support Light/Dark theme switching without redesign.

---

## 11. Components

- Built on **shadcn/ui** primitives, extensively customized to match FlowPlan's minimalist, premium aesthetic.
- Component library follows **atomic design**: primitives → components → patterns → screens.
- Component variants are defined by six dimensions: **Size, Variant, State, Theme, Density, Responsive behavior**.
- Designed in Figma using **Auto Layout, Components, Variants, Constraints, and Responsive resizing**.
- Design variables enable light/dark switching without redesign.

*(Foundational UI primitives to build first: buttons, inputs, avatars, icons.)*

---

## 12. Icons

- Consistent lightweight icon system, **Lucide-style**.
- Accessible labels required for all icon-only controls.

---

## 13. Focus States

- WCAG AA-compliant focus indicators for keyboard navigation.

---

## 14. Motion & Micro-interactions

- Animations use **physics-based motion** via Motion (Framer Motion), targeting 60 FPS.
- Motion duration scale:

  | Type | Duration |
  |---|---|
  | Micro | 100–150ms |
  | Standard | 150–250ms |
  | Modal | 200–300ms |

- Respects `prefers-reduced-motion`.

*(Beyond duration presets, no granular micro-interaction specifications are provided in the source.)*

---

## 15. States

- Core components must define **loading states, empty states, and error states**.
- "State" is also one of the six component-variant dimensions (§11).

---

## 16. Command Palette / Command Bar

- Global command palette invoked via **Ctrl+K**.
- Comprehensive keyboard shortcuts, with every important action having a keyboard equivalent.
- Global search integrates into the command palette (fuzzy matching, filters, recent searches).

---

## 17. Screens

The application comprises the following screens (enumerated across the engineering plan and the project status checklist):

- Application shell (sidebar + top navigation)
- Dashboard — minimalist, focused on current work, assigned tasks, upcoming deadlines, and relevant AI insights (no "dashboard theater")
- Projects
- Kanban board
- Task detail
- Calendar
- Timeline
- Wiki / Docs
- Settings (organization, team, billing, API keys, integrations, audit logs)
- Analytics dashboard (burndown charts, velocity tracking, cumulative flow diagrams, AI insights)

*(The source defines detailed requirements only for Kanban and Task detail; see below.)*

---

## 18. Kanban Board

- Virtualized lists with drag-and-drop.
- Column-based task management with status columns: **Backlog, To Do, In Progress, Review, Testing, Done**.
- Advanced features (Phase 2): WIP limits, swimlanes, assignee avatars, column collapsing.

---

## 19. Task Detail

- Foundation for a **rich markdown editor**, a **metadata panel**, and **comments**.
- Includes threaded comments with mentions (`/@`), reactions, and AI-assisted replies.

---

## 20. AI Features (UX)

AI is first-class throughout the interface:

- **Task generation** from descriptions (hierarchical breakdown: epics → stories → tasks).
- **Effort estimation** and dependency detection with suggested ordering.
- **Summarization**: PR summaries, commit summaries, meeting notes, daily stand-up summaries.
- **Blocker detection** from task descriptions and comments.
- **Assistance**: deadline suggestions, completion estimation, sprint planning, documentation generation, risk assessment.

---

## 21. Accessibility (WCAG AA minimum, prefer AAA)

- Keyboard-navigable interface with logical tab order.
- ARIA labels and roles for all interactive components.
- Screen-reader compatible with proper heading structure.
- Focus-visible indicators meeting contrast requirements.
- Alternative text for all meaningful images.
- Form validation with accessible error messages.
- Skip-navigation links and landmark regions.
- Never rely on color alone to communicate state.
- Responsive design that respects user preferences.

---

## 22. Responsive Behavior

- Desktop: 12-column grid / 1440px reference frame.
- Laptop: adapt without excessive density.
- Tablet: 8-column grid, collapsible sidebar, contextual panels.
- Mobile: 4-column grid; touch-friendly interactions; prioritize content, primary action, navigation, controls.
- Ultra-wide: 1920px+ scaling.

---

## 23. Internationalization

- i18n-ready architecture for future language support.
- Date/time, number, and currency formatting respect the user locale.
- Right-to-left (RTL) layout preparation.
- Culturally neutral design elements.

---

## 24. Frontend Technology (for implementation)

| Concern | Tool |
|---|---|
| Framework | Next.js (App Router) + React 19 |
| Styling | Tailwind CSS v4 with the custom design system |
| UI primitives | shadcn/ui (customized) |
| Icons | Lucide |
| Animation | Motion (Framer Motion) |
| State management | Zustand |
| Data fetching | TanStack Query |
| Forms | React Hook Form + Zod |
| Theming | next-themes |
| Typography | Inter Variable |

---

## 25. Developer Handoff

- Design is maintained as a Figma file with Auto Layout, Components, Variants, Constraints, and Responsive resizing.
- Design variables are used for Light/Dark theme switching.
- Phase 5 includes "designer handoff", design-system showcase, and ongoing "Figma file maintenance" as deliverables.

---

## 26. Design-Related Technical Spikes (forward-looking)

The plan recommends the following design-focused spikes before full implementation:

- **Design System Spike** — implement core tokens (spacing, radius, color, typography); build foundational primitives; test theme switching.
- **Accessibility Spike** — WCAG AA keyboard navigation, screen-reader compatibility, focus management.
- **Motion Design Spike** — physics-based animations, performance, `prefers-reduced-motion` support.
- **Component Library Spike** — reusable components following atomic design; test variants and composition.
- **Responsive Layout Spike** — responsive grid system, breakpoints, layout adaptations across device sizes.