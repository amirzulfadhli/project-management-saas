import type { CreateOrganizationInput } from "./types";

export const ORGANIZATION_NAME_MAX_LENGTH = 120;
export const ORGANIZATION_SLUG_MAX_LENGTH = 80;

const organizationSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface OrganizationFormValues {
  name: string;
  slug: string;
}

export interface OrganizationFormErrors {
  name?: string;
  slug?: string;
}

export function slugifyOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ORGANIZATION_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

export function validateOrganizationForm(values: OrganizationFormValues): {
  errors: OrganizationFormErrors;
  input?: CreateOrganizationInput;
} {
  const name = values.name.trim();
  const slug = values.slug.trim();
  const errors: OrganizationFormErrors = {};

  if (!name) {
    errors.name = "Organization name is required.";
  } else if (name.length > ORGANIZATION_NAME_MAX_LENGTH) {
    errors.name = "Organization name must be 120 characters or fewer.";
  }

  if (slug.length > ORGANIZATION_SLUG_MAX_LENGTH) {
    errors.slug = "Slug must be 80 characters or fewer.";
  } else if (slug && !organizationSlugPattern.test(slug)) {
    errors.slug =
      "Use lowercase letters or numbers separated by single hyphens.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    errors,
    input: {
      name,
      ...(slug ? { slug } : {}),
    },
  };
}
