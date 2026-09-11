import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProjectsPage from "@/app/projects/page";
import { OrganizationProvider } from "@/components/organizations/organization-provider";
import { api } from "@/lib/api";
import {
  organization,
  projectFixture,
  projectSummary,
} from "./project-fixtures";
import type { Organization } from "@/lib/types";

let mockPath = "/projects";
let mockSearch = "";
const mockRouter = { replace: jest.fn() };
jest.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useSearchParams: () => new URLSearchParams(mockSearch),
  useRouter: () => mockRouter,
}));
jest.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "user-a" } } }) },
}));
jest.mock("@/components/projects/create-project-modal", () => ({
  CreateProjectModal: () => null,
}));
function setup(content = <ProjectsPage />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OrganizationProvider>{content}</OrganizationProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  mockPath = "/projects";
  mockSearch = "";
  localStorage.clear();
  jest
    .spyOn(api, "getOrganizations")
    .mockResolvedValue([organization] as unknown as Organization[]);
  jest
    .spyOn(api, "getOrganization")
    .mockResolvedValue(organization as unknown as Organization);
  jest.spyOn(api, "getProjects").mockResolvedValue([projectSummary]);
});
afterEach(() => jest.restoreAllMocks());
test.each([false, true])(
  "archive scope %s comes from URL and reaches the existing scoped API",
  async (archived) => {
    mockSearch = archived ? "view=archived" : "";
    jest
      .mocked(api.getProjects)
      .mockResolvedValue([
        { ...projectSummary, archivedAt: archived ? "2026-09-01" : null },
      ]);
    setup();
    await screen.findByRole("link", { name: /FlowPlan/ });
    expect(api.getProjects).toHaveBeenCalledWith("org-a", archived);
    const nav = within(
      screen.getByRole("navigation", { name: "Project archive view" }),
    );
    expect(
      nav
        .getByRole("link", { name: archived ? "Archived" : "Active" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      nav.getByRole("link", { name: "Archived" }).getAttribute("href"),
    ).toBe("/projects?view=archived");
  },
);
test("archived Project quick restore remains in owner actions", async () => {
  mockSearch = "view=archived";
  jest
    .mocked(api.getProjects)
    .mockResolvedValue([{ ...projectSummary, archivedAt: "2026-09-01" }]);
  jest.spyOn(api, "restoreProject").mockResolvedValue(projectFixture);
  setup();
  fireEvent.click(await screen.findByText("Actions"));
  fireEvent.click(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() =>
    expect(api.restoreProject).toHaveBeenCalledWith("project-a"),
  );
});
test("ordinary members do not receive Project administration actions", async () => {
  jest.mocked(api.getOrganization).mockResolvedValue({
    ...organization,
    members: [],
  } as unknown as Organization);
  jest
    .mocked(api.getProjects)
    .mockResolvedValue([{ ...projectSummary, projectMembers: [] }]);
  setup();
  await screen.findByRole("link", { name: /FlowPlan/ });
  expect(screen.queryByText("Actions")).toBeNull();
});
test("direct Project routes pass through when no Organization membership remains", async () => {
  mockPath = "/projects/project-a/docs";
  jest.mocked(api.getOrganizations).mockResolvedValue([]);
  setup(<p>Independently authorized Project workspace</p>);
  await screen.findByText("Independently authorized Project workspace");
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(api.getOrganization).not.toHaveBeenCalled();
});
test("ordinary onboarding still redirects accounts with no Organizations", async () => {
  jest.mocked(api.getOrganizations).mockResolvedValue([]);
  setup(<p>Private content</p>);
  await waitFor(() =>
    expect(mockRouter.replace).toHaveBeenCalledWith("/organizations"),
  );
  expect(screen.queryByText("Private content")).toBeNull();
});
