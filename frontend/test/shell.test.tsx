import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import MainLayout from "@/components/layout/MainLayout";
import { AuthStatus } from "@/components/auth/auth-status";
import { authClient } from "@/lib/auth-client";

let mockPathname = "/projects/project-1";
const mockRouter = { replace: jest.fn(), refresh: jest.fn() };
const mockSelectOrganization = jest.fn();
let mockOrganization: { id: string; name: string } | null = {
  id: "org-1",
  name: "A long organization name",
};

jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => mockRouter,
}));
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: { id: "user-a", name: "Sarah", email: "sarah@example.test" },
      },
    }),
    signOut: jest.fn(),
  },
}));
jest.mock("@/components/organizations/organization-provider", () => ({
  OrganizationProvider: ({ children }: { children: ReactNode }) => children,
  useOrganization: () => ({
    selectedOrganization: mockOrganization,
    organizations: mockOrganization
      ? [mockOrganization, { id: "org-2", name: "Second organization" }]
      : [],
    selectedOrganizationId: mockOrganization?.id,
    selectOrganization: mockSelectOrganization,
  }),
}));
jest.mock("@/components/organizations/organization-members-modal", () => ({
  OrganizationMembersModal: ({
    organizationId,
  }: {
    organizationId: string;
  }) => <div>Members for {organizationId}</div>,
}));
jest.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => <button>Notifications</button>,
}));

beforeEach(() => {
  mockPathname = "/projects/project-1";
  mockOrganization = { id: "org-1", name: "A long organization name" };
});

test("sidebar uses real routes, selected state and supported management only", () => {
  render(<Sidebar onMembers={() => undefined} />);
  expect(
    screen.getByRole("link", { name: "Projects" }).getAttribute("aria-current"),
  ).toBe("page");
  expect(
    screen.getByRole("link", { name: "Home" }).hasAttribute("aria-current"),
  ).toBe(false);
  expect(
    screen
      .getByRole("link", { name: "Manage organizations" })
      .getAttribute("href"),
  ).toBe("/organizations");
  expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
});

test("organization selection reuses the existing provider callback", () => {
  render(<Sidebar onMembers={() => undefined} />);
  fireEvent.change(
    screen.getByRole("combobox", { name: "Current organization" }),
    { target: { value: "org-2" } },
  );
  expect(mockSelectOrganization).toHaveBeenCalledWith("org-2");
});

test("member entry does not invent access when no organization exists", () => {
  mockOrganization = null;
  const onMembers = jest.fn();
  render(<Sidebar onMembers={onMembers} />);
  expect(
    (screen.getByRole("button", { name: "Members" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.getByRole("link", { name: "Create organization" }),
  ).toBeTruthy();
});

test("header exposes navigation, notifications and account without duplicate switcher", () => {
  const open = jest.fn();
  render(<Header onOpenNavigation={open} navigationOpen={false} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Open workspace navigation" }),
  );
  expect(open).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
  expect(screen.queryByRole("combobox")).toBeNull();
});

test("shell provides skip target and reuses selected organization membership surface", () => {
  render(<MainLayout>Project content</MainLayout>);
  expect(
    screen.getByRole("link", { name: "Skip to content" }).getAttribute("href"),
  ).toBe("#main-content");
  expect(screen.getByRole("main").id).toBe("main-content");
  fireEvent.click(screen.getByRole("button", { name: "Members" }));
  expect(screen.getByText("Members for org-1")).toBeTruthy();
});

test("mobile navigation closes when a destination is selected", () => {
  render(<MainLayout>Content</MainLayout>);
  fireEvent.click(
    screen.getByRole("button", { name: "Open workspace navigation" }),
  );
  expect(
    screen.getByRole("dialog", { name: "Workspace navigation" }),
  ).toBeTruthy();
  fireEvent.click(screen.getAllByRole("link", { name: "Tasks" }).at(-1)!);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("browser history dismisses mobile navigation rather than retaining an old overlay", () => {
  render(<MainLayout>Content</MainLayout>);
  fireEvent.click(
    screen.getByRole("button", { name: "Open workspace navigation" }),
  );
  fireEvent(window, new PopStateEvent("popstate"));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("account exposes identity but not unsupported editing/settings", () => {
  render(<AuthStatus />);
  fireEvent.click(screen.getByRole("button", { name: "Account: Sarah" }));
  expect(screen.getByText("sarah@example.test")).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
});

test.each(["response", "network"])(
  "sign-out %s failure stays recoverable",
  async (failure) => {
    const signOut = jest.mocked(authClient.signOut);
    if (failure === "network")
      signOut.mockRejectedValueOnce(new Error("Network"));
    else
      signOut.mockResolvedValueOnce({ error: { message: "Failed" } } as Awaited<
        ReturnType<typeof authClient.signOut>
      >);
    render(<AuthStatus />);
    fireEvent.click(screen.getByRole("button", { name: "Account: Sarah" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Sign out" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  },
);

test("successful sign-out uses the existing authentication flow", async () => {
  jest
    .mocked(authClient.signOut)
    .mockResolvedValueOnce({ error: null } as Awaited<
      ReturnType<typeof authClient.signOut>
    >);
  render(<AuthStatus />);
  fireEvent.click(screen.getByRole("button", { name: "Account: Sarah" }));
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() =>
    expect(mockRouter.replace).toHaveBeenCalledWith("/sign-in"),
  );
  expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
});
