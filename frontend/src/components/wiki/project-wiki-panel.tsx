"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { authClient } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { WikiPageSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { useWikiDrafts } from "./wiki-drafts";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const CONTENT_LIMIT = 96 * 1024;

export function ProjectWikiPanel(props: {
  projectId: string;
  canAdminister: boolean;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const drafts = useWikiDrafts();
  const recentDraftKey = [...drafts.keys()]
    .reverse()
    .find((key) => key.startsWith(props.projectId + ":"));
  const recentId = recentDraftKey?.slice(props.projectId.length + 1);
  const requestedId =
    params.get("page") || (recentId && recentId !== "index" ? recentId : null);
  const explicitId = params.get("page");
  useEffect(() => {
    if (!explicitId && requestedId)
      router.replace(
        `/projects/${encodeURIComponent(props.projectId)}/docs?page=${encodeURIComponent(requestedId)}`,
        { scroll: false },
      );
  }, [explicitId, requestedId, props.projectId, router]);
  return (
    <WikiPageWorkspace
      key={`${props.projectId}:${requestedId ?? "index"}`}
      {...props}
      requestedId={requestedId}
    />
  );
}

function WikiPageWorkspace({
  projectId,
  canAdminister,
  requestedId,
}: {
  projectId: string;
  canAdminister: boolean;
  requestedId: string | null;
}) {
  const router = useRouter();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const pageHref = (id: string) =>
    `/projects/${encodeURIComponent(projectId)}/docs?page=${encodeURIComponent(id)}`;
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const listKey = queryKeys.wikiPages(projectId, userId);
  const drafts = useWikiDrafts();
  const draftKey = `${projectId}:${requestedId ?? "index"}`;
  const savedDraft = drafts.get(draftKey);
  const [selectedId, setSelectedId] = useState<string | null>(
    savedDraft?.selectedId ?? requestedId,
  );
  const [mode, setMode] = useState<"view" | "edit" | "create">(
    savedDraft?.mode ?? "view",
  );
  const [createParentId, setCreateParentId] = useState<string | null>(
    savedDraft?.createParentId ?? null,
  );
  const [title, setTitle] = useState(savedDraft?.title ?? "");
  const [content, setContent] = useState(savedDraft?.content ?? "");
  const [error, setError] = useState<string | null>(null);

  const pagesQuery = useQuery({
    queryKey: listKey,
    queryFn: () => api.getWikiPages(projectId),
    enabled: true,
  });
  const pages = useMemo(() => pagesQuery.data ?? [], [pagesQuery.data]);
  // Never retarget an editing draft to another page when its original disappears.
  const activePageId = selectedId ?? pages[0]?.id ?? null;
  useEffect(() => {
    if (!requestedId && activePageId && mode === "view")
      router.replace(
        `/projects/${encodeURIComponent(projectId)}/docs?page=${encodeURIComponent(activePageId)}`,
        { scroll: false },
      );
  }, [requestedId, activePageId, mode, projectId, router]);
  const selectedSummary =
    pages.find((page) => page.id === activePageId) ?? null;
  const pageQuery = useQuery({
    queryKey: queryKeys.wikiPage(projectId, activePageId ?? "none", userId),
    queryFn: () => api.getWikiPage(projectId, activePageId!),
    enabled: Boolean(activePageId) && mode !== "create",
  });

  const dirty =
    mode === "create"
      ? Boolean(title || content)
      : mode === "edit" &&
        Boolean(
          (savedDraft?.dirty && !pageQuery.data) ||
          (pageQuery.data &&
            (title !== pageQuery.data.title ||
              content !== pageQuery.data.content)),
        );
  const confirmDiscard = () =>
    !dirty || window.confirm("Discard your unsaved documentation changes?");
  useEffect(() => {
    if (mode === "view") drafts.delete(draftKey);
    else
      drafts.set(draftKey, {
        selectedId: activePageId,
        mode,
        createParentId,
        title,
        content,
        dirty,
      });
  }, [
    drafts,
    draftKey,
    activePageId,
    mode,
    createParentId,
    title,
    content,
    dirty,
  ]);
  const selectPage = (id: string) => {
    if (mutationPending) return;
    if (!confirmDiscard()) return;
    setMode("view");
    setError(null);
    setSelectedId(id);
    drafts.delete(draftKey);
    router.push(pageHref(id), { scroll: false });
  };
  const refresh = async (pageId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey, exact: true }),
      ...(pageId
        ? [
            queryClient.invalidateQueries({
              queryKey: queryKeys.wikiPage(projectId, pageId, userId),
              exact: true,
            }),
          ]
        : []),
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectActivities(projectId),
        exact: true,
      }),
    ]);
  };

  const create = useMutation({
    mutationFn: () =>
      api.createWikiPage(projectId, {
        title: title.trim(),
        content,
        parentId: createParentId,
      }),
    onSuccess: async (page) => {
      drafts.delete(draftKey);
      setMode("view");
      setSelectedId(page.id);
      if (mounted.current) router.replace(pageHref(page.id), { scroll: false });
      setError(null);
      await refresh(page.id);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const update = useMutation({
    mutationFn: () =>
      api.updateWikiPage(projectId, activePageId!, {
        title: title.trim(),
        content,
      }),
    onSuccess: async (page) => {
      drafts.delete(draftKey);
      queryClient.setQueryData(
        queryKeys.wikiPage(projectId, page.id, userId),
        page,
      );
      setMode("view");
      setError(null);
      await refresh(page.id);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteWikiPage(projectId, activePageId!),
    onSuccess: async () => {
      drafts.delete(draftKey);
      setSelectedId(null);
      if (mounted.current)
        router.replace(`/projects/${projectId}/docs`, { scroll: false });
      setMode("view");
      setError(null);
      await refresh();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const move = useMutation({
    mutationFn: (parentId: string | null) => {
      const targetIndex = pages.filter(
        (page) => page.parentId === parentId && page.id !== activePageId,
      ).length;
      return api.moveWikiPage(projectId, activePageId!, {
        parentId,
        targetIndex,
      });
    },
    onSuccess: async (page) => {
      setError(null);
      await refresh(page.id);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const tree = useMemo(() => buildTree(pages), [pages]);
  const mutationPending =
    create.isPending || update.isPending || remove.isPending || move.isPending;
  const canDelete =
    Boolean(selectedSummary) &&
    (canAdminister || selectedSummary?.createdById === userId);

  const denied =
    pagesQuery.error instanceof ApiError &&
    [401, 403, 404].includes(pagesQuery.error.status);
  if (denied)
    return (
      <ErrorState
        message={errorMessage(pagesQuery.error)}
        onRetry={() => pagesQuery.refetch()}
      />
    );
  return (
    <section aria-label="Project documentation">
      {mode !== "view" && dirty ? (
        <p role="status" className="mb-3 text-sm text-text-secondary">
          Unsaved draft. It stays available during navigation in this session.
          Save or cancel before leaving FlowPlan.
        </p>
      ) : null}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
        <details open className="min-w-0">
          <summary className="control-target cursor-pointer text-sm font-medium">
            Document navigation
          </summary>
          <aside className="flex min-h-0 flex-col border-r border-border pr-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Pages
              </p>
              <Button
                size="sm"
                disabled={mutationPending}
                onClick={() => {
                  if (!confirmDiscard()) return;
                  setCreateParentId(null);
                  setTitle("");
                  setContent("");
                  setError(null);
                  setMode("create");
                }}
              >
                New
              </Button>
            </div>
            <div className="min-h-0 overflow-y-auto">
              {pagesQuery.isPending ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : pagesQuery.isError ? (
                <ErrorState
                  message={errorMessage(pagesQuery.error)}
                  onRetry={() => pagesQuery.refetch()}
                />
              ) : pages.length === 0 ? (
                <p className="py-6 text-center text-sm text-text-secondary">
                  No pages yet.
                </p>
              ) : (
                <WikiTree
                  nodes={tree}
                  selectedId={activePageId}
                  onSelect={selectPage}
                />
              )}
            </div>
          </aside>
        </details>

        <div className="min-w-0">
          {error ? (
            <p
              role="alert"
              className="mb-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}
          {mode === "create" ? (
            <WikiEditor
              heading={createParentId ? "New child page" : "New page"}
              title={title}
              content={content}
              pending={create.isPending}
              onTitle={setTitle}
              onContent={setContent}
              onCancel={() => {
                if (confirmDiscard()) setMode("view");
              }}
              onSave={() => create.mutate()}
            />
          ) : !activePageId ? (
            <EmptyState
              title="Project documentation"
              description="Create a Markdown page for durable Project knowledge."
            />
          ) : pageQuery.isPending ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : pageQuery.isError || !pageQuery.data ? (
            <ErrorState
              message={errorMessage(pageQuery.error)}
              onRetry={() => pageQuery.refetch()}
            />
          ) : mode === "edit" ? (
            <WikiEditor
              heading="Edit page"
              title={title}
              content={content}
              pending={update.isPending}
              onTitle={setTitle}
              onContent={setContent}
              onCancel={() => {
                if (confirmDiscard()) setMode("view");
              }}
              onSave={() => update.mutate()}
            />
          ) : (
            <article>
              <div className="mb-5 flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <h3 className="break-words text-xl font-semibold text-text-primary">
                    {pageQuery.data.title}
                  </h3>
                  <p className="mt-1 text-xs text-text-secondary">
                    Updated{" "}
                    {new Date(pageQuery.data.updatedAt).toLocaleString()} ·
                    Created by {pageQuery.data.creator.name}
                  </p>
                  <a
                    className="text-xs text-primary hover:underline"
                    href={pageHref(pageQuery.data.id)}
                  >
                    Page link
                  </a>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={mutationPending}
                    onClick={() => {
                      setCreateParentId(pageQuery.data.id);
                      setTitle("");
                      setContent("");
                      setMode("create");
                    }}
                  >
                    Add child
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={mutationPending}
                    onClick={() => {
                      setTitle(pageQuery.data.title);
                      setContent(pageQuery.data.content);
                      setSelectedId(pageQuery.data.id);
                      setMode("edit");
                    }}
                  >
                    Edit
                  </Button>
                  {canDelete ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={mutationPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete "${pageQuery.data.title}"? Pages with children cannot be deleted.`,
                          )
                        )
                          remove.mutate();
                      }}
                    >
                      {remove.isPending ? "Deleting..." : "Delete"}
                    </Button>
                  ) : null}
                </div>
              </div>
              <label className="mb-5 block max-w-sm text-xs font-medium text-text-secondary">
                Parent page
                <select
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  value={pageQuery.data.parentId ?? ""}
                  disabled={mutationPending}
                  onChange={(event) => move.mutate(event.target.value || null)}
                >
                  <option value="">Top level</option>
                  {pages
                    .filter((page) => page.id !== activePageId)
                    .map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.title}
                      </option>
                    ))}
                </select>
              </label>
              {pageQuery.data.content ? (
                <Markdown content={pageQuery.data.content} />
              ) : (
                <p className="text-sm text-text-secondary">
                  This page is empty. Select Edit to add Markdown.
                </p>
              )}
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

function WikiEditor({
  heading,
  title,
  content,
  pending,
  onTitle,
  onContent,
  onCancel,
  onSave,
}: {
  heading: string;
  title: string;
  content: string;
  pending: boolean;
  onTitle(value: string): void;
  onContent(value: string): void;
  onCancel(): void;
  onSave(): void;
}) {
  const valid =
    Boolean(title.trim()) &&
    title.trim().length <= 200 &&
    content.length <= CONTENT_LIMIT;
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold text-text-primary">{heading}</h3>
      <div>
        <label
          htmlFor="wiki-title"
          className="mb-1 block text-sm font-medium text-text-primary"
        >
          Title
        </label>
        <Input
          id="wiki-title"
          value={title}
          disabled={pending}
          maxLength={200}
          onChange={(event) => onTitle(event.target.value)}
        />
      </div>
      <div>
        <div className="mb-1 flex justify-between gap-2">
          <label
            htmlFor="wiki-content"
            className="text-sm font-medium text-text-primary"
          >
            Markdown
          </label>
          <span className="text-xs text-text-secondary">
            {content.length.toLocaleString()} / {CONTENT_LIMIT.toLocaleString()}
          </span>
        </div>
        <Textarea
          id="wiki-content"
          value={content}
          disabled={pending}
          rows={18}
          maxLength={CONTENT_LIMIT}
          className="font-mono text-sm"
          onChange={(event) => onContent(event.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={!valid || pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
    </section>
  );
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="space-y-3 break-words text-sm leading-7 text-text-primary [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-hover [&_code]:px-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-hover [&_pre]:p-3 [&_table]:block [&_table]:overflow-x-auto [&_ul]:list-disc">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safeUrl}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ alt }) => (
            <span className="text-text-secondary">
              [Image: {alt || "blocked external image"}]
            </span>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function safeUrl(url: string): string {
  if (url.startsWith("/") || url.startsWith("#")) return url;
  const transformed = defaultUrlTransform(url);
  return /^(https?:|mailto:)/i.test(transformed) ? transformed : "";
}

interface TreeNode extends WikiPageSummary {
  children: TreeNode[];
}
function buildTree(pages: WikiPageSummary[]): TreeNode[] {
  const nodes = new Map(
    pages.map((page) => [page.id, { ...page, children: [] as TreeNode[] }]),
  );
  const roots: TreeNode[] = [];
  for (const page of pages) {
    const node = nodes.get(page.id)!;
    const parent = page.parentId ? nodes.get(page.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: TreeNode[]) => {
    items.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

function WikiTree({
  nodes,
  selectedId,
  onSelect,
  depth = 0,
}: {
  nodes: TreeNode[];
  selectedId: string | null;
  onSelect(id: string): void;
  depth?: number;
}) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            aria-current={selectedId === node.id ? "page" : undefined}
            className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${selectedId === node.id ? "bg-primary/10 font-medium text-primary" : "text-text-secondary hover:bg-hover hover:text-text-primary"}`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            title={node.title}
          >
            {node.title}
          </button>
          {node.children.length ? (
            <WikiTree
              nodes={node.children}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "The documentation request failed.";
  if (error.status === 401)
    return "Your session has expired. Please sign in again.";
  if (error.status === 403)
    return "You do not have access to this Project documentation.";
  if (error.status === 404)
    return "The Project or documentation page no longer exists.";
  return error.message;
}
