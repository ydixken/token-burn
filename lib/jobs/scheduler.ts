import cron from "node-cron";
import { prisma } from "@/lib/db/client";
import { sessionQueue } from "./queue";

/**
 * Job Scheduler
 *
 * Manages cron-based scheduled execution of scenarios.
 */
class JobScheduler {
  private tasks: Map<string, cron.ScheduledTask> = new Map();

  /**
   * Initialize scheduler and load active jobs from database
   */
  async initialize() {
    console.log("📅 Initializing job scheduler...");

    const activeJobs = await prisma.scheduledJob.findMany({
      where: { isEnabled: true },
      include: {
        scenario: {
          include: {
            target: true,
          },
        },
      },
    });

    for (const job of activeJobs) {
      this.scheduleJob(job.id, job.cronExpression, async () => {
        await this.executeScheduledJob(job.id);
      });
    }

    console.log(`✅ Loaded ${activeJobs.length} scheduled jobs`);
  }

  /**
   * Schedule a new job
   */
  scheduleJob(jobId: string, cronExpression: string, callback: () => Promise<void>) {
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    // Cancel existing task if any
    this.cancelJob(jobId);

    // Create new scheduled task
    const task = cron.schedule(cronExpression, async () => {
      console.log(`⏰ Executing scheduled job: ${jobId}`);
      try {
        await callback();
      } catch (error) {
        console.error(`Failed to execute scheduled job ${jobId}:`, error);
      }
    });

    this.tasks.set(jobId, task);
    console.log(`📅 Scheduled job ${jobId} with expression: ${cronExpression}`);
  }

  /**
   * Cancel a scheduled job
   */
  cancelJob(jobId: string) {
    const task = this.tasks.get(jobId);
    if (task) {
      task.stop();
      this.tasks.delete(jobId);
      console.log(`🛑 Cancelled scheduled job: ${jobId}`);
    }
  }

  /**
   * Execute a scheduled job
   */
  private async executeScheduledJob(jobId: string) {
    try {
      // Fetch job details
      const job = await prisma.scheduledJob.findUnique({
        where: { id: jobId },
        include: {
          scenario: {
            include: {
              target: true,
            },
          },
        },
      });

      if (!job || !job.isEnabled) {
        console.log(`Job ${jobId} is disabled or not found, skipping execution`);
        return;
      }

      if (!job.scenario) {
        console.error(`Job ${jobId} has no associated scenario`);
        return;
      }

      // Create session
      const session = await prisma.session.create({
        data: {
          targetId: job.scenario.targetId || "",
          scenarioId: job.scenarioId,
          status: "PENDING",
          startedAt: new Date(),
          executionConfig: job.scenario.flowConfig,
        },
      });

      // Queue session for execution
      await sessionQueue.add("execute-session", {
        sessionId: session.id,
      });

      // Update job last run time
      await prisma.scheduledJob.update({
        where: { id: jobId },
        data: {
          lastRunAt: new Date(),
          nextRunAt: this.getNextRunTime(job.cronExpression),
        },
      });

      console.log(`✅ Queued session ${session.id} for scheduled job ${jobId}`);
    } catch (error) {
      console.error(`Failed to execute scheduled job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get next run time for a cron expression
   */
  private getNextRunTime(cronExpression: string): Date | null {
    try {
      // Parse cron expression to get next execution time
      // This is a simplified implementation
      // In production, you'd want a more robust cron parser
      const now = new Date();
      const nextRun = new Date(now.getTime() + 60000); // Placeholder: 1 minute from now
      return nextRun;
    } catch (error) {
      console.error("Failed to calculate next run time:", error);
      return null;
    }
  }

  /**
   * Get all scheduled tasks
   */
  getScheduledTasks(): string[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * Check if job is scheduled
   */
  isJobScheduled(jobId: string): boolean {
    return this.tasks.has(jobId);
  }

  /**
   * Shutdown scheduler
   */
  shutdown() {
    console.log("🛑 Shutting down job scheduler...");
    for (const [jobId, task] of this.tasks.entries()) {
      task.stop();
      console.log(`Stopped job: ${jobId}`);
    }
    this.tasks.clear();
  }
}

// Singleton instance
export const jobScheduler = new JobScheduler();
