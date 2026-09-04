"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  ORGANIZATION_SLUG_MAX_LENGTH,
  slugifyOrganizationName,
  validateOrganizationForm,
  type OrganizationFormErrors,
} from "@/lib/organization-validation";
import { queryKeys } from "@/lib/queries";
import type { Organization } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateOrganizationForm({
  onCreated,
}: {
  onCreated: (organization: Organization) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<OrganizationFormErrors>({});

  const createOrganization = useMutation({
    mutationFn: api.createOrganization,
    onSuccess: (organization) => {
      queryClient.setQueryData<Organization[]>(
        queryKeys.organizations,
        (current = []) =>
          current.some((item) => item.id === organization.id)
            ? current
            : [...current, organization],
      );
      queryClient.setQueryData(
        queryKeys.organization(organization.id),
        organization,
      );
      onCreated(organization);
    },
  });

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(slugifyOrganizationName(value));
    }
    if (fieldErrors.name) {
      setFieldErrors((current) => ({ ...current, name: undefined }));
    }
  }

  function handleSlugChange(value: string) {
    setSlugEdited(true);
    setSlug(value.toLowerCase());
    if (fieldErrors.slug) {
      setFieldErrors((current) => ({ ...current, slug: undefined }));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createOrganization.reset();

    const validation = validateOrganizationForm({ name, slug });
    setFieldErrors(validation.errors);
    if (!validation.input) return;

    createOrganization.mutate(validation.input);
  }

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <label
          className="block text-sm font-medium text-text-primary"
          htmlFor="organization-name"
        >
          Organization name
        </label>
        <Input
          id="organization-name"
          name="name"
          autoComplete="organization"
          autoFocus
          maxLength={ORGANIZATION_NAME_MAX_LENGTH}
          placeholder="Acme Studio"
          value={name}
          aria-describedby={
            fieldErrors.name ? "organization-name-error" : undefined
          }
          aria-invalid={Boolean(fieldErrors.name)}
          onChange={(event) => handleNameChange(event.target.value)}
        />
        {fieldErrors.name ? (
          <p
            id="organization-name-error"
            className="text-sm text-danger"
            role="alert"
          >
            {fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label
          className="block text-sm font-medium text-text-primary"
          htmlFor="organization-slug"
        >
          Workspace slug
        </label>
        <div className="flex items-center rounded-md border border-border bg-background focus-within:ring-2 focus-within:ring-primary">
          <span className="pl-3 text-sm text-text-secondary">flowplan/</span>
          <Input
            id="organization-slug"
            name="slug"
            className="border-0 pl-1 focus:ring-0"
            maxLength={ORGANIZATION_SLUG_MAX_LENGTH}
            placeholder="acme-studio"
            spellCheck={false}
            value={slug}
            aria-describedby={
              fieldErrors.slug
                ? "organization-slug-error"
                : "organization-slug-help"
            }
            aria-invalid={Boolean(fieldErrors.slug)}
            onChange={(event) => handleSlugChange(event.target.value)}
          />
        </div>
        {fieldErrors.slug ? (
          <p
            id="organization-slug-error"
            className="text-sm text-danger"
            role="alert"
          >
            {fieldErrors.slug}
          </p>
        ) : (
          <p
            id="organization-slug-help"
            className="text-xs text-text-secondary"
          >
            Lowercase letters and numbers, separated by single hyphens.
          </p>
        )}
      </div>

      {createOrganization.isError ? (
        <p
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {createOrganization.error instanceof ApiError
            ? createOrganization.error.message
            : "Unable to create the organization. Please try again."}
        </p>
      ) : null}

      <Button
        className="w-full"
        type="submit"
        disabled={createOrganization.isPending}
      >
        {createOrganization.isPending
          ? "Creating organization…"
          : "Create organization"}
      </Button>
    </form>
  );
}
