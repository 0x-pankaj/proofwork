import { describe, expect, it } from "vitest";
import { agentRegistrationMessage } from "./agents";

describe("agent registration message", () => {
  it("binds the login, the lowercased address and the nonce", () => {
    expect(
      agentRegistrationMessage(
        "helpful-bot",
        "0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        "n0nce-1234",
      ),
    ).toBe("proofwork-agent:helpful-bot:0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266:n0nce-1234");
  });

  it("is the same message whichever way the address is cased", () => {
    const upper = agentRegistrationMessage(
      "bot",
      "0xF39FD6E51AAD88F6F4CE6AB8827279CFFFB92266",
      "n",
    );
    const lower = agentRegistrationMessage(
      "bot",
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      "n",
    );
    expect(upper).toBe(lower);
  });
});
