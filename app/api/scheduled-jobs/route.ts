import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { jobScheduler } from "@/lib/jobs/scheduler";
import { z } from "zod";
import cron from "node-cron";

const CreateScheduledJobSchema = z.object({
  scenarioId: z.string().cuid(),
  cronExpression: z.string(),
  timezone: z.string().optional(),
  isEnabled: z.boolean().optional(),
});

const UpdateScheduledJobSchema = z.object({
  cronExpression: z.string().optional(),
  timezone: z.string().optional(),
  isEnabled: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scenarioId = searchParams.get("scenarioId");

    const where: any = {};
    if (scenarioId) {
      where.scenarioId = scenarioId;
    }

    const jobs = await prisma.scheduledJob.findMany({
      where,
      include: {
        scenario: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      data: jobs,
    });
  } catch (error) {
    console.error("Failed to fetch scheduled jobs:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch scheduled jobs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = CreateScheduledJobSchema.parse(body);

    // Validate cron expression
    if (!cron.validate(data.cronExpression)) {
      return NextResponse.json(
        { success: false, error: "Invalid cron expression" },
        { status: 400 }
      );
    }

    // Check if scenario exists
    const scenario = await prisma.scenario.findUnique({
      where: { id: data.scenarioId },
    });

    if (!scenario) {
      return NextResponse.json(
        { success: false, error: "Scenario not found" },
        { status: 404 }
      );
    }

    // Create scheduled job
    const job = await prisma.scheduledJob.create({
      data: {
        scenarioId: data.scenarioId,
        cronExpression: data.cronExpression,
        timezone: data.timezone || "UTC",
        isEnabled: data.isEnabled ?? true,
        nextRunAt: new Date(Date.now() + 60000), // Placeholder
      },
      include: {
        scenario: {
          select: {
            name: true,
          },
        },
      },
    });

    // Schedule the job if enabled
    if (job.isEnabled) {
      jobScheduler.scheduleJob(job.id, job.cronExpression, async () => {
        // Job execution is handled by the scheduler
      });
    }

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Failed to create scheduled job:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create scheduled job" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("id");

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "Job ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const data = UpdateScheduledJobSchema.parse(body);

    // Validate cron expression if provided
    if (data.cronExpression && !cron.validate(data.cronExpression)) {
      return NextResponse.json(
        { success: false, error: "Invalid cron expression" },
        { status: 400 }
      );
    }

    // Update job
    const job = await prisma.scheduledJob.update({
      where: { id: jobId },
      data: {
        ...data,
        nextRunAt: data.cronExpression ? new Date(Date.now() + 60000) : undefined,
      },
      include: {
        scenario: {
          select: {
            name: true,
          },
        },
      },
    });

    // Reschedule if enabled and cron expression changed
    if (job.isEnabled) {
      jobScheduler.scheduleJob(job.id, job.cronExpression, async () => {
        // Job execution is handled by the scheduler
      });
    } else {
      jobScheduler.cancelJob(job.id);
    }

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Failed to update scheduled job:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update scheduled job" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("id");

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "Job ID is required" },
        { status: 400 }
      );
    }

    // Cancel scheduled task
    jobScheduler.cancelJob(jobId);

    // Delete from database
    await prisma.scheduledJob.delete({
      where: { id: jobId },
    });

    return NextResponse.json({
      success: true,
      message: "Scheduled job deleted successfully",
    });
  } catch (error) {
    console.error("Failed to delete scheduled job:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete scheduled job" },
      { status: 500 }
    );
  }
}
