import { cleanup } from "@testing-library/react";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: jest.fn(() => ({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })),
});

// jsdom has no browser top layer. Only emulate open/close lifecycle here;
// native focus containment, inertness and layout still require manual QA.
Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value: jest.fn(function (this: HTMLDialogElement) {
    this.open = true;
  }),
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value: jest.fn(function (this: HTMLDialogElement) {
    this.open = false;
  }),
});

afterEach(() => {
  cleanup();
});
