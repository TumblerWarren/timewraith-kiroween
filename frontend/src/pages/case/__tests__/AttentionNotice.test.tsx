import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AttentionNotice } from "../AttentionNotice";

describe("AttentionNotice", () => {
  it("shows what could not be tested, as a note on the case page", () => {
    render(<AttentionNotice notes={["an ordinary note", "Attention: 6 of 11 experiments could not run. Results from what did run may be incomplete."]} />);
    const note = screen.getByRole("note", { name: "This run finished, but not everything could be tested" });
    expect(note).toHaveTextContent("6 of 11 experiments could not run");
    expect(note).not.toHaveTextContent("Attention:");
  });
  it("shows nothing for a clean run", () => {
    render(<AttentionNotice notes={["No anomaly observed: 11 of 11 experiments ran and none found a violation."]} />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});