"use client";

import { useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { AttachmentItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_FILES = ".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv";

interface AttachmentsPanelProps {
  scope: "project" | "task";
  resourceId: string;
  projectId: string;
  currentUserId: string | null;
  canAdminister: boolean;
}

export function AttachmentsPanel({
  scope,
  resourceId,
  projectId,
  currentUserId,
  canAdminister,
}: AttachmentsPanelProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const queryKey =
    scope === "project"
      ? queryKeys.projectAttachments(resourceId, currentUserId)
      : queryKeys.taskAttachments(resourceId, currentUserId);

  const attachmentsQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      scope === "project"
        ? api.getProjectAttachments(resourceId, {
            cursor: pageParam,
            limit: 50,
          })
        : api.getTaskAttachments(resourceId, {
            cursor: pageParam,
            limit: 50,
          }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  const attachments = useMemo(() => {
    const unique = new Map<string, AttachmentItem>();
    for (const page of attachmentsQuery.data?.pages ?? []) {
      for (const attachment of page.items)
        unique.set(attachment.id, attachment);
    }
    return [...unique.values()];
  }, [attachmentsQuery.data]);

  const refreshRelated = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey, exact: true }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectActivities(projectId),
        exact: true,
      }),
    ]);
  };

  const upload = useMutation({
    mutationFn: (file: File) =>
      scope === "project"
        ? api.uploadProjectAttachment(resourceId, file)
        : api.uploadTaskAttachment(resourceId, file),
    onSuccess: async () => {
      setError(null);
      if (inputRef.current) inputRef.current.value = "";
      await refreshRelated();
    },
    onError: (uploadError: unknown) =>
      setError(messageFor(uploadError, "Upload failed.")),
  });

  const remove = useMutation({
    mutationFn: (attachment: AttachmentItem) =>
      scope === "project"
        ? api.deleteProjectAttachment(resourceId, attachment.id)
        : api.deleteTaskAttachment(resourceId, attachment.id),
    onSuccess: async () => {
      setError(null);
      await refreshRelated();
    },
    onError: (deleteError: unknown) =>
      setError(messageFor(deleteError, "Could not delete the attachment.")),
  });

  const download = useMutation({
    mutationFn: async (attachment: AttachmentItem) => ({
      attachment,
      blob:
        scope === "project"
          ? await api.downloadProjectAttachment(resourceId, attachment.id)
          : await api.downloadTaskAttachment(resourceId, attachment.id),
    }),
    onSuccess: ({ attachment, blob }) => {
      setError(null);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.originalName;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onError: (downloadError: unknown) =>
      setError(messageFor(downloadError, "Download failed.")),
  });

  const selectFile = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_SIZE) {
      setError("Files must be 10 MB or smaller.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    upload.mutate(file);
  };

  return (
    <section className="space-y-4" aria-label="Attachments">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Attachments
          </h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            PNG, JPG, WebP, PDF, TXT, or CSV up to 10 MB.
          </p>
        </div>
        <label className="control-target inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
          {upload.isPending ? "Uploading..." : "Upload file"}
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept={ACCEPTED_FILES}
            disabled={upload.isPending}
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
        </label>
      </div>

      {error ? (
        <p
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {attachmentsQuery.isPending ? (
        <div
          className="flex items-center justify-center gap-2 py-10 text-sm text-text-secondary"
          role="status"
        >
          <Spinner /> Loading attachments...
        </div>
      ) : attachmentsQuery.isError && attachments.length === 0 ? (
        <ErrorState
          message={messageFor(
            attachmentsQuery.error,
            "Failed to load attachments.",
          )}
          onRetry={() => attachmentsQuery.refetch()}
        />
      ) : attachments.length === 0 ? (
        <EmptyState
          title="No attachments yet"
          description="Upload a file to share it with Project collaborators."
        />
      ) : (
        <>
          <ul
            className="divide-y divide-border rounded-md border border-border"
            aria-label="Attachment list"
          >
            {attachments.map((attachment) => {
              const canDelete =
                canAdminister || attachment.uploaderId === currentUserId;
              const isDownloading =
                download.isPending && download.variables?.id === attachment.id;
              const isDeleting =
                remove.isPending && remove.variables?.id === attachment.id;
              return (
                <li
                  key={attachment.id}
                  className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium text-text-primary"
                      title={attachment.originalName}
                    >
                      {attachment.originalName}
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {formatBytes(attachment.sizeBytes)} ·{" "}
                      {attachment.uploader.name} ·{" "}
                      <time dateTime={attachment.createdAt}>
                        {formatTimestamp(attachment.createdAt)}
                      </time>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isDownloading}
                      onClick={() => download.mutate(attachment)}
                    >
                      {isDownloading ? "Downloading..." : "Download"}
                    </Button>
                    {canDelete ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isDeleting}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete "${attachment.originalName}"? This removes the stored file for all collaborators.`,
                            )
                          ) {
                            remove.mutate(attachment);
                          }
                        }}
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {attachmentsQuery.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                disabled={attachmentsQuery.isFetchingNextPage}
                onClick={() => attachmentsQuery.fetchNextPage()}
              >
                {attachmentsQuery.isFetchingNextPage
                  ? "Loading..."
                  : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function messageFor(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401)
    return "Your session has expired. Please sign in again.";
  if (error.status === 403)
    return "You do not have permission for this attachment.";
  if (error.status === 404)
    return "The attachment or its parent no longer exists.";
  if (error.status === 409) return error.message;
  if (error.status === 413) return "Files must be 10 MB or smaller.";
  return error.message || fallback;
}
