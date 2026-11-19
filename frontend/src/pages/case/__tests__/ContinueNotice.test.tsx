import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContinueNotice } from "../ContinueNotice";

const LEFT = ["1 adapter repair did not start", "2 repeated violations were never judged"];

describe("ContinueNotice", () => {
  it("lists what the agents left undone and runs it again when you press Continue", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(<ContinueNotice unfinished={LEFT} busy={false} onContinue={onContinue} />);
    const note = screen.getByRole("note", { name: "The agents stopped before they finished" });
    expect(note).toHaveTextContent("1 adapter repair did not start");
    expect(note).toHaveTextContent("2 repeated violations were never judged");
    expect(note).toHaveTextContent("Everything that already finished is kept");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("points to the Crew page, where the Kiro account is switched", () => {
    render(<ContinueNotice unfinished={LEFT} busy={false} onContinue={() => undefined} />);
    expect(screen.getByRole("link", { name: "Switch the Kiro account on the Crew page" })).toHaveAttribute("href", "#/crew");
  });

  it("cannot be pressed twice while it is starting", () => {
    render(<ContinueNotice unfinished={LEFT} busy onContinue={() => undefined} />);
    expect(screen.getByRole("button", { name: "Continuing…" })).toBeDisabled();
  });

  it("is not there when nothing is left", () => {
    render(<ContinueNotice unfinished={[]} busy={false} onContinue={() => undefined} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});
