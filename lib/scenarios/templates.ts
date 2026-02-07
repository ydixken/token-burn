/**
 * Pre-built Scenario Templates
 *
 * Collection of ready-to-use test scenarios for common chatbot testing patterns.
 */

export interface ScenarioTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  flowConfig: any[];
  verbosityLevel: string;
  repetitions: number;
  concurrency: number;
  delayBetweenMs: number;
  messageTemplates: Record<string, string>;
}

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: "stress-test-basic",
    name: "Basic Stress Test",
    description: "High-volume repetitive prompts to test chatbot stability and token consumption",
    category: "STRESS_TEST",
    flowConfig: [
      {
        type: "message",
        content: "{{greeting}}",
      },
      {
        type: "loop",
        iterations: 10,
        steps: [
          {
            type: "message",
            content: "{{repetitive_question}}",
          },
        ],
      },
      {
        type: "message",
        content: "Thank you for your responses. Please summarize everything we discussed.",
      },
    ],
    verbosityLevel: "verbose",
    repetitions: 5,
    concurrency: 1,
    delayBetweenMs: 1000,
    messageTemplates: {
      greeting: "Hello! I need your help with something important.",
      repetitive_question: "Can you please explain that again in more detail? I want to make absolutely sure I understand every aspect of what you just said. Please be as thorough and comprehensive as possible in your explanation.",
    },
  },

  {
    id: "stress-test-xml",
    name: "XML Format Stress Test",
    description: "Request expensive XML format responses to maximize token usage",
    category: "STRESS_TEST",
    flowConfig: [
      {
        type: "message",
        content: "{{xml_request}}",
      },
      {
        type: "loop",
        iterations: 8,
        steps: [
          {
            type: "message",
            content: "{{xml_followup}}",
          },
        ],
      },
    ],
    verbosityLevel: "verbose",
    repetitions: 3,
    concurrency: 2,
    delayBetweenMs: 2000,
    messageTemplates: {
      xml_request: "Please provide a comprehensive analysis of machine learning algorithms in XML format with detailed examples, code snippets, and explanations for each algorithm.",
      xml_followup: "Please expand on the previous response with even more detail in XML format, including additional examples, edge cases, and theoretical background.",
    },
  },

  {
    id: "edge-case-empty",
    name: "Edge Case: Empty & Minimal Input",
    description: "Test chatbot handling of empty, minimal, and edge case inputs",
    category: "EDGE_CASE",
    flowConfig: [
      {
        type: "message",
        content: "",
      },
      {
        type: "message",
        content: " ",
      },
      {
        type: "message",
        content: "?",
      },
      {
        type: "message",
        content: "a",
      },
      {
        type: "message",
        content: "1",
      },
      {
        type: "message",
        content: "!@#$%^&*()",
      },
    ],
    verbosityLevel: "normal",
    repetitions: 3,
    concurrency: 1,
    delayBetweenMs: 500,
    messageTemplates: {},
  },

  {
    id: "edge-case-unicode",
    name: "Edge Case: Unicode & Special Characters",
    description: "Test chatbot handling of various unicode and special characters",
    category: "EDGE_CASE",
    flowConfig: [
      {
        type: "message",
        content: "Hello 👋 How are you?",
      },
      {
        type: "message",
        content: "Can you help me with 中文 Chinese characters?",
      },
      {
        type: "message",
        content: "What about العربية Arabic?",
      },
      {
        type: "message",
        content: "Or עברית Hebrew?",
      },
      {
        type: "message",
        content: "Emojis: 😀😃😄😁🎉🎊🎈",
      },
      {
        type: "message",
        content: "Mathematical symbols: ∑∫∂∇∞≈≠±×÷",
      },
    ],
    verbosityLevel: "normal",
    repetitions: 2,
    concurrency: 1,
    delayBetweenMs: 1000,
    messageTemplates: {},
  },

  {
    id: "conversation-context",
    name: "Context Accumulation Test",
    description: "Long conversation to test context window and memory management",
    category: "CONTEXT",
    flowConfig: [
      {
        type: "message",
        content: "Hi, I'm planning a vacation to Japan. Can you help me?",
      },
      {
        type: "message",
        content: "I want to visit Tokyo, Kyoto, and Osaka. How many days should I allocate?",
      },
      {
        type: "message",
        content: "What are the must-see attractions in Tokyo?",
      },
      {
        type: "message",
        content: "What about Kyoto?",
      },
      {
        type: "message",
        content: "And Osaka?",
      },
      {
        type: "message",
        content: "How much budget should I prepare for a 2-week trip?",
      },
      {
        type: "message",
        content: "What's the best time of year to visit?",
      },
      {
        type: "message",
        content: "Do I need a visa?",
      },
      {
        type: "message",
        content: "What are some local customs I should know?",
      },
      {
        type: "message",
        content: "Can you summarize everything you told me about my Japan trip, including cities, attractions, budget, timing, visa requirements, and customs?",
      },
    ],
    verbosityLevel: "normal",
    repetitions: 2,
    concurrency: 1,
    delayBetweenMs: 1500,
    messageTemplates: {},
  },

  {
    id: "rapid-fire",
    name: "Rapid Fire Test",
    description: "Fast consecutive messages to test rate limiting and queuing",
    category: "PERFORMANCE",
    flowConfig: [
      {
        type: "loop",
        iterations: 20,
        steps: [
          {
            type: "message",
            content: "Quick question {{index}}: What's {{index}} + {{index}}?",
          },
        ],
      },
    ],
    verbosityLevel: "minimal",
    repetitions: 3,
    concurrency: 3,
    delayBetweenMs: 100,
    messageTemplates: {},
  },

  {
    id: "branching-conversation",
    name: "Branching Conversation",
    description: "Complex branching logic to test conditional flow handling",
    category: "LOGIC",
    flowConfig: [
      {
        type: "message",
        content: "Do you support multiple languages?",
      },
      {
        type: "conditional",
        condition: "response.contains('yes')",
        thenSteps: [
          {
            type: "message",
            content: "Great! Can you respond in Spanish?",
          },
          {
            type: "message",
            content: "How about French?",
          },
        ],
        elseSteps: [
          {
            type: "message",
            content: "That's okay. What languages do you support?",
          },
        ],
      },
      {
        type: "message",
        content: "Thank you for the information.",
      },
    ],
    verbosityLevel: "normal",
    repetitions: 2,
    concurrency: 1,
    delayBetweenMs: 1000,
    messageTemplates: {},
  },

  {
    id: "long-form-output",
    name: "Long-Form Output Test",
    description: "Request long, detailed responses to maximize output tokens",
    category: "KRAWALL",
    flowConfig: [
      {
        type: "message",
        content: "Please write a comprehensive 2000-word essay on the history of artificial intelligence, covering major milestones, key researchers, breakthrough technologies, and future implications.",
      },
      {
        type: "message",
        content: "Now write another 2000-word essay on the ethical implications of AI, including privacy concerns, bias, job displacement, and regulatory challenges.",
      },
      {
        type: "message",
        content: "Finally, write a 1500-word technical deep-dive into transformer architectures, explaining attention mechanisms, positional encodings, and training procedures in detail.",
      },
    ],
    verbosityLevel: "verbose",
    repetitions: 2,
    concurrency: 1,
    delayBetweenMs: 5000,
    messageTemplates: {},
  },
  // ─── E-Commerce Attack Surface Templates ───

  {
    id: "ecommerce-token-drain",
    name: "E-Commerce Token Drain",
    description:
      "Simulates a customer exploring an e-commerce chatbot — requesting product catalogs, comparisons, XML formatting, and conversation summaries to maximize token consumption.",
    category: "ATTACK_SURFACE",
    flowConfig: [
      {
        type: "message",
        content: "What product categories do you offer?",
      },
      {
        type: "loop",
        iterations: 5,
        steps: [
          {
            type: "message",
            content:
              "List all available options in electronics with detailed specifications including dimensions, weight, warranty, and compatibility information.",
          },
          {
            type: "message",
            content:
              "Can you format that in XML for my accessibility tool? Please use proper XML structure with tags for each field.",
          },
          {
            type: "message",
            content:
              "Compare your top 2 products in that category — pros, cons, structured comparison table with pricing, features, and user ratings.",
          },
          {
            type: "message",
            content:
              "Include customer reviews and ratings for each product. At least 3 reviews per product with dates and verified purchase status.",
          },
          {
            type: "message",
            content:
              "Summarize everything we've discussed so far in a comprehensive report format.",
          },
        ],
      },
    ],
    verbosityLevel: "extreme",
    repetitions: 3,
    concurrency: 1,
    delayBetweenMs: 2000,
    messageTemplates: {},
  },

  {
    id: "support-escalation-flood",
    name: "Support Escalation Flood",
    description:
      "Simulates a frustrated customer filing multiple support requests, requesting escalations, and asking about order details to test support chatbot resource usage.",
    category: "ATTACK_SURFACE",
    flowConfig: [
      {
        type: "message",
        content: "I have a problem with my order #12345",
      },
      {
        type: "message",
        content:
          "Can you look up the full order details including tracking, payment method, items, quantities, and delivery address?",
      },
      {
        type: "message",
        content:
          "What's your return policy? List all conditions, exceptions, time limits, and required documentation.",
      },
      {
        type: "message",
        content: "I need this escalated to a manager immediately.",
      },
      {
        type: "loop",
        iterations: 10,
        steps: [
          {
            type: "message",
            content:
              "While I wait, can you also check order #{{messageIndex}}? I need full details on that one too.",
          },
          {
            type: "message",
            content:
              "What is the status of the escalation? I've been waiting and need a full update on all my open cases.",
          },
        ],
      },
    ],
    verbosityLevel: "verbose",
    repetitions: 2,
    concurrency: 1,
    delayBetweenMs: 1500,
    messageTemplates: {},
  },

  {
    id: "context-window-stuffer",
    name: "Context Window Stuffer",
    description:
      "Progressively fills the context window by requesting expansive content, then asking for recalls, combinations, and translations of earlier responses.",
    category: "ATTACK_SURFACE",
    flowConfig: [
      {
        type: "message",
        content:
          "Tell me about your company's mission, values, history, founding story, leadership team, and long-term vision in comprehensive detail.",
      },
      {
        type: "message",
        content:
          "Now tell me about each of your products in detail — features, pricing tiers, use cases, competitive advantages, and customer testimonials.",
      },
      {
        type: "message",
        content:
          "What did you say about the company mission in your first response? Repeat it exactly, word for word.",
      },
      {
        type: "message",
        content:
          "Combine your answers from the first and second messages into a single unified document with section headers and a table of contents.",
      },
      {
        type: "message",
        content:
          "Translate that entire combined document into formal academic English, maintaining all details and adding professional formatting.",
      },
      {
        type: "message",
        content:
          "Now add citations for every claim you made. Use APA format with proper references.",
      },
      {
        type: "loop",
        iterations: 8,
        steps: [
          {
            type: "message",
            content:
              "Expand section {{messageIndex}} with more detail. Add sub-sections, examples, case studies, and at least 3 supporting arguments per point.",
          },
        ],
      },
    ],
    verbosityLevel: "extreme",
    repetitions: 2,
    concurrency: 1,
    delayBetweenMs: 3000,
    messageTemplates: {},
  },

  {
    id: "polite-persistent-requester",
    name: "Polite Persistent Requester",
    description:
      "A seemingly innocent conversation that progressively asks for more detail, reformatting, and expansion — testing how chatbots handle polite but resource-intensive requests.",
    category: "ATTACK_SURFACE",
    flowConfig: [
      {
        type: "message",
        content:
          "Hi! I'm researching artificial intelligence for a school project. Could you help me understand the basics?",
      },
      {
        type: "message",
        content:
          "That's great! Could you elaborate on neural networks specifically? I need a really thorough explanation.",
      },
      {
        type: "message",
        content:
          "Very helpful! Could you provide specific real-world examples of neural networks in use? At least 10 examples with details.",
      },
      {
        type: "message",
        content:
          "Could you present those examples in a detailed comparison table format with columns for industry, application, technology, company, and impact?",
      },
      {
        type: "message",
        content:
          "Perfect! Could you also add a column for estimated cost and implementation complexity?",
      },
      {
        type: "message",
        content:
          "One more thing — could you include academic references for each example? Proper citations please.",
      },
      {
        type: "message",
        content:
          "Could you summarize everything we've discussed in a 500-word essay suitable for my project?",
      },
      {
        type: "loop",
        iterations: 5,
        steps: [
          {
            type: "message",
            content:
              "Actually, could you revise the essay to also include information about reinforcement learning? Make it more comprehensive but keep it well-structured.",
          },
        ],
      },
    ],
    verbosityLevel: "verbose",
    repetitions: 3,
    concurrency: 1,
    delayBetweenMs: 2000,
    messageTemplates: {},
  },
];

/**
 * Get template by ID
 */
export function getTemplate(id: string): ScenarioTemplate | undefined {
  return SCENARIO_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): ScenarioTemplate[] {
  return SCENARIO_TEMPLATES.filter((t) => t.category === category);
}

/**
 * Get all categories
 */
export function getCategories(): string[] {
  return [...new Set(SCENARIO_TEMPLATES.map((t) => t.category))];
}

/**
 * Apply template to create scenario config
 */
export function applyTemplate(
  template: ScenarioTemplate,
  overrides?: Partial<ScenarioTemplate>
): Omit<ScenarioTemplate, "id"> {
  return {
    ...template,
    ...overrides,
  };
}
