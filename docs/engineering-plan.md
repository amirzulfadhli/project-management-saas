# Project Management SaaS Platform Plan

## Context
The user wants to design and architect a complete next-generation Project Management SaaS platform inspired by Claude, Linear, Notion, GitHub Projects, and Raycast. The design philosophy must be minimalist, modern, elegant, clean, with large whitespace, smooth animations, zero visual clutter, premium enterprise SaaS, fast workflow, keyboard-first, AI-first, and developer-first. The interface should feel like Claude AI mixed with Linear and Notion.

## Current Understanding
Based on exploration of the user's environment:
- The user has various existing projects (predictive-ml, system-web, amir-portfolio, api dashboard)
- No existing Next.js project for project management was found
- The user has experience with Astro (amir-portfolio), FastAPI (api dashboard), and various other technologies
- The user appears to be a full-stack developer with DevOps and AI interests

## Phase 1: Initial Understanding - Explore Agents Findings
Launched 3 Explore agents to research:
1. Existing project management patterns and UI components
2. Authentication patterns and third-party integrations (OAuth, GitHub, Google)
3. AI integration patterns and real-time collaboration patterns

Agents completed and produced the following findings:

**Project Management Patterns (from free-claude-code):**
- MessageNode structure representing tasks with states: PENDING, IN_PROGRESS, COMPLETED, ERROR
- MessageTree managing collections of tasks with queue and atomic operations
- Hierarchical task relationships via parent_id/children_ids
- Explicit state machine for task workflow
- Claim system for task assignment (one active claim per tree)
- Snapshot/persistence mechanisms for backup and recovery
- Event-driven architecture with queue-based processing

**Authentication & Integration Patterns:**
- OAuth 2.0 flows (device authorization and browser-based PKCE) for connected accounts
- API key management via environment variables for configuration-based auth
- JWT token handling for identity claims extraction
- Secure credential storage with filesystem permissions (0o600) and file locking
- Provider abstraction layer supporting multiple LLM services (OpenAI, Anthropic, Gemini, etc.)
- Third-party integrations: GitHub Models API, Google Vertex AI, Azure OpenAI, AWS Bedrock
- Session management with ConversationSnapshot and ManagedMessageLog types
- Thread-safe storage with RLock and debounced JSON persistence

**AI & Real-time Collaboration Patterns:**
- Provider abstraction layer with BaseProvider and provider-specific implementations
- Anthropic protocol implementation with message format conversion and tool use handling
- Real-time streaming with SSE and aggregation functions
- Prompt and tool engineering: heuristic tool parsers, thinking tags, tool choice resolution
- Reasoning policies interface with multiple reasoning makers across providers
- Messaging workflow system with real-time platform integration (Discord/Telegram)
- Conversation tree architecture with immutable message trees and reply-based threading
- Event-driven real-time processing with async/await patterns and background task management
- Platform abstraction for real-time communication with outbox pattern for reliable delivery

## Phase 2: Design - Implementation Approach
Based on Explore agents findings and user requirements, the implementation approach incorporates:

**Architecture Decisions Informed by Agents:**
- **Task/Data Model:** Adopt MessageNode/MessageTree pattern from free-claude-code for core task management, with explicit state machine (PENDING/IN_PROGRESS/COMPLETED/ERROR) and hierarchical relationships
- **Authentication:** Implement provider abstraction layer supporting OAuth 2.0 (GitHub/Google) and API key auth, with secure storage patterns (file permissions, locking)
- **AI Integration:** Build on Anthropic protocol implementation patterns with provider abstraction, SSE streaming, and tool use handling
- **Real-time Collaboration:** Use messaging workflow and conversation tree patterns for real-time updates, presence indicators, and threaded discussions
- **Persistence:** Implement snapshot/persistence mechanisms for backup, audit trails, and offline capability

**Tech Stack Implementation:**
- **Frontend:** Next.js 15 App Router with React 19, Tailwind CSS v4, shadcn/ui, Motion, Zustand, TanStack Query
- **Backend:** NestJS with modular architecture, Prisma ORM, Redis caching, Socket.io for real-time, BullMQ for job queues
- **Database:** PostgreSQL with Prisma schema incorporating findings from agent research
- **Authentication:** Better Auth with GitHub OAuth, Google OAuth, and email/password fallback
- **Storage:** Supabase Storage for file attachments
- **Deployment:** Docker containers with Coolify orchestration

**Design System Application (Enhanced with Detailed UI/UX Specification):**
- Implement 8px spacing system with tokens: space-1 (4px) through space-11 (128px)
- Implement consistent 12px border radius (radius-md) with variants: radius-sm (8px), radius-lg (16px), radius-xl (20px)
- Apply Inter Variable font family with weights: 400 Regular, 500 Medium, 600 Semibold, 700 Bold
- Apply specified color palette with light/dark modes and semantic color tokens
- Implement design token architecture mapping to CSS variables and Tailwind tokens
- Use shadcn/ui as base but customize extensively to match FlowPlan's minimalist, premium aesthetic
- Implement smooth animations with Motion (Framer Motion) targeting 60 FPS using physics-based motion
- Ensure WCAG AA accessibility with proper focus rings, ARIA labels, and keyboard navigation
- Implement content-first design philosophy with progressive disclosure and contextual panels
- Design for keyboard-first workflows with global command palette (Ctrl+K) and comprehensive shortcuts
- Create component library following atomic design principles (primitives → components → patterns → screens)

**Key Features Implementation:**
- **Kanban Board:** Virtualized lists with drag-and-drop, column-based task management (Backlog, To Do, In Progress, Review, Testing, Done)
- **AI Features:** Task generation from descriptions, PR/commit summarization, sprint planning, blocker detection, deadline suggestions, completion estimation
- **GitHub Integration:** Webhook-based synchronization with issue/task linking, branch/PR tracking, commit intelligence, deployment status
- **Real-time:** Presence indicators, typing indicators, live updates via Socket.io, optimistic UI updates with server reconciliation
- **Collaboration:** Threaded comments with mentions/reactions, activity feeds, notifications, presence indicators
- **Wiki/Docs:** Collaborative document editing with rich markdown support, version history, access controls
- **Time Tracking:** Manual and automatic time logging with reporting and analytics
- **Dashboard:** Minimalist interface focusing on current work, assigned tasks, upcoming deadlines, and relevant AI insights
- **Search:** Global search with fuzzy matching, filters, recent searches, and command palette integration
- **Settings:** Comprehensive organization, team, billing, and API key management with audit logs

**Performance Optimizations:**
- Code splitting and route prefetching in Next.js
- Virtualization for large lists (kanban columns, activity feeds, comment threads)
- Multi-layer caching (Redis for HTTP, in-memory for hot data)
- Database indexing and query optimization with read replicas for analytics
- Connection pooling for database, Redis, external APIs
- Optimistic UI updates with server reconciliation and conflict resolution
- Image optimization (automatic resizing, WebP conversion, lazy loading) and CDN delivery
- Asset optimization (CSS/JS minification, Brotli compression)
- Layout shift minimization and efficient rendering practices

**Security Measures:**
- JWT tokens with short lifespans and refresh token rotation
- Role-based access control (RBAC) with fine-grained permissions (organization, team, project levels)
- Input validation and sanitization on all endpoints using Zod
- CSRF protection for state-changing operations
- XSS prevention through proper output encoding
- Dependency scanning and automated updates
- Rate limiting and DDoS protection at infrastructure and application levels
- Audit logging for administrative and data access actions
- Encryption at rest for sensitive data (API tokens, webhook secrets) and in transit (TLS 1.3)
- Session hijacking protection through IP/user-agent tracking
- Secure credential storage with encryption and access controls

## Phase 3: Review
[This section will be populated after reviewing plans]

## Phase 4: Final Plan

### Comprehensive Implementation Plan for Next-Generation Project Management SaaS Platform

#### 1. Executive Summary
Build a minimalist, AI-first project management SaaS platform that combines the calm, intelligent interface of Claude with the efficiency of Linear and the flexibility of Notion. Leverages user's existing expertise in modern web technologies, real-time systems, and AI/ML to create a premium developer-first experience.

#### 2. Technical Architecture

**Frontend (Client):**
- **Framework:** Next.js 15 with React 19 (App Router) for optimal performance and SEO
- **Styling:** Tailwind CSS v4 with custom design system (8px spacing, 12px border radius)
- **UI Components:** shadcn/ui primitives customized to match design specifications
- **Icons:** Lucide Icons for consistent, lightweight visual language
- **Animations:** Motion (Framer Motion) for smooth, physics-based transitions
- **State Management:** Zustand for lightweight, scalable state handling
- **Data Fetching:** TanStack Query for intelligent caching and background updates
- **Forms:** React Hook Form with Zod validation for type-safe form handling
- **Theming:** next-themes for seamless light/dark mode with system preference detection
- **Typography:** Inter font family with defined scale (32px/24px/18px/15px/13px)

**Backend (Server):**
- **Framework:** NestJS for modular, enterprise-grade architecture
- **ORM:** Prisma ORM with PostgreSQL for type-safe database access
- **Caching:** Redis for session storage, rate limiting, and frequently accessed data
- **Real-time:** Socket.io for instant collaboration features (live updates, presence, typing indicators)
- **Job Queue:** BullMQ for background processing (AI tasks, notifications, webhooks)
- **Authentication:** Better Auth with GitHub OAuth and Google OAuth providers
- **Storage:** Supabase Storage for file attachments (chosen for integrated auth and CDN)
- **Deployment:** Docker containers orchestrated via Coolify with GitHub Actions CI/CD

**Infrastructure:**
- **Database:** PostgreSQL with Prisma schema (detailed in section 4)
- **Cache:** Redis instance for sessions and caching
- **Object Storage:** Supabase Storage buckets for attachments, avatars, etc.
- **Environment:** Docker-compose for local development, production-optimized Dockerfiles
- **Monitoring:** Health check endpoints, error tracking, performance metrics

#### 3. Design System Implementation

**Core Principles:**
- Minimalist aesthetic with large whitespace and zero visual clutter
- Premium feel inspired by Claude, Linear, Notion, Apple, Stripe, Vercel
- Developer-first approach with keyboard navigation as primary interaction method
- AI-first integration throughout the user experience
- Smooth animations (60 FPS target) using physics-based motion
- Every element must have a purpose - no decoration
- Reduce clicks for common operations
- Everything is searchable through global search and command palette
- Keyboard first - every important action has keyboard equivalent
- One primary action per page
- Progressive disclosure - show advanced information only when needed
- Context over navigation - prefer contextual panels, drawers, popovers
- Content before chrome - content visually dominates navigation and controls
- No dashboard theater - avoid meaningless charts, metrics or decorative cards
- Calm visual hierarchy - use spacing, typography and alignment before color

**Specifications:**
- **Grid System:**
  - Desktop: 12-column grid, 1440px reference frame, max content width 1280px
  - Sidebar: 240px, Top navigation: 64px, Optional right panel: 360px
  - Laptop: Adapt 1440px layout without excessive density
  - Tablet: 8-column grid with collapsible sidebar and contextual panels
  - Mobile: 4-column grid prioritizing content, primary action, navigation, controls
  - Ultra-wide: 1920px+ with appropriate scaling

- **Spacing System (8px base):**
  - space-1 = 4px, space-2 = 8px, space-3 = 12px, space-4 = 16px
  - space-5 = 24px, space-6 = 32px, space-7 = 40px, space-8 = 48px
  - space-9 = 64px, space-10 = 96px, space-11 = 128px

- **Border Radius:**
  - radius-sm = 8px (compact controls)
  - radius-md = 12px (normal interactive elements)
  - radius-lg = 16px (larger surfaces)
  - radius-xl = 20px (dialogs and major overlays)

- **Typography (Inter Variable):**
  - Display = 40px, H1 = 32px, H2 = 24px, H3 = 20px
  - Body = 16px, Small = 14px, Caption = 12px
  - Weights: 400 Regular, 500 Medium, 600 Semibold, 700 Bold
  - Line height: 1.5 for body text, optimized for readability

- **Color System:**
  - **Light Mode:**
    - Background: #FAFAFA
    - Surface: #FFFFFF
    - Primary Text: #111827
    - Secondary Text: #6B7280
    - Border: #E5E7EB
    - Hover: #F3F4F6
    - Primary: #2563EB (blue)
    - Success: #16A34A (green)
    - Warning: #D97706 (amber)
    - Danger: #DC2626 (red)
    - Purple: #7C3AED
  - **Dark Mode:**
    - Background: #09090B
    - Surface: #18181B
    - Border: #27272A
    - Primary Text: #FAFAFA
    - Secondary Text: #A1A1AA
  - Semantic tokens: color.background, color.surface, color.text-primary, etc.

- **Design Token Architecture:**
  - Semantic tokens for colors, spacing, typography, radius, shadows, opacity
  - Grid tokens: columns, breakpoints, container widths
  - z-index layers: dropdowns, modals, drawers, toast notifications
  - Transition tokens: duration (100-400ms), easing (cubic-bezier curves)
  - Icon sizes: consistent sizing for Lucide-style icon system
  - Motion: physics-based animations with short durations

- **Components:**
  - Custom shadcn/ui base extensively modified to match FlowPlan specifications
  - Component library following atomic design: primitives → components → patterns → screens
  - Component variants defined by Size, Variant, State, Theme, Density, Responsive behavior
  - Auto Layout, Components, Variants, Constraints, Responsive resizing in Figma
  - Design variables for Light/Dark theme switching without redesign

- **Accessibility (WCAG AA minimum, prefer AAA):**
  - Keyboard navigable interface with logical tab order
  - ARIA labels and roles for all interactive components
  - Screen reader compatible with proper heading structure
  - Focus visible indicators meeting contrast requirements
  - Alternative text for all meaningful images
  - Form validation with accessible error messages
  - Skip navigation links and landmark regions
  - Never rely on color alone to communicate state

- **Dark Mode:** Implemented via next-themes with CSS variables, automatic system preference detection
- **Focus Rings:** WCAG AA compliant focus indicators for keyboard navigation
- **Icons:** Consistent lightweight icon system (Lucide-style) with accessible labels for icon-only controls
- **Motion Design:** Short durations (micro: 100-150ms, standard: 150-250ms, modal: 200-300ms), respects prefers-reduced-motion

#### 4. Database Schema (Prisma)

**Core Models:**
```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  name          String
  image         String?
  password      String?  // For email/password fallback
  role          String   @default("member")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  Session       Session[]
  OrganizationMember[]
  TeamMember[]
  ProjectMember[]
  ApiToken      ApiToken[]
  Notification  Notification[]
}

model Organization {
  id            String   @id @default(uuid())
  name          String
  slug          String   @unique
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  Owner         User     @relation("OrganizationOwner", fields: [ownerId], references: [id])
  ownerId       String
  Members       OrganizationMember[]
  Projects      Project[]
  ApiToken      ApiToken[]
}

model OrganizationMember {
  id            String   @id @default(uuid())
  role          String   @default("member") // owner, admin, member
  Organization  Organization @relation(fields: [organizationId], references: [id])
  organizationId String
  User          User     @relation(fields: [userId], references: [id])
  userId        String
  @@unique([organizationId, userId])
}

model Team {
  id            String   @id @default(uuid())
  name          String
  Organization  Organization @relation(fields: [organizationId], references: [id])
  organizationId String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  Members       TeamMember[]
  Projects      Project[]
}

model TeamMember {
  id            String   @id @default(uuid())
  role          String   @default("member") // lead, member
  Team          Team     @relation(fields: [teamId], references: [id])
  teamId        String
  User          User     @relation(fields: [userId], references: [id])
  userId        String
  @@unique([teamId, userId])
}

model Project {
  id            String   @id @default(uuid())
  name          String
  description   String?
  Organization  Organization @relation(fields: [organizationId], references: [id])
  organizationId String
  Team?         Team     @relation("ProjectTeams", fields: [teamId], references: [id])
  teamId        String?
  ProjectMember ProjectMember[]
  Board         Board?
  Columns       Column[]
  Task          Task[]
  Wiki          Wiki?
  Files         File[]
  Repository    Repository?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  archivedAt    DateTime?
}

model ProjectMember {
  id            String   @id @default(uuid())
  role          String   @default("member") // owner, admin, member
  Project       Project  @relation(fields: [projectId], references: [id])
  projectId     String
  User          User     @relation(fields: [userId], references: [id])
  userId        String
  @@unique([projectId, userId])
}

model Board {
  id            String   @id @default(uuid())
  name          String   @default("Main Board")
  Project       Project  @relation(fields: [projectId], references: [id])
  projectId     String
  Column        Column[]
  @@unique([projectId])
}

model Column {
  id            String   @id @default(uuid())
  name          String
  // Backlog, To Do, In Progress, Review, Testing, Done
  projectId     String   @default("backlog") 
  Project       Project  @relation(fields: [projectId], references: [id])
  position      Int      @default(0)
  Task          Task[]
  @@unique([projectId, position])
}

model Task {
  id            String   @id @default(uuid())
  title         String
  description   String?  // Rich text/markdown
  Column        Column   @relation(fields: [columnId], references: [id])
  columnId      String
  Project       Project  @relation(fields: [projectId], references: [id])
  projectId     String
  Assignee      User?    @relation("TaskAssignee", fields: [assigneeId], references: [id])
  assigneeId    String?
  Reporter      User     @relation("TaskReporter", fields: [reporterId], references: [id])
  reporterId    String
  Priority      Int      @default(1) // 1=low, 2=medium, 3=high, 4=urgent
  Status        String   @default("todo") // Will be derived from column
  DueDate       DateTime?
  EstimatedTime Int?     // In minutes
  ActualTime    Int?     // In minutes
  StartDate     DateTime?
  CompletedAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  Subtask       Subtask[]
  Comment       Comment[]
  Activity      Activity[]
  TimeLog       TimeLog[]
  File          File[]
  ChecklistItem ChecklistItem[]
  // GitHub integration fields
  githubIssueId String?
  githubIssueNumber Int?
  githubBranch  String?
  githubPrNumbers String[] // Array of PR numbers
  deploymentStatus String? // pending, success, failed, deploying
}

model Subtask {
  id            String   @id @default(uuid())
  title         String
  completed     Boolean  @default(false)
  Task          Task     @relation(fields: [taskId], references: [id])
  taskId        String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Comment {
  id            String   @id @default(uuid())
  content       String   // Rich text/markdown
  Task          Task     @relation(fields: [taskId], references: [id])
  taskId        String
  Author        User     @relation(fields: [authorId], references: [id])
  authorId      String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  // For threading/replies
  parentId      String?  // Self-referential for threaded comments
  Comment       Comment? @relation("CommentReplies", fields: [parentId], references: [id])
  Replies       Comment[] @relation("CommentReplies")
}

model Activity {
  id            String   @id @default(uuid())
  type          String   // created, updated, deleted, assigned, commented, etc.
  description   String
  Task          Task?    @relation(fields: [taskId], references: [id])
  taskId        String?
  Project       Project? @relation(fields: [projectId], references: [id])
  projectId     String?
  User          User     @relation(fields: [userId], references: [id])
  userId        String
  createdAt     DateTime @default(now())
}

model Notification {
  id            String   @id @default(uuid())
  type          String   // mention, assignment, deadline, comment, etc.
  title         String
  message       String
  isRead        Boolean  @default(false)
  User          User     @relation(fields: [userId], references: [id])
  userId        String
  EntityId      String?  // polymorphic reference to task, project, etc.
  EntityType    String?  // "task", "project", "comment"
  createdAt     DateTime @default(now())
}

model File {
  id            String   @id @default(uuid())
  name          String
  url           String   // Storage URL
  mimeType      String
  size          Int      // bytes
  Task          Task?    @relation(fields: [taskId], references: [id])
  taskId        String?
  Project       Project? @relation(fields: [projectId], references: [id])
  projectId     String?
  User          User     @relation(fields: [uploadedById], references: [id])
  uploadedById  String
  createdAt     DateTime @default(now())
}

model Wiki {
  id            String   @id @default(uuid())
  title         String
  content       String?  // Rich text/markdown
  Project       Project  @relation(fields: [projectId], references: [id])
  projectId     String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Repository {
  id            String   @id @default(uuid())
  name          String
  fullName      String   // owner/repo format
  provider      String   // github
  url           String
  Project       Project? @relation(fields: [projectId], references: [id])
  projectId     String?
  Webhook       Webhook? @relation(fields: [webhookId], references: [id])
  webhookId     String?
  Issue         Issue[]
  Branch        Branch[]
  PullRequest   PullRequest[]
}

model Issue {
  id            String   @id @default(uuid())
  number        Int
  title         String
  body          String?
  state         String   // open, closed
  url           String
  Repository    Repository @relation(fields: [repositoryId], references: [id])
  repositoryId  String
  Task          Task?    @relation(fields: [taskId], references: [id])
  taskId        String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  closedAt      DateTime?
}

model Branch {
  id            String   @id @default(uuid())
  name          String
  Repository    Repository @relation(fields: [repositoryId], references: [id])
  repositoryId  String
  Task          Task?    @relation(fields: [taskId], references: [id])
  taskId        String?
  createdAt     DateTime @default(now())
}

model PullRequest {
  id            String   @id @default(uuid())
  number        Int
  title         String
  body          String?
  state         String   // open, closed, merged
  url           String
  Repository    Repository @relation(fields: [repositoryId], references: [id])
  repositoryId  String
  // Linked tasks (many-to-many)
  Task          Task[]   @relation("PullRequestTasks")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  mergedAt      DateTime?
}

model ApiToken {
  id            String   @id @default(uuid())
  name          String
  token         String   @unique
  User          User     @relation(fields: [userId], references: [id])
  userId        String
  Organization? Organization @relation(fields: [organizationId], references: [id])
  organizationId String?
  expiresAt     DateTime?
  lastUsedAt    DateTime?
  createdAt     DateTime @default(now())
}

model Session {
  id            String   @id @default(uuid())
  sessionToken  String   @unique
  userId        String
  User          User     @relation(fields: [userId], references: [id])
  expires       DateTime
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model TimeLog {
  id            String   @id @default(uuid())
  Task          Task     @relation(fields: [taskId], references: [id])
  taskId        String
  User          User     @relation(fields: [userId], references: [id])
  userId        String
  startTime     DateTime
  endTime       DateTime?
  duration      Int?     // In minutes, calculated if endTime present
  description   String?
  createdAt     DateTime @default(now())
}

model ChecklistItem {
  id            String   @id @default(uuid())
  title         String
  completed     Boolean  @default(false)
  Task          Task     @relation(fields: [taskId], references: [id])
  taskId        String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Webhook {
  id            String   @id @default(uuid())
  url           String
  secret        String
  Repository    Repository @relation(fields: [repositoryId], references: [id])
  repositoryId  String
  createdAt     DateTime @default(now())
}
```

#### 5. API Architecture (NestJS)

**Module Structure:**
- `auth.module.ts` - Authentication strategies (GitHub, Google, email/password)
- `users.module.ts` - User management, profiles, settings
- `organizations.module.ts` - Org creation, membership, billing
- `teams.module.ts` - Team structures within organizations
- `projects.module.ts` - Project lifecycle, archiving, duplication
- `tasks.module.ts` - Task CRUD, filtering, search, bulk operations
- `columns.module.ts` - Kanban board management
- `comments.module.ts` - Commenting system with threading
- `activity.module.ts` - Activity feed generation
- `notifications.module.ts` - Real-time notifications
- `files.module.ts` - File upload/download management
- `wiki.module.ts` - Collaborative document editing
- `github.module.ts` - GitHub integration (webhooks, API sync)
- `ai.module.ts` - AI feature endpoints (task generation, summarization, etc.)
- `websocket.gateway.ts` - Real-time collaboration socket handling
- `webhook.controller.ts` - Inbound webhook processing

**Key Services:**
- `AuthService` - JWT token management, OAuth flows, session handling
- `ProjectService` - Project lifecycle with optimistic updates
- `TaskService` - Task operations with real-time broadcasting
- `ColumnService` - Kanban board management with drag-and-drop
- `NotificationService` - Real-time notification delivery
- `GitHubService` - Repository synchronization, webhook processing
- `AIService` - LLM integration for intelligent features
- `WebSocketGateway` - Presence indicators, live cursor, collaborative editing
- `FileService` - Upload processing, virus scanning, thumbnail generation
- `ActivityService` - Automatic activity logging from domain events

**DTO Validation:**
- All API endpoints use Zod-based validation through custom pipes
- Input sanitization to prevent XSS and injection attacks
- Rate limiting per endpoint based on user tier and authentication
- Pagination and filtering standards across all list endpoints

**Real-time Features:**
- WebSocket gateway handles:
  - Presence indicators (online/away/offline users)
  - Typing indicators in comments and documents
  - Live cursor positions in collaborative editing
  - Real-time task updates (moving between columns, assignment changes)
  - Notification delivery
  - Activity feed updates
- Optimistic UI updates with server reconciliation
- Conflict resolution for simultaneous edits

#### 6. GitHub Integration Deep Dive

**Connection Flow:**
1. User connects GitHub repository via OAuth
2. System stores encrypted access token with minimal required scopes
3. Webhook registered for push, pull_request, issues events
4. Initial sync imports existing issues as tasks
5. Ongoing synchronization keeps both systems in sync

**Automated Features:**
- **Issue ↔ Task Sync:**
  - New GitHub issue → Create task in "Backlog" column
  - Issue label changes → Sync to task labels
  - Issue assignee changes → Update task assignee
  - Issue state change (open/closed) → Update task status
  - Task status change (to "Done") → Optional automatic issue closing

- **Branch & PR Integration:**
  - New branch created from issue → Link to task
  - Pull request opened → Auto-link to related tasks
  - PR review status → Visual indicators in task UI
  - PR merged → Update task deployment status
  - Branch deleted → Cleanup links

- **Commit Intelligence:**
  - Commit messages scanned for issue references (#123)
  - Automatic task status updates based on commit patterns
  - Code analysis for AI-generated commit summaries
  - Deployment detection via common workflow filenames

- **Webhook Security:**
  - Signature verification for all incoming webhooks
  - Rate limiting and retry mechanisms
  - Dead letter queue for failed webhook processing
  - Audit trail of all webhook events

#### 7. AI-First Features Implementation

**Task Generation:**
- Natural language processing to convert project descriptions into structured tasks
- Hierarchical breakdown (epics → stories → tasks)
- Effort estimation based on historical data and task complexity
- Dependency detection and suggerred ordering
- Integration with project templates for common workflows

**Summarization:**
- **PR Summarization:** AI analyzes code changes to generate plain-language summaries
- **Commit Summarization:** Groups related commits into meaningful narratives
- **Meeting Notes:** Transcribes and summarizes voice/video meetings (when integrated)
- **Daily Stand-up:** Generates personalized stand-up summaries from user activity
- **Blocker Detection:** Identifies potential blockers from task descriptions and comments

**Intelligent Assistance:**
- **Deadline Suggestions:** Based on task complexity, team velocity, and dependencies
- **Completion Estimation:** Uses historical data to predict task completion dates
- **Sprint Planning:** Recommends optimal task distribution based on team capacity
- **Documentation Generation:** Creates technical documentation from code and task descriptions
- **Risk Assessment:** Identifies high-risk tasks based on historical failure patterns

**Implementation Approach:**
- Microservice AI service using specialized models for different tasks
- Prompt engineering pipelines with context retrieval (RAG)
- Caching of AI responses to reduce latency and cost
- Human-in-the-loop review for critical AI-generated content
- Usage tracking and cost optimization strategies

#### 8. Performance Optimization Strategy

**Frontend Optimizations:**
- **Code Splitting:** Route-based splitting with prefetching of likely next routes
- **Virtualization:** Windowing for large lists (kanban columns, activity feeds)
- **Image Optimization:** Automatic resizing, WebP conversion, lazy loading
- **Asset Optimization:** CSS/JS minification, Brotli compression, CDN delivery
- **Rendering Optimizations:** React.memo, useMemo, useCallback where beneficial
- **Prefetching:** Link prefetching for navigation, data prefetching for expected actions

**Backend Optimizations:**
- **Database:** Proper indexing, query optimization, connection pooling
- **Caching:** Multi-layer caching (Redis for HTTP, in-memory for hot data)
- **Database Read Replicas:** For analytics and reporting queries
- **Async Processing:** BullMQ for non-critical background work
- **Connection Pooling:** Database, Redis, external API connections
- **Rate Limiting:** Token bucket algorithm with user-tier-based limits

**Infrastructure Optimizations:**
- **Edge Computing:** CDN for static assets, edge functions for lightweight processing
- **Database Connection Pooling:** Optimized for concurrent workloads
- **Redis Clustering:** For high availability and performance
- **Object Storage CDN:** For fast asset delivery globally
- **Health Checks:** Comprehensive monitoring of all system components

**Performance Targets:**
- <100ms for critical interactions (task creation, column moves)
- <50ms for UI updates from WebSocket events
- 60 FPS animations for all transitions
- Lighthouse score >95 in Performance, Accessibility, Best Practices, SEO
- 99.9% uptime SLA with comprehensive monitoring

#### 9. Security & Privacy

**Authentication & Authorization:**
- Better Auth with PKCE for OAuth flows
- JWT tokens with short lifespans and refresh token rotation
- Role-based access control (RBAC) with fine-grained permissions
- Organization-level data isolation
- API token management with scoped permissions
- Session hijacking protection through IP/user-agent tracking

**Data Protection:**
- Encryption at rest for sensitive data (API tokens, webhook secrets)
- Encryption in transit (TLS 1.3 for all communications)
- Regular automated backups with point-in-time recovery
- GDPR/CCPA compliance features (data export, deletion)
- Audit logging for all administrative and data access actions

**Application Security:**
- Input validation and sanitization on all endpoints
- CSRF protection for state-changing operations
- XSS prevention through proper output encoding
- Dependency scanning and automated updates
- Regular penetration testing and security audits
- Rate limiting and DDoS protection at infrastructure level

**Privacy Features:**
- Data minimization principles in data collection
- Clear privacy policy and terms of service
- User consent for data processing activities
- Data portability and deletion capabilities
- Anonymous usage analytics opt-out

#### 10. Deployment & DevOps

**Development Environment:**
- Docker compose for local development with all services
- Pre-commit hooks for code quality and formatting
- Automated testing in CI pipeline
- Feature flags for gradual rollout
- Local AI model options for offline development

**CI/CD Pipeline:**
- GitHub Actions for automated testing, building, and deployment
- Multi-stage Docker builds for minimal production images
- Blue-green deployment strategy for zero-downtime releases
- Automated rollback on health check failures
- Performance regression testing in CI
- Security scanning (SAST/DAST) in pipeline

**Production Infrastructure:**
- Coolify for container orchestration and management
- Container registry for image storage and versioning
- Load balancing and SSL termination at edge
- Database clustering for high availability
- Redis clustering for session storage and caching
- Object storage redundancy across regions
- Monitoring stack (Prometheus, Grafana, ELK)
- Log aggregation and alerting
- SSL certificate automation (Let's Encrypt)

**Scaling Strategy:**
- Horizontal pod autoscaling based on CPU/memory usage
- Database read replica scaling for analytics workloads
- Redis clustering for cache scaling
- Microservice-based architecture for independent scaling
- CDN for static asset delivery and DDoS mitigation

#### 11. Accessibility & Internationalization

**Accessibility (WCAG AA):**
- Keyboard navigable interface with logical tab order
- ARIA labels and roles for all interactive components
- Screen reader compatible with proper heading structure
- Focus visible indicators meeting contrast requirements
- Alternative text for all meaningful images
- Form validation with accessible error messages
- Responsive design that respects user preferences
- Skip navigation links and landmark regions

**Internationalization:**
- i18n framework ready for future language support
- Date/time formatting respecting user locale
- Number and currency formatting localization
- Right-to-left (RTL) layout preparation
- Culturally neutral design elements
- Documentation and support materials localization readiness

#### 12. Phased Implementation Roadmap

**Phase 1: Core Foundation (Weeks 1-4)**
- Project setup with monorepo structure (frontend/, backend/, docs/)
- Design System Foundations:
  - Implement 8px spacing system, 12px border radius, Inter Variable font family
  - Define color palette with light/dark modes and semantic tokens
  - Create design token architecture mapping to CSS/Tailwind
  - Establish grid system for desktop/laptop/tablet/mobile/ultra-wide
  - Build foundational UI primitives (buttons, inputs, avatars, icons)
  - Implement Motion/Framer Motion for physics-based animations
  - Set up WCAG AA accessibility foundation (focus rings, ARIA, keyboard nav)
  - Create light/dark theme switching with system preference detection
- Authentication system: Better Auth with GitHub OAuth, Google OAuth, email/password
- Core data models: User, Organization, Project, Task based on agent-researched patterns
- Basic project and task CRUD operations with validation
- Simple Kanban board implementation with drag-and-drop (using MessageTree patterns)
- Basic UI layout with design system implementation
- Initial database schema with Prisma and PostgreSQL
- Basic real-time framework setup with Socket.io
- Health check endpoints and basic monitoring
- Project structure and navigation foundations (sidebar, top nav, command palette)

**Phase 2: Collaboration & Integration (Weeks 5-8)**
- Advanced Kanban features: WIP limits, swimlanes, assignee avatars, column collapsing
- Commenting system: rich markdown, mentions (/@), threading, reactions, AI-assisted replies
- Activity feed: automatic logging of domain events (task created, updated, commented, assigned)
- Notification system: real-time delivery via WebSocket, email fallback, preferences
- GitHub integration: webhook handling, issue ↔ task synchronization, branch/PR linking
- File attachment handling: upload/download, virus scanning, thumbnail generation, access controls
- WebSocket implementation: presence indicators, typing indicators, live cursor positions, reconnection handling
- Basic search: full-text search with filtering by status, assignee, labels, dates, saved views
- Organization and team management: creation, membership, role-based access control, invitations
- Project settings: basic configuration, member management, integrations
- Task detail view: foundation for rich markdown editor, metadata panel, comments
- Loading states, empty states, error states for core components
- Basic AI integration framework for future features

**Phase 3: AI Features & Advanced Functionality (Weeks 9-12)**
- AI-powered task generation: natural language to structured tasks with hierarchy and estimates
- PR and commit summarization: AI analysis of code changes for plain-language summaries
- Sprint planning: capacity-based task allocation with velocity tracking and confidence scoring
- Deadline suggestions: ML-based estimation using historical data and task complexity
- Advanced GitHub integration: branch creation from tasks, PR linking, deployment status tracking
- Wiki/document collaboration: real-time collaborative editing with conflict resolution, version history
- Time tracking: manual logging and automatic detection from work sessions, reporting analytics
- Advanced search: saved views, filters, search across projects/tasks/documents/GitHub, command palette integration
- Analytics dashboard: burndown charts, velocity tracking, cumulative flow diagrams, AI insights
- File management: folder structure, version history, access controls, storage optimization
- Settings center: organization, team, billing, API keys, integrations, audit logs
- Mobile responsiveness: optimization across device sizes, touch-friendly interactions
- Performance optimization: achieve <100ms critical interactions, 60 FPS animations
- Accessibility audit: WCAG AA compliance testing and fixes, screen reader testing
- Animation refinement: motion design using physics-based animations (Motion/Framer Motion)

**Phase 4: Optimization & Polish (Weeks 13-16)**
- Security audit: penetration testing, dependency scanning, automated fixes
- Beta testing: closed beta with user feedback incorporation and iteration
- Documentation: user guides, API documentation, onboarding flows, tutorial videos, design system docs
- Performance monitoring: real-user monitoring, error tracking, performance budgets, Lighthouse >95
- Localization foundation: i18n framework ready for future language support
- Advanced AI features: daily stand-up summaries, meeting summaries, risk detection, prioritization suggestions
- Refinement of all UI components based on user feedback and usability testing
- Accessibility enhancements: AAA compliance where possible, user testing with assistive technologies
- Performance optimizations: bundle analysis, lazy loading, code splitting refinement
- Internationalization: date/time/number formatting, RTL layout preparation
- Offline mode foundation: local data queuing, synchronization indicators
- Advanced keyboard shortcuts: power-user workflows, customizable shortcuts
- Contextual help and tooltips throughout the interface

**Phase 5: Launch & Scale (Weeks 17-20)**
- Production deployment: Coolify orchestration with health checks and auto-scaling
- Load testing: validate performance targets under concurrent user load (10k+ users)
- Final security review: compliance verification, penetration testing sign-off, SOC 2 readiness
- Marketing materials: website, demo videos, case studies, blog content, design system showcase
- Launch preparation: beta to public transition, support documentation, training materials, designer handoff
- User training: onboarding sequences, video tutorials, knowledge base articles, webinars
- Ongoing development: feature backlog management, regular release cycle planning, community feedback
- Maintenance planning: monitoring alerts, incident response procedures, SLA definitions, status page
- Design system evolution: component library updates, pattern documentation, Figma file maintenance
- Continuous improvement: A/B testing framework, analytics integration, user feedback loops

#### 13. Technical Spikes & Prototyping Recommendations

Before full implementation, recommend these technical spikes:

1. **Authentication Spike (2-3 days):** Test GitHub OAuth flow with Better Auth, secure token storage, refresh token rotation
2. **Real-time Collaboration Spike (3-4 days):** Implement Socket.io with presence indicators, typing indicators, and optimistic updates for task movement
3. **AI Integration Spike (2-3 days):** Test Anthropic API integration with streaming responses and tool use for task generation
4. **Database Performance Spike (2 days):** Test Prisma queries with indexing strategies for large task lists
5. **Webhook Security Spike (2 days):** Implement GitHub webhook signature verification and retry mechanisms
6. **Virtualization Spike (2-3 days):** Test windowing libraries (react-window, @tanstack/virtual) for large kanban columns and activity feeds
7. **Logging & Monitoring Spike (2 days):** Implement structured logging, metrics collection, and health check endpoints
8. **Design System Spike (3-4 days):** Implement core design tokens (spacing, radius, color, typography), build foundational UI primitives, test theme switching
9. **Accessibility Spike (2-3 days):** Implement WCAG AA keyboard navigation, screen reader compatibility, focus management, test with assistive technologies
10. **Motion Design Spike (2 days):** Implement physics-based animations with Motion/Framer Motion, test performance and prefers-reduced-motion support
11. **Component Library Spike (3 days):** Build reusable component library following atomic design principles, test variants and composition
12. **Responsive Layout Spike (2-3 days):** Implement responsive grid system, test breakpoints and layout adaptations across device sizes

These spikes will validate core assumptions and reduce implementation risk before full development begins.

#### 13. Open Questions for User Clarification

Before proceeding with implementation, I'd like to clarify:

1. **Deployment Preference:** You mentioned Coolify and Docker - are there any specific infrastructure constraints or preferences I should consider?

2. **AI Provider:** For the AI features, do you have a preference for specific LLM providers (OpenAI, Anthropic, open-source models) or should I design for provider agnosticism?

3. **Team Size Expectations:** What is the expected scale in terms of users/projects concurrently? This affects architecture decisions for scaling.

4. **Data Residency Requirements:** Are there any specific data residency or compliance requirements (GDPR, HIPAA, etc.) that need to be considered?

5. **Integration Priorities:** Beyond GitHub, are there other specific integrations that are high priority (GitLab, Jira, Slack, etc.)?

6. **Design Specific Preferences:** While you've provided a detailed design system, are there any specific references or inspirations beyond Claude, Linear, Notion that you'd like me to consider?

#### 14. Conclusion

This plan provides a comprehensive, research-backed blueprint for building a next-generation project management SaaS platform that embodies the minimalist, AI-first, developer-first principles you've outlined. The plan incorporates specific findings from the Explore agents who analyzed production patterns in the free-claude-code repository, ensuring we build on proven, battle-tested approaches rather than theoretical concepts.

By leveraging your existing expertise in modern web technologies (Astro/Tailwind), real-time systems (Rust/C++ WebSockets), and AI/ML (Python pipelines), combined with the specified tech stack (Next.js 15, NestJS, Prisma, etc.), architectural patterns discovered in agent research, and the detailed UI/UX specification provided in the FLOWPLAN document, we can create a platform that truly stands out in the market while maintaining the calm, productive feel you envision.

The implementation approach balances ambitious feature delivery with pragmatic execution, ensuring we can deliver value early while building toward the full vision. The phased approach includes technical spikes to validate critical assumptions before full implementation, reducing risk and ensuring we build on solid foundations. Regular checkpoints and user feedback integration will ensure we stay aligned with your expectations throughout development.

The UI/UX design incorporates FlowPlan's comprehensive design system with its 8px spacing, 12px border radius, Inter Variable typography, carefully curated color palette, and component-based architecture following atomic design principles. Every aspect of the interface adheres to the principles of minimalism, calm visual hierarchy, content-first design, keyboard-first workflows, and AI-native integration.

Next steps: Begin with the technical spikes outlined in Section 13 to validate core architectural decisions, then proceed with Phase 1 implementation starting with Design System Foundations.