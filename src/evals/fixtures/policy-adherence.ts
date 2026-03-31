import type { BlockType } from "@/lib/types";

interface PolicyFixture {
  scopeType: "global" | "qualification" | "org" | "class" | "learner";
  key: string;
  value: string;
}

export interface PolicyAdherenceEvalScenario {
  id: string;
  title: string;
  summary: string;
  provenance: string;
  block: {
    topicName: string;
    blockType: BlockType;
    reason: string;
    durationMinutes: number;
  };
  policies: PolicyFixture[];
  expectations: {
    expectedPolicies: Array<{
      key: string;
      scopeType: "global" | "qualification" | "org" | "class" | "learner";
      value: string;
    }>;
    forbiddenValues: string[];
    promptKeywords: string[];
  };
}

export const POLICY_ADHERENCE_EVAL_FIXTURES: PolicyAdherenceEvalScenario[] = [
  {
    id: "org-essay-ban-with-learner-scaffolding",
    title: "Org essay ban survives against a looser global default",
    summary:
      "Checks that the real policy resolver keeps the org rule banning model essays while also preserving a separate learner scaffolding rule.",
    provenance:
      "Synthetic policy-adherence fixture committed in src/evals/fixtures/policy-adherence.ts on 2026-03-31. It uses the live resolveAllPolicies and buildSystemPrompt path.",
    block: {
      topicName: "Homeostasis",
      blockType: "essay_planning",
      reason: "Learner is practicing long-form exam planning on a topic with prior overconfident answers",
      durationMinutes: 20,
    },
    policies: [
      {
        scopeType: "global",
        key: "essay_generation_mode",
        value: "Allow full model essays when a learner asks for one.",
      },
      {
        scopeType: "org",
        key: "essay_generation_mode",
        value:
          "Do not draft full essays. Critique outlines, sentence starters, and completed attempts only.",
      },
      {
        scopeType: "learner",
        key: "response_scaffolding",
        value: "Use one question at a time and wait for confirmation before adding more.",
      },
    ],
    expectations: {
      expectedPolicies: [
        {
          key: "essay_generation_mode",
          scopeType: "org",
          value:
            "Do not draft full essays. Critique outlines, sentence starters, and completed attempts only.",
        },
        {
          key: "response_scaffolding",
          scopeType: "learner",
          value:
            "Use one question at a time and wait for confirmation before adding more.",
        },
      ],
      forbiddenValues: ["Allow full model essays when a learner asks for one."],
      promptKeywords: [
        "Do not draft full essays",
        "one question at a time",
        "wait for confirmation",
      ],
    },
  },
  {
    id: "class-paper-focus-with-access-needs",
    title: "Class paper focus and learner access needs both reach the prompt",
    summary:
      "Checks that distinct keys from qualification, class, and learner scopes all survive resolution together and remain visible in the live prompt.",
    provenance:
      "Synthetic policy-adherence fixture committed in src/evals/fixtures/policy-adherence.ts on 2026-03-31. It covers multi-key policy composition rather than only single-key overrides.",
    block: {
      topicName: "Inheritance",
      blockType: "timed_problems",
      reason: "Teacher has temporarily narrowed class prep to the upcoming Paper 2 mock",
      durationMinutes: 15,
    },
    policies: [
      {
        scopeType: "qualification",
        key: "command_word_emphasis",
        value: "Prefer explain and evaluate style prompts over simple definition checks.",
      },
      {
        scopeType: "class",
        key: "paper_focus",
        value: "Paper 2 only until the mock is complete.",
      },
      {
        scopeType: "learner",
        key: "access_needs",
        value: "Use short sentences, numbered steps, and only one mark-scheme demand at a time.",
      },
    ],
    expectations: {
      expectedPolicies: [
        {
          key: "command_word_emphasis",
          scopeType: "qualification",
          value:
            "Prefer explain and evaluate style prompts over simple definition checks.",
        },
        {
          key: "paper_focus",
          scopeType: "class",
          value: "Paper 2 only until the mock is complete.",
        },
        {
          key: "access_needs",
          scopeType: "learner",
          value:
            "Use short sentences, numbered steps, and only one mark-scheme demand at a time.",
        },
      ],
      forbiddenValues: [],
      promptKeywords: [
        "Paper 2 only",
        "short sentences",
        "explain and evaluate",
      ],
    },
  },
  {
    id: "learner-difficulty-override-wins",
    title: "Learner difficulty override beats broader defaults",
    summary:
      "Checks that the most specific difficulty rule wins cleanly and that broader overridden values do not leak into the prompt.",
    provenance:
      "Synthetic policy-adherence fixture committed in src/evals/fixtures/policy-adherence.ts on 2026-03-31. It is meant to catch regressions in specificity ordering.",
    block: {
      topicName: "Ecology",
      blockType: "explanation",
      reason: "Learner needs a lower-friction reentry after confidence dipped",
      durationMinutes: 15,
    },
    policies: [
      {
        scopeType: "global",
        key: "difficulty_override",
        value: "stretch",
      },
      {
        scopeType: "qualification",
        key: "difficulty_override",
        value: "intermediate",
      },
      {
        scopeType: "learner",
        key: "difficulty_override",
        value: "foundational",
      },
    ],
    expectations: {
      expectedPolicies: [
        {
          key: "difficulty_override",
          scopeType: "learner",
          value: "foundational",
        },
      ],
      forbiddenValues: ["stretch", "intermediate"],
      promptKeywords: ["difficulty_override", "foundational"],
    },
  },
];
