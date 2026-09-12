"use client";

import { taskDraftKey, useTaskField } from "./task-drafts";
import { useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { CommentItem, CommentPage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

type CommentsCache = InfiniteData<CommentPage, string | undefined>;

interface TaskCommentsProps {
  taskId: string;
  projectId: string;
  currentUserId: string | null;
  canModerate: boolean;
}

interface SaveCommentInput {
  commentId: string;
  content: string;
}

export function TaskComments({
  taskId,
  projectId,
  currentUserId,
  canModerate,
}: TaskCommentsProps) {
  const queryClient = useQueryClient();
  const commentsKey = queryKeys.taskComments(taskId);
  const draftPrefix = taskDraftKey(projectId, taskId) + ":comment:";
  const [content, setContent] = useTaskField<string>(
    draftPrefix + "content",
    "",
  );
  const [replyToId, setReplyToId] = useTaskField<string | null>(
    draftPrefix + "reply",
    null,
  );
  const [editingId, setEditingId] = useTaskField<string | null>(
    draftPrefix + "editing",
    null,
  );
  const [editContent, setEditContent] = useTaskField<string>(
    draftPrefix + "editContent",
    "",
  );
  const [mutationError, setMutationError] = useState<string | null>(null);

  const commentsQuery = useInfiniteQuery({
    queryKey: commentsKey,
    queryFn: ({ pageParam }) =>
      api.getTaskComments(taskId, { cursor: pageParam, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(taskId),
  });

  const comments = useMemo(() => {
    const unique = new Map<string, CommentItem>();
    for (const page of commentsQuery.data?.pages ?? []) {
      for (const comment of page.items) unique.set(comment.id, comment);
    }
    return [...unique.values()].sort(compareComments);
  }, [commentsQuery.data]);
  const commentsById = useMemo(
    () => new Map(comments.map((comment) => [comment.id, comment])),
    [comments],
  );
  const replyTarget = replyToId ? commentsById.get(replyToId) : undefined;
  const nextPageErrorMessage = commentErrorMessage(
    commentsQuery.error,
    "Could not load more Comments.",
  );

  const refreshActivity = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.projectActivities(projectId),
      exact: true,
    });

  const createComment = useMutation({
    mutationFn: (input: { content: string; parentId?: string }) =>
      api.createTaskComment(taskId, input),
    onSuccess: async (created) => {
      insertComment(queryClient, commentsKey, created);
      setContent("");
      setReplyToId(null);
      setMutationError(null);
      await refreshActivity();
    },
    onError: (error: unknown) =>
      setMutationError(commentErrorMessage(error, "Could not add Comment.")),
  });

  const updateComment = useMutation({
    mutationFn: ({ commentId, content }: SaveCommentInput) =>
      api.updateTaskComment(taskId, commentId, { content }),
    onSuccess: async (updated) => {
      replaceComment(queryClient, commentsKey, updated);
      setEditingId(null);
      setEditContent("");
      setMutationError(null);
      await refreshActivity();
    },
    onError: (error: unknown) =>
      setMutationError(commentErrorMessage(error, "Could not update Comment.")),
  });

  const deleteComment = useMutation({
    mutationFn: (comment: CommentItem) =>
      api.deleteTaskComment(taskId, comment.id),
    onSuccess: async (_result, deleted) => {
      replaceComment(queryClient, commentsKey, {
        ...deleted,
        content: null,
        deletedAt: new Date().toISOString(),
      });
      if (editingId === deleted.id) {
        setEditingId(null);
        setEditContent("");
      }
      setMutationError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: commentsKey, exact: true }),
        refreshActivity(),
      ]);
    },
    onError: (error: unknown) =>
      setMutationError(commentErrorMessage(error, "Could not delete Comment.")),
  });

  const mutationPending =
    createComment.isPending ||
    updateComment.isPending ||
    deleteComment.isPending;
  const trimmedContent = content.trim();

  const submitComment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmedContent || trimmedContent.length > 5000 || mutationPending) {
      return;
    }
    setMutationError(null);
    createComment.mutate({
      content: trimmedContent,
      ...(replyToId && { parentId: replyToId }),
    });
  };

  const confirmDelete = (comment: CommentItem) => {
    const confirmed = window.confirm(
      "Delete this Comment? Its text will be replaced by a deleted tombstone, and any replies will remain.",
    );
    if (!confirmed) return;
    setMutationError(null);
    deleteComment.mutate(comment);
  };

  if (commentsQuery.isPending) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-12 text-sm text-text-secondary"
        role="status"
      >
        <Spinner /> Loading Comments...
      </div>
    );
  }

  if (commentsQuery.isError && comments.length === 0) {
    return (
      <ErrorState
        message={commentErrorMessage(
          commentsQuery.error,
          "Could not load Comments.",
        )}
        onRetry={() => commentsQuery.refetch()}
      />
    );
  }

  return (
    <section aria-labelledby="task-comments-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3
            id="task-comments-heading"
            className="text-sm font-semibold text-text-primary"
          >
            Conversation
          </h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            Plain-text discussion for this Task.
          </p>
        </div>
        <span className="text-xs text-text-secondary">
          {comments.length} loaded
        </span>
      </div>

      {mutationError ? (
        <p
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {mutationError}
        </p>
      ) : null}

      <div className="min-w-0">
        {comments.length === 0 ? (
          <EmptyState
            title="No Comments yet"
            description="Start the conversation about this Task."
            className="py-8"
          />
        ) : (
          <ol className="space-y-3" aria-label="Task Comments">
            {comments.map((comment) => {
              const parent = comment.parentId
                ? commentsById.get(comment.parentId)
                : undefined;
              const isAuthor = comment.author.id === currentUserId;
              const canDelete = !comment.deletedAt && (isAuthor || canModerate);
              const isEditing = editingId === comment.id;
              const trimmedEdit = editContent.trim();

              return (
                <li
                  key={comment.id}
                  className={
                    comment.parentId
                      ? "ml-4 min-w-0 border-l border-border pl-3 sm:ml-8"
                      : "min-w-0"
                  }
                >
                  <article className="border-b border-border py-3">
                    {comment.parentId ? (
                      <p className="mb-2 truncate text-xs text-text-secondary">
                        Reply to {parent?.author.name ?? "an earlier Comment"}
                      </p>
                    ) : null}
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {comment.author.name}
                          {isAuthor ? (
                            <span className="ml-1 font-normal text-text-secondary">
                              (you)
                            </span>
                          ) : null}
                        </p>
                        <time
                          dateTime={comment.createdAt}
                          className="text-xs text-text-secondary"
                        >
                          {formatCommentTimestamp(comment.createdAt)}
                        </time>
                      </div>
                      {!comment.deletedAt ? (
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={mutationPending}
                            onClick={() => {
                              setReplyToId(comment.id);
                              setMutationError(null);
                            }}
                          >
                            Reply
                          </Button>
                          {isAuthor ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={mutationPending}
                              onClick={() => {
                                setEditingId(comment.id);
                                setEditContent(comment.content ?? "");
                                setMutationError(null);
                              }}
                            >
                              Edit
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger hover:text-danger"
                              disabled={mutationPending}
                              onClick={() => confirmDelete(comment)}
                            >
                              {deleteComment.isPending &&
                              deleteComment.variables?.id === comment.id
                                ? "Deleting..."
                                : "Delete"}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {isEditing ? (
                      <form
                        className="mt-3 space-y-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (
                            !trimmedEdit ||
                            trimmedEdit.length > 5000 ||
                            trimmedEdit === comment.content ||
                            mutationPending
                          ) {
                            return;
                          }
                          setMutationError(null);
                          updateComment.mutate({
                            commentId: comment.id,
                            content: trimmedEdit,
                          });
                        }}
                      >
                        <label
                          htmlFor={`edit-comment-${comment.id}`}
                          className="sr-only"
                        >
                          Edit Comment
                        </label>
                        <Textarea
                          id={`edit-comment-${comment.id}`}
                          autoFocus
                          rows={3}
                          maxLength={5000}
                          value={editContent}
                          disabled={mutationPending}
                          onChange={(event) =>
                            setEditContent(event.target.value)
                          }
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={mutationPending}
                            onClick={() => {
                              setEditingId(null);
                              setEditContent("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            type="submit"
                            disabled={
                              !trimmedEdit ||
                              trimmedEdit.length > 5000 ||
                              trimmedEdit === comment.content ||
                              mutationPending
                            }
                          >
                            {updateComment.isPending ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </form>
                    ) : comment.deletedAt ? (
                      <p className="mt-3 text-sm italic text-text-secondary">
                        This Comment was deleted.
                      </p>
                    ) : (
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">
                        {comment.content}
                      </p>
                    )}
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {commentsQuery.isFetchNextPageError ? (
        <p className="text-sm text-danger" role="alert">
          {nextPageErrorMessage}
        </p>
      ) : null}
      {commentsQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            disabled={commentsQuery.isFetchingNextPage}
            onClick={() => commentsQuery.fetchNextPage()}
          >
            {commentsQuery.isFetchingNextPage ? (
              <>
                <Spinner /> Loading more...
              </>
            ) : commentsQuery.isFetchNextPageError ? (
              "Retry"
            ) : (
              "Load more Comments"
            )}
          </Button>
        </div>
      ) : null}

      <form
        onSubmit={submitComment}
        className="space-y-2 border-t border-border pt-4"
      >
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="new-task-comment"
            className="text-sm font-medium text-text-primary"
          >
            {replyTarget
              ? `Reply to ${replyTarget.author.name}`
              : "Add Comment"}
          </label>
          <span className="text-xs text-text-secondary">
            {content.length}/5000
          </span>
        </div>
        {replyTarget ? (
          <div className="flex items-center justify-between gap-2 rounded-md bg-hover px-3 py-2 text-xs text-text-secondary">
            <span className="truncate">
              Replying to {replyTarget.author.name}
            </span>
            <button
              type="button"
              className="font-medium text-text-primary hover:underline"
              onClick={() => setReplyToId(null)}
            >
              Cancel reply
            </button>
          </div>
        ) : null}
        <Textarea
          id="new-task-comment"
          rows={3}
          maxLength={5000}
          placeholder="Write a plain-text Comment..."
          value={content}
          disabled={mutationPending}
          onChange={(event) => setContent(event.target.value)}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={
              !trimmedContent || trimmedContent.length > 5000 || mutationPending
            }
          >
            {createComment.isPending
              ? "Posting..."
              : replyTarget
                ? "Post reply"
                : "Post Comment"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function insertComment(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: ReturnType<typeof queryKeys.taskComments>,
  comment: CommentItem,
) {
  queryClient.setQueryData<CommentsCache>(queryKey, (current) => {
    if (!current) {
      return {
        pages: [{ items: [comment], nextCursor: null }],
        pageParams: [undefined],
      };
    }
    if (
      current.pages.some((page) =>
        page.items.some(({ id }) => id === comment.id),
      )
    ) {
      return current;
    }
    const pages = [...current.pages];
    const lastIndex = Math.max(0, pages.length - 1);
    pages[lastIndex] = {
      ...pages[lastIndex],
      items: [...(pages[lastIndex]?.items ?? []), comment],
    };
    return { ...current, pages };
  });
}

function replaceComment(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: ReturnType<typeof queryKeys.taskComments>,
  comment: CommentItem,
) {
  queryClient.setQueryData<CommentsCache>(queryKey, (current) =>
    current
      ? {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === comment.id ? comment : item,
            ),
          })),
        }
      : current,
  );
}

function compareComments(left: CommentItem, right: CommentItem): number {
  const byDate = left.createdAt.localeCompare(right.createdAt);
  return byDate || left.id.localeCompare(right.id);
}

function formatCommentTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function commentErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401)
    return "Your session has expired. Please sign in again.";
  if (error.status === 403)
    return "You do not have permission for this Comment.";
  if (error.status === 404)
    return "This Task or Comment is no longer available.";
  if (error.status === 409)
    return "This Comment changed and can no longer be edited.";
  return error.message || fallback;
}
