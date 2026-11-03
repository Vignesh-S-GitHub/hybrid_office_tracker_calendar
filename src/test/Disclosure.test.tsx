import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { Disclosure } from "../components/Disclosure";

it("supports keyboard expansion and preserves entered values while collapsed", async () => {
  render(
    <Disclosure title="Preferences">
      <label>
        Notes
        <input />
      </label>
    </Disclosure>,
  );
  const user = userEvent.setup();
  const toggle = screen.getByRole("button", { name: "Preferences" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  await user.tab();
  await user.keyboard("{Enter}");
  await user.type(screen.getByRole("textbox"), "Keep this value");
  await user.click(toggle);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  await user.keyboard(" ");
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("textbox")).toHaveValue("Keep this value");
});
