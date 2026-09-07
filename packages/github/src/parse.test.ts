import { toUsdc } from "@proofwork/chain";
import { describe, expect, it } from "vitest";
import { hasAiDisclosure, parseBountyLabel, parseLinkedIssues, parseSlashCommand } from "./parse";

describe("parseLinkedIssues", () => {
  it("reads every closing keyword GitHub accepts", () => {
    for (const keyword of [
      "close",
      "closes",
      "closed",
      "fix",
      "fixes",
      "fixed",
      "resolve",
      "resolves",
      "resolved",
    ]) {
      expect(parseLinkedIssues(`${keyword} #42`)).toEqual([42]);
    }
  });

  it("ignores a reference that is not a closing one", () => {
    expect(parseLinkedIssues("related to #42, see #43")).toEqual([]);
  });

  it("ignores code samples and quoted replies", () => {
    const body = ["> fixes #7", "```", "fixes #8", "```", "`fixes #9`", "fixes #10"].join("\n");

    expect(parseLinkedIssues(body)).toEqual([10]);
  });

  it("deduplicates and keeps every distinct issue", () => {
    expect(parseLinkedIssues("Fixes #12 and fixes #12 and closes #13")).toEqual([12, 13]);
  });

  it("takes a cross-repository reference only for its own repository", () => {
    expect(parseLinkedIssues("fixes 0x-pankaj/proofwork#5", "0x-pankaj/proofwork")).toEqual([5]);
    expect(parseLinkedIssues("fixes other/repo#5", "0x-pankaj/proofwork")).toEqual([]);
    expect(
      parseLinkedIssues(
        "fixes https://github.com/0x-pankaj/proofwork/issues/6",
        "0x-pankaj/proofwork",
      ),
    ).toEqual([6]);
  });
});

describe("parseSlashCommand", () => {
  it("reads the four commands, case insensitively", () => {
    expect(parseSlashCommand("/claim")).toEqual({ name: "claim" });
    expect(parseSlashCommand("/UNCLAIM")).toEqual({ name: "unclaim" });
    expect(parseSlashCommand("/status please")).toEqual({ name: "status" });
    expect(parseSlashCommand("/accept")).toEqual({ name: "accept" });
  });

  it("reads the stake id an agent attaches", () => {
    expect(parseSlashCommand("/claim stake:pw-9f2c-11")).toEqual({
      name: "claim",
      stakeId: "pw-9f2c-11",
    });
  });

  it("only reads a command at the start of a line", () => {
    expect(parseSlashCommand("I would like to /claim this")).toBeUndefined();
    expect(parseSlashCommand("Happy to help\n/claim\nthanks")).toEqual({ name: "claim" });
  });

  it("does not re-run a command that is being quoted or shown", () => {
    expect(parseSlashCommand("> /claim")).toBeUndefined();
    expect(parseSlashCommand("type `/claim` to take it")).toBeUndefined();
    expect(parseSlashCommand("```\n/claim\n```")).toBeUndefined();
  });

  it("ignores commands it does not know", () => {
    expect(parseSlashCommand("/deploy")).toBeUndefined();
  });
});

describe("parseBountyLabel", () => {
  it("reads the amount out of the label", () => {
    expect(parseBountyLabel("bounty:$50")).toBe(toUsdc("50"));
    expect(parseBountyLabel("bounty: 50.25")).toBe(toUsdc("50.25"));
  });

  it("rejects labels that are not bounties or not amounts", () => {
    expect(parseBountyLabel("good first issue")).toBeUndefined();
    expect(parseBountyLabel("bounty:$")).toBeUndefined();
    expect(parseBountyLabel("bounty:$0")).toBeUndefined();
  });
});

describe("hasAiDisclosure", () => {
  it("finds the disclosure line a repo policy asks for", () => {
    expect(hasAiDisclosure("Fixes #1\n\nAI-assisted: Claude Code")).toBe(true);
    expect(hasAiDisclosure("ai-assisted: yes")).toBe(true);
  });

  it("does not accept a quoted or merely mentioned disclosure", () => {
    expect(hasAiDisclosure("> AI-assisted: no")).toBe(false);
    expect(hasAiDisclosure("Write AI-assisted somewhere in the body")).toBe(false);
  });
});
