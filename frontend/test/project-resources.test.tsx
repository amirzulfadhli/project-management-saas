import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ProjectResourcePage,
  type ProjectResource,
} from "@/components/projects/project-resource-page";
import { WikiDraftProvider } from "@/components/wiki/wiki-drafts";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { column, projectFixture } from "./project-fixtures";
import type { WikiPage, WikiPageSummary } from "@/lib/types";
import type { ReactNode } from "react";

jest.mock("@/components/projects/project-workspace", () => ({
  useProjectWorkspace: () => ({
    project: projectFixture,
    columns: [column],
    currentUserId: "user-a",
    canAdministerProject: false,
  }),
}));
jest.mock("@/components/organizations/organization-provider", () => ({
  useOrganization: () => ({ selectedOrganization: null }),
}));
jest.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "user-a" } } }) },
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({}) }));
// Markdown parsing/security is unchanged; these tests exercise routing and editor state.
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  defaultUrlTransform: (url: string) => url,
}));
jest.mock("remark-gfm", () => ({ __esModule: true, default: jest.fn() }));
function setup(section: ProjectResource) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const tree = (current: ProjectResource | null, account = "user-a") => (
    <QueryClientProvider client={client}>
      <WikiDraftProvider key={account}>
        {current ? (
          <ProjectResourcePage key={current} section={current} />
        ) : (
          <p>Another section</p>
        )}
      </WikiDraftProvider>
    </QueryClientProvider>
  );
  return { client, tree, ...render(tree(section)) };
}
beforeEach(() => {
  jest
    .spyOn(api, "getProjectAttachments")
    .mockResolvedValue({ items: [], nextCursor: null });
  jest
    .spyOn(api, "getProjectActivities")
    .mockResolvedValue({ items: [], nextCursor: null });
  jest.spyOn(api, "getProjectTime").mockResolvedValue({
    projectId: "project-a",
    totalSeconds: 0,
    currentUserSeconds: 0,
    tasks: [],
    users: null,
  });
  jest.spyOn(api, "getProjectRepository").mockResolvedValue(null);
  jest.spyOn(api, "getGithubInstallations").mockResolvedValue([]);
  jest.spyOn(api, "getProjectMembers").mockResolvedValue([]);
  jest.spyOn(api, "getWikiPages").mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());
test.each([
  ["files", "No attachments yet"],
  ["activity", "No activity yet"],
  ["time", "No completed time entries yet."],
  ["github", "No GitHub repository connected"],
  ["members", "No explicit Project members"],
  ["docs", "No pages yet."],
] as const)(
  "%s is usable as inline content rather than a modal",
  async (section, message) => {
    setup(section);
    await screen.findByText(message);
    expect(screen.queryByRole("dialog")).toBeNull();
    if (section !== "files")
      expect(api.getProjectAttachments).not.toHaveBeenCalled();
    if (section !== "time") expect(api.getProjectTime).not.toHaveBeenCalled();
    if (section !== "docs") expect(api.getWikiPages).not.toHaveBeenCalled();
  },
);
test("non-owner GitHub page cannot discover installations or administer a connection", async () => {
  setup("github");
  await screen.findByText("No GitHub repository connected");
  expect(api.getGithubInstallations).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Connect GitHub" })).toBeNull();
});
test("Activity pagination reuses Project-scoped cursor contract", async () => {
  jest
    .mocked(api.getProjectActivities)
    .mockResolvedValueOnce({ items: [], nextCursor: "cursor" })
    .mockResolvedValue({ items: [], nextCursor: null });
  setup("activity");
  await screen.findByText("No activity yet");
  expect(api.getProjectActivities).toHaveBeenCalledWith("project-a", {
    cursor: undefined,
    limit: 30,
  });
});
test("unsaved Docs draft survives route unmount/remount, warns on unload and honors cancel", async () => {
  const view = setup("docs");
  await screen.findByText("No pages yet.");
  fireEvent.click(screen.getByRole("button", { name: "New" }));
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Unsaved architecture" },
  });
  fireEvent.change(screen.getByLabelText("Markdown"), {
    target: { value: "Do not lose me" },
  });
  view.rerender(view.tree(null));
  const unload = new Event("beforeunload", { cancelable: true });
  fireEvent(window, unload);
  expect(unload.defaultPrevented).toBe(true);
  view.rerender(view.tree("docs"));
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
    "Unsaved architecture",
  );
  expect((screen.getByLabelText("Markdown") as HTMLTextAreaElement).value).toBe(
    "Do not lose me",
  );
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByLabelText("Markdown")).toBeTruthy();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByLabelText("Markdown")).toBeNull();
  const cleanUnload = new Event("beforeunload", { cancelable: true });
  fireEvent(window, cleanUnload);
  expect(cleanUnload.defaultPrevented).toBe(false);
});
test("session-keyed draft provider never restores another account's draft", async () => {
  const view = setup("docs");
  await screen.findByText("No pages yet.");
  fireEvent.click(screen.getByRole("button", { name: "New" }));
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Private draft" },
  });
  view.rerender(view.tree("docs", "user-b"));
  await screen.findByText("No pages yet.");
  expect(screen.queryByDisplayValue("Private draft")).toBeNull();
});
test("Docs create continues to use the existing Markdown mutation and scoped invalidation", async () => {
  jest
    .spyOn(api, "createWikiPage")
    .mockResolvedValue({ id: "wiki-a" } as WikiPage);
  jest.spyOn(api, "getWikiPage").mockResolvedValue({
    id: "wiki-a",
    title: "Architecture",
    content: "Markdown",
    creator: { name: "Sarah" },
  } as WikiPage);
  const view = setup("docs");
  await screen.findByText("No pages yet.");
  const invalidate = jest.spyOn(view.client, "invalidateQueries");
  fireEvent.click(screen.getByRole("button", { name: "New" }));
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Architecture" },
  });
  fireEvent.change(screen.getByLabelText("Markdown"), {
    target: { value: "Markdown" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(api.createWikiPage).toHaveBeenCalledWith("project-a", {
      title: "Architecture",
      content: "Markdown",
      parentId: null,
    }),
  );
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: queryKeys.wikiPages("project-a", "user-a"),
    exact: true,
  });
});
test("an editing draft never retargets to a different page after its original is deleted", async () => {
  const first = { id: "first", title: "First", parentId: null, position: 0 };
  const second = { id: "second", title: "Second", parentId: null, position: 1 };
  jest
    .mocked(api.getWikiPages)
    .mockResolvedValue([first, second] as WikiPageSummary[]);
  jest.spyOn(api, "getWikiPage").mockImplementation(
    async (_project, id) =>
      ({
        id,
        title: id,
        content: "original",
        creator: { name: "Sarah" },
      }) as WikiPage,
  );
  const view = setup("docs");
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Markdown"), {
    target: { value: "My changes" },
  });
  await act(async () =>
    view.client.setQueryData(queryKeys.wikiPages("project-a", "user-a"), [
      second,
    ]),
  );
  expect((screen.getByLabelText("Markdown") as HTMLTextAreaElement).value).toBe(
    "My changes",
  );
  expect(api.getWikiPage).not.toHaveBeenCalledWith("project-a", "second");
});
