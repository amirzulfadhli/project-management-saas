import { StrictMode, useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Modal } from "@/components/ui/modal";

function Harness() {
  const [open, setOpen] = useState(false);
  const [child, setChild] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open editor</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Editor">
        <input aria-label="Draft" />
        <button onClick={() => setChild(true)}>Confirm action</button>
        <Modal
          open={child}
          onClose={() => setChild(false)}
          title="Confirmation"
        >
          <p>Really?</p>
        </Modal>
      </Modal>
    </>
  );
}

test("closed dialogs do not mount feature content", () => {
  render(
    <Modal open={false} onClose={() => undefined} title="Closed">
      <input aria-label="Draft" />
    </Modal>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByLabelText("Draft")).toBeNull();
});

test("shared close icon remains decorative inside the labelled control", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Open editor" }));
  const close = screen.getByRole("button", { name: "Close Editor" });
  const icon = close.querySelector("svg");
  expect(icon?.getAttribute("aria-hidden")).toBe("true");
  expect(icon?.getAttribute("viewBox")).toBe("0 0 24 24");
  fireEvent.click(close);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("opens in the native modal layer, focuses close and restores trigger and scroll", () => {
  document.body.style.overflow = "auto";
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Open editor" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Close Editor" }),
  );
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(screen.getByRole("button", { name: "Close Editor" }));
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe("auto");
});

test("Escape honors the caller's discard policy rather than forcing a close", () => {
  const onClose = jest.fn();
  render(
    <Modal open onClose={onClose} title="Unsaved">
      <input aria-label="Draft" defaultValue="Keep me" />
    </Modal>,
  );
  const dialog = screen.getByRole("dialog", { name: "Unsaved" });
  const event = new Event("cancel", { cancelable: true });
  fireEvent(dialog, event);
  expect(event.defaultPrevented).toBe(true);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect((dialog as HTMLDialogElement).open).toBe(true);
  expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe(
    "Keep me",
  );
});

test("parent rerenders do not reopen dialog or steal draft focus", () => {
  const view = render(
    <Modal open onClose={() => undefined} title="Editor">
      <input aria-label="Draft" />
    </Modal>,
  );
  screen.getByLabelText("Draft").focus();
  view.rerender(
    <Modal open onClose={() => undefined} title="Updated title">
      <input aria-label="Draft" />
    </Modal>,
  );
  expect(document.activeElement).toBe(screen.getByLabelText("Draft"));
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
});

test("nested dialogs restore parent focus and retain the scroll lock", () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("Open editor"));
  const trigger = screen.getByText("Confirm action");
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "Confirmation" })).getByRole(
      "button",
      { name: "Close Confirmation" },
    ),
  );
  expect(document.body.style.overflow).toBe("hidden");
  expect(document.activeElement).toBe(trigger);
  expect(
    (screen.getByRole("dialog", { name: "Editor" }) as HTMLDialogElement).open,
  ).toBe(true);
});

test("a nested Escape request does not dismiss its parent", () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("Open editor"));
  fireEvent.click(screen.getByText("Confirm action"));
  fireEvent(
    screen.getByRole("dialog", { name: "Confirmation" }),
    new Event("cancel", { cancelable: true, bubbles: true }),
  );
  expect(screen.queryByRole("dialog", { name: "Confirmation" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "Editor" })).toBeTruthy();
});

test("only backdrop clicks request dismissal", () => {
  const onClose = jest.fn();
  render(
    <Modal open onClose={onClose} title="Editor">
      <button>Inside</button>
    </Modal>,
  );
  const dialog = screen.getByRole("dialog");
  jest
    .spyOn(dialog, "getBoundingClientRect")
    .mockReturnValue({ left: 10, right: 100, top: 10, bottom: 100 } as DOMRect);
  fireEvent.click(screen.getByText("Inside"));
  fireEvent.click(dialog, { clientX: 50, clientY: 50 });
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(dialog, { clientX: 5, clientY: 5 });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("StrictMode teardown does not leak scroll locks", () => {
  document.body.style.overflow = "scroll";
  const view = render(
    <StrictMode>
      <Modal open onClose={() => undefined} title="Editor">
        Content
      </Modal>
    </StrictMode>,
  );
  expect(document.body.style.overflow).toBe("hidden");
  view.unmount();
  expect(document.body.style.overflow).toBe("scroll");
});
