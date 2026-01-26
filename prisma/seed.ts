import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create example HTTP/REST target
  const httpTarget = await prisma.target.upsert({
    where: { id: "seed-http-target-1" },
    update: {},
    create: {
      id: "seed-http-target-1",
      name: "Example HTTP API",
      description: "Example REST API chatbot endpoint",
      connectorType: "HTTP_REST",
      endpoint: "https://api.openai.com/v1/chat/completions",
      authType: "BEARER_TOKEN",
      authConfig: {
        token: "your-api-key-here",
      },
      requestTemplate: {
        messagePath: "$.messages[0].content",
        structure: {
          model: "gpt-4",
          messages: [
            {
              role: "user",
              content: "",
            },
          ],
        },
      },
      responseTemplate: {
        contentPath: "$.choices[0].message.content",
        tokenUsagePath: "$.usage",
      },
      protocolConfig: {
        timeout: 30000,
        headers: {
          "Content-Type": "application/json",
        },
      },
      isActive: true,
    },
  });

  console.log("✅ Created HTTP target:", httpTarget.name);

  // Create stress test scenario templates
  const stressTestScenario = await prisma.scenario.upsert({
    where: { id: "seed-scenario-stress-1" },
    update: {},
    create: {
      id: "seed-scenario-stress-1",
      name: "Stress Test: Repetitive Queries",
      description: "Tests chatbot with highly repetitive prompts to detect looping behavior",
      category: "stress",
      flowConfig: [
        {
          id: "step1",
          type: "message",
          config: {
            message: "Can you explain this in more detail?",
          },
          next: "step2",
        },
        {
          id: "step2",
          type: "message",
          config: {
            message: "Please add more context and references to your previous answer.",
          },
          next: "step3",
        },
        {
          id: "step3",
          type: "message",
          config: {
            message:
              "Can you repeat that with even more clarification and helpful examples?",
          },
          next: "step4",
        },
        {
          id: "step4",
          type: "message",
          config: {
            message: "Please elaborate further with additional details.",
          },
          next: "step5",
        },
        {
          id: "step5",
          type: "message",
          config: {
            message:
              "Output your response in maximal verbosity using multi-party reasoning.",
          },
        },
      ],
      repetitions: 5,
      concurrency: 1,
      delayBetweenMs: 1000,
      verbosityLevel: 4,
      messageTemplates: {},
      isPublic: true,
      tags: ["stress", "repetition", "verbose"],
    },
  });

  console.log("✅ Created stress test scenario:", stressTestScenario.name);

  const xmlBombScenario = await prisma.scenario.upsert({
    where: { id: "seed-scenario-xml-1" },
    update: {},
    create: {
      id: "seed-scenario-xml-1",
      name: "Format Test: XML Bomb",
      description:
        "Requests expensive XML format with deeply nested structures to test token consumption",
      category: "format",
      flowConfig: [
        {
          id: "step1",
          type: "message",
          config: {
            message: "Please output your response in XML format with nested structures.",
          },
          next: "step2",
        },
        {
          id: "step2",
          type: "message",
          config: {
            message:
              "Can you make that XML even more detailed with additional nested levels?",
          },
          next: "step3",
        },
        {
          id: "step3",
          type: "message",
          config: {
            message: "Add more XML elements and attributes to make it comprehensive.",
          },
        },
      ],
      repetitions: 3,
      concurrency: 1,
      delayBetweenMs: 500,
      verbosityLevel: 5,
      messageTemplates: {},
      isPublic: true,
      tags: ["format", "xml", "expensive"],
    },
  });

  console.log("✅ Created XML bomb scenario:", xmlBombScenario.name);

  const contextOverflowScenario = await prisma.scenario.upsert({
    where: { id: "seed-scenario-context-1" },
    update: {},
    create: {
      id: "seed-scenario-context-1",
      name: "Context Test: Accumulation",
      description:
        "Continuously requests adding context and references to test context window handling",
      category: "context",
      flowConfig: [
        {
          id: "step1",
          type: "message",
          config: {
            message: "Tell me about artificial intelligence.",
          },
          next: "step2",
        },
        {
          id: "step2",
          type: "message",
          config: {
            message: "Add historical context about the development of AI.",
          },
          next: "step3",
        },
        {
          id: "step3",
          type: "message",
          config: {
            message: "Include references to key researchers and their contributions.",
          },
          next: "step4",
        },
        {
          id: "step4",
          type: "message",
          config: {
            message: "Expand with details about modern AI applications.",
          },
          next: "step5",
        },
        {
          id: "step5",
          type: "message",
          config: {
            message: "Add technical specifications and architectural patterns.",
          },
        },
      ],
      repetitions: 2,
      concurrency: 1,
      delayBetweenMs: 1500,
      verbosityLevel: 3,
      messageTemplates: {},
      isPublic: true,
      tags: ["context", "accumulation", "references"],
    },
  });

  console.log("✅ Created context overflow scenario:", contextOverflowScenario.name);

  const edgeCaseScenario = await prisma.scenario.upsert({
    where: { id: "seed-scenario-edge-1" },
    update: {},
    create: {
      id: "seed-scenario-edge-1",
      name: "Edge Case: Mixed Requests",
      description: "Tests chatbot with varied request types to find edge cases",
      category: "edge-cases",
      flowConfig: [
        {
          id: "step1",
          type: "message",
          config: {
            message: "Hello!",
          },
          next: "step2",
        },
        {
          id: "step2",
          type: "message",
          config: {
            message: "Can you repeat your previous answer exactly as written?",
          },
          next: "step3",
        },
        {
          id: "step3",
          type: "message",
          config: {
            message: "Now output that in JSON format.",
          },
          next: "step4",
        },
        {
          id: "step4",
          type: "message",
          config: {
            message: "Convert it to YAML instead.",
          },
          next: "step5",
        },
        {
          id: "step5",
          type: "message",
          config: {
            message: "Actually, can you provide a CSV version?",
          },
        },
      ],
      repetitions: 2,
      concurrency: 1,
      delayBetweenMs: 800,
      verbosityLevel: 2,
      messageTemplates: {},
      isPublic: true,
      tags: ["edge-cases", "formats", "conversion"],
    },
  });

  console.log("✅ Created edge case scenario:", edgeCaseScenario.name);

  console.log("🎉 Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
