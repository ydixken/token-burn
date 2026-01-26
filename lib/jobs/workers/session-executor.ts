import { Worker, Job } from "bullmq";
import { redis } from "@/lib/cache/redis";
import { prisma } from "@/lib/db/client";
import type { SessionJobData } from "../queue";

// Session executor worker
export function createSessionWorker() {
  const worker = new Worker<SessionJobData>(
    "session-execution",
    async (job: Job<SessionJobData>) => {
      const { sessionId, targetId, executionConfig } = job.data;

      console.log(`🚀 Starting session execution: ${sessionId}`);

      try {
        // Update session status to RUNNING
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            status: "RUNNING",
            startedAt: new Date(),
          },
        });

        // TODO: Initialize connector based on targetConfig
        // TODO: Initialize session logger
        // TODO: Initialize metrics collector

        // Execute scenario flow
        const { flow, repetitions } = executionConfig;

        for (let rep = 0; rep < repetitions; rep++) {
          console.log(`  📝 Repetition ${rep + 1}/${repetitions}`);

          for (const step of flow) {
            // TODO: Execute each step based on type
            console.log(`    ⚡ Executing step: ${step.id} (type: ${step.type})`);

            // Update progress
            const progress =
              ((rep * flow.length + flow.indexOf(step)) / (repetitions * flow.length)) * 100;
            await job.updateProgress(progress);

            // TODO: Add delay between messages if configured
            if (executionConfig.delayBetweenMs > 0) {
              await new Promise((resolve) =>
                setTimeout(resolve, executionConfig.delayBetweenMs)
              );
            }
          }
        }

        // Mark session as completed
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });

        console.log(`✅ Session completed: ${sessionId}`);

        return { success: true, sessionId };
      } catch (error) {
        console.error(`❌ Session failed: ${sessionId}`, error);

        // Mark session as failed
        await prisma.session.update({
          where: { id: sessionId },
          data: {
            status: "FAILED",
            completedAt: new Date(),
          },
        });

        throw error;
      }
    },
    {
      connection: redis,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || "5"),
      limiter: {
        max: 10, // Max 10 jobs per duration
        duration: 1000, // 1 second
      },
    }
  );

  // Event handlers
  worker.on("completed", (job) => {
    console.log(`✅ Job completed: ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ Job failed: ${job?.id}`, err);
  });

  worker.on("error", (err) => {
    console.error("❌ Worker error:", err);
  });

  return worker;
}
