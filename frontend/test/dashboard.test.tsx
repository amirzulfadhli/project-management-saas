import { fireEvent, render, screen, within } from "@testing-library/react";
import Dashboard from "@/app/page";
import { useOrganizationTasks } from "@/components/tasks/use-organization-tasks";
import { projectSummary, taskFixture } from "./project-fixtures";

jest.mock("@/components/tasks/use-organization-tasks", () => ({
  useOrganizationTasks: jest.fn(),
}));

const work = jest.mocked(useOrganizationTasks);
const refetch = jest.fn();

beforeEach(() => {
  work.mockReturnValue({
    projects: [projectSummary],
    tasks: [
      {
        ...taskFixture,
        id: "later",
        title: "Later Task",
        dueDate: "2026-10-25",
      },
      {
        ...taskFixture,
        id: "earlier",
        title: "Earlier Task",
        dueDate: "2026-10-20",
      },
      { ...taskFixture, id: "unscheduled", title: "No deadline" },
    ],
    isPending: false,
    isError: false,
    error: null,
    refetch,
  });
});

test("recomposed panels preserve due-date ordering, exact Task links and Project navigation", () => {
  render(<Dashboard />);
  const scheduled = within(
    screen.getByRole("region", { name: "Scheduled Tasks" }),
  );
  const taskLinks = scheduled
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href")?.includes("/tasks/"));
  expect(taskLinks.map((link) => link.textContent)).toEqual([
    expect.stringContaining("Earlier Task"),
    expect.stringContaining("Later Task"),
  ]);
  expect(taskLinks[0].getAttribute("href")).toBe(
    "/projects/project-a/tasks/earlier",
  );
  expect(screen.queryByText("No deadline")).toBeNull();
  expect(
    scheduled
      .getByRole("link", { name: "View all Tasks" })
      .getAttribute("href"),
  ).toBe("/tasks");
  const recent = within(
    screen.getByRole("region", { name: "Recent Projects" }),
  );
  expect(
    recent.getByRole("link", { name: /FlowPlan/ }).getAttribute("href"),
  ).toBe("/projects/project-a");
  expect(
    recent
      .getByRole("link", { name: "View all Projects" })
      .getAttribute("href"),
  ).toBe("/projects");
});

test("panels retain empty states and do not display stale work on load failure", () => {
  work.mockReturnValueOnce({ ...work(), tasks: [], projects: [] });
  const { rerender } = render(<Dashboard />);
  expect(screen.getByText("No projects yet.")).toBeTruthy();
  expect(screen.getByText("No tasks with deadlines.")).toBeTruthy();
  work.mockReturnValue({
    ...work(),
    isError: true,
    error: new Error("Network"),
  });
  rerender(<Dashboard />);
  expect(screen.queryByRole("region", { name: "Scheduled Tasks" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
  expect(refetch).toHaveBeenCalledTimes(1);
});

test("Dashboard limits each panel to five items while preserving Project order and sorting scheduled Tasks by due date", () => {
  const projectNames = [
    "Zulu",
    "Alpha",
    "Echo",
    "Delta",
    "Bravo",
    "Foxtrot",
    "Charlie",
  ];
  const projects = projectNames.map((name, index) => ({
    ...projectSummary,
    id: `project-${index}`,
    name,
  }));
  const tasks = [7, 3, 6, 1, 5, 2, 4].map((day) => ({
    ...taskFixture,
    id: `task-${day}`,
    title: `Deadline ${day}`,
    dueDate: `2026-11-0${day}`,
  }));
  work.mockReturnValue({ ...work(), projects, tasks: [taskFixture, ...tasks] });
  render(<Dashboard />);

  const scheduled = within(
    screen.getByRole("region", { name: "Scheduled Tasks" }),
  );
  const taskLinks = scheduled
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href")?.includes("/tasks/"));
  expect(taskLinks.map((link) => link.getAttribute("href"))).toEqual(
    [1, 2, 3, 4, 5].map((day) => `/projects/project-a/tasks/task-${day}`),
  );
  expect(scheduled.queryByText("Deadline 6")).toBeNull();
  expect(scheduled.queryByText(taskFixture.title)).toBeNull();

  const recent = within(
    screen.getByRole("region", { name: "Recent Projects" }),
  );
  const projectLinks = recent
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href")?.startsWith("/projects/"));
  expect(projectLinks.map((link) => link.getAttribute("href"))).toEqual(
    projects.slice(0, 5).map((project) => `/projects/${project.id}`),
  );
  expect(projectLinks.map((link) => link.textContent)).toEqual(
    projectNames.slice(0, 5).map((name) => `${name}3 tasks`),
  );
  expect(recent.queryByText("Foxtrot")).toBeNull();
});
