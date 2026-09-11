import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthBoundary } from "@/components/auth/auth-boundary";

let mockUserId: string | null = "user-a";
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/projects",
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      isPending: false,
      data: mockUserId ? { user: { id: mockUserId } } : null,
    }),
  },
}));
jest.mock("@/components/layout/MainLayout", () => ({
  __esModule: true,
  default: function TestShell() {
    const [open, setOpen] = useState(false);
    return (
      <button onClick={() => setOpen(true)}>
        {open ? "Private panel open" : "Panel closed"}
      </button>
    );
  },
}));

beforeEach(() => {
  mockUserId = "user-a";
});

test("account change resets shell-local panels and clears prior account caches", () => {
  const client = new QueryClient();
  client.setQueryData(["private-fixture"], "user-a data");
  const tree = () => (
    <QueryClientProvider client={client}>
      <AuthBoundary>Content</AuthBoundary>
    </QueryClientProvider>
  );
  const view = render(tree());
  fireEvent.click(screen.getByText("Panel closed"));
  expect(screen.getByText("Private panel open")).toBeTruthy();
  mockUserId = "user-b";
  view.rerender(tree());
  expect(screen.getByText("Panel closed")).toBeTruthy();
  expect(client.getQueryData(["private-fixture"])).toBeUndefined();
});

test("expired session hides the shell and preserves the sign-in redirect", () => {
  mockUserId = null;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthBoundary>Content</AuthBoundary>
    </QueryClientProvider>,
  );
  expect(screen.queryByText("Panel closed")).toBeNull();
  expect(mockReplace).toHaveBeenCalledWith("/sign-in");
});
