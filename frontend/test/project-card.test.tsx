import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectCard } from "@/components/projects/project-card";
import { ApiError, api } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { projectFixture, projectSummary } from "./project-fixtures";

function setup(canAdminister = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData(queryKeys.projects("org-a"), [projectSummary]);
  client.setQueryData(queryKeys.projects("org-a", true), []);
  client.setQueryData(queryKeys.projects("org-other"), []);
  const onNotice = jest.fn();
  render(
    <QueryClientProvider client={client}>
      <ProjectCard
        project={projectSummary}
        canAdminister={canAdminister}
        onNotice={onNotice}
      />
    </QueryClientProvider>,
  );
  return { client, onNotice };
}

function openActions() {
  fireEvent.click(screen.getByText("Actions", { selector: "summary" }));
}

afterEach(() => jest.restoreAllMocks());

test.each([false, true])(
  "administration %s reserves an Actions column only when controls are available",
  (canAdminister) => {
    setup(canAdminister);
    const link = screen.getByRole("link", { name: /FlowPlan/ });
    expect(link.getAttribute("href")).toBe("/projects/project-a");
    const row = link.parentElement!;
    expect(row.classList.contains("grid-cols-1")).toBe(!canAdminister);
    expect(row.classList.contains("grid-cols-[minmax(0,1fr)_5rem]")).toBe(
      canAdminister,
    );
    expect(Boolean(row.querySelector("details"))).toBe(canAdminister);
  },
);

test("cancelling row Archive leaves metadata and caches unchanged", () => {
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  const archive = jest
    .spyOn(api, "archiveProject")
    .mockResolvedValue(undefined);
  const { client, onNotice } = setup();
  openActions();
  fireEvent.click(screen.getByRole("button", { name: "Archive" }));
  expect(confirm).toHaveBeenCalledWith('Archive "FlowPlan"?');
  expect(archive).not.toHaveBeenCalled();
  expect(client.getQueryData(queryKeys.projects("org-a"))).toEqual([
    projectSummary,
  ]);
  expect(onNotice).not.toHaveBeenCalled();
});

test("confirmed row Archive removes the active row and invalidates only that Organization's lists", async () => {
  jest.spyOn(window, "confirm").mockReturnValue(true);
  const archive = jest
    .spyOn(api, "archiveProject")
    .mockResolvedValue(undefined);
  const { client, onNotice } = setup();
  openActions();
  fireEvent.click(screen.getByRole("button", { name: "Archive" }));
  await waitFor(() =>
    expect(onNotice).toHaveBeenCalledWith('"FlowPlan" archived.'),
  );
  expect(archive).toHaveBeenCalledTimes(1);
  expect(archive).toHaveBeenCalledWith("project-a");
  expect(client.getQueryData(queryKeys.projects("org-a"))).toEqual([]);
  expect(client.getQueryState(queryKeys.projects("org-a"))?.isInvalidated).toBe(
    true,
  );
  expect(
    client.getQueryState(queryKeys.projects("org-a", true))?.isInvalidated,
  ).toBe(true);
  expect(
    client.getQueryState(queryKeys.projects("org-other"))?.isInvalidated,
  ).toBe(false);
});

test("row Duplicate caches the returned copy, preserves its source and invalidates only relevant lists", async () => {
  const copy = {
    ...projectFixture,
    id: "project-copy",
    name: "FlowPlan (Copy)",
  };
  const duplicate = jest.spyOn(api, "duplicateProject").mockResolvedValue(copy);
  const { client, onNotice } = setup();
  openActions();
  fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
  await waitFor(() =>
    expect(onNotice).toHaveBeenCalledWith('"FlowPlan (Copy)" created.'),
  );
  expect(duplicate).toHaveBeenCalledTimes(1);
  expect(duplicate).toHaveBeenCalledWith("project-a");
  expect(client.getQueryData(queryKeys.project("project-copy"))).toEqual(copy);
  expect(client.getQueryData(queryKeys.projects("org-a"))).toEqual([
    projectSummary,
  ]);
  expect(client.getQueryState(queryKeys.projects("org-a"))?.isInvalidated).toBe(
    true,
  );
  expect(
    client.getQueryState(queryKeys.projects("org-a", true))?.isInvalidated,
  ).toBe(true);
  expect(
    client.getQueryState(queryKeys.projects("org-other"))?.isInvalidated,
  ).toBe(false);
});

test.each(["Archive", "Duplicate"] as const)(
  "row %s failure remains visible without a success notice or cache changes",
  async (action) => {
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const operation =
      action === "Archive" ? "archiveProject" : "duplicateProject";
    jest.spyOn(api, operation).mockRejectedValue(
      new ApiError(403, "Administration denied", {
        message: "Administration denied",
      }),
    );
    const { client, onNotice } = setup();
    openActions();
    fireEvent.click(screen.getByRole("button", { name: action }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Administration denied",
    );
    expect(client.getQueryData(queryKeys.projects("org-a"))).toEqual([
      projectSummary,
    ]);
    expect(
      client.getQueryState(queryKeys.projects("org-a"))?.isInvalidated,
    ).toBe(false);
    expect(onNotice).not.toHaveBeenCalled();
  },
);
