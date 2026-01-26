"use client";

import { useState, useEffect } from "react";

interface ScheduledJob {
  id: string;
  cronExpression: string;
  isEnabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  scenario: {
    name: string;
  };
}

interface ActiveSession {
  id: string;
  status: string;
  startedAt: string;
  target: {
    name: string;
  };
  scenario: {
    name: string;
  } | null;
}

export default function ActiveJobs() {
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      // Fetch scheduled jobs
      const jobsResponse = await fetch("/api/scheduled-jobs");
      const jobsData = await jobsResponse.json();
      if (jobsData.success) {
        setScheduledJobs(jobsData.data.filter((j: ScheduledJob) => j.isEnabled));
      }

      // Fetch active sessions
      const sessionsResponse = await fetch("/api/sessions?status=RUNNING&status=QUEUED&limit=10");
      const sessionsData = await sessionsResponse.json();
      if (sessionsData.success) {
        setActiveSessions(sessionsData.data);
      }
    } catch (error) {
      console.error("Failed to fetch active jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center text-gray-400 py-8">
        Loading active jobs...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scheduled Jobs */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">
          Scheduled Jobs ({scheduledJobs.length})
        </h3>

        {scheduledJobs.length === 0 ? (
          <div className="text-gray-400 text-center py-4">No scheduled jobs</div>
        ) : (
          <div className="space-y-3">
            {scheduledJobs.map((job) => (
              <div
                key={job.id}
                className="bg-gray-700/50 rounded p-4 border border-gray-600"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white">{job.scenario.name}</span>
                  <span className="text-xs bg-green-900/50 text-green-300 px-2 py-1 rounded">
                    ENABLED
                  </span>
                </div>

                <div className="text-sm text-gray-400 space-y-1">
                  <div>Schedule: <span className="text-gray-300 font-mono">{job.cronExpression}</span></div>
                  {job.lastRunAt && (
                    <div>Last run: <span className="text-gray-300">{new Date(job.lastRunAt).toLocaleString()}</span></div>
                  )}
                  {job.nextRunAt && (
                    <div>Next run: <span className="text-gray-300">{new Date(job.nextRunAt).toLocaleString()}</span></div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Sessions */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">
          Active Sessions ({activeSessions.length})
        </h3>

        {activeSessions.length === 0 ? (
          <div className="text-gray-400 text-center py-4">No active sessions</div>
        ) : (
          <div className="space-y-3">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className="bg-gray-700/50 rounded p-4 border border-gray-600"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white">{session.target.name}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      session.status === "RUNNING"
                        ? "bg-blue-900/50 text-blue-300 animate-pulse"
                        : "bg-yellow-900/50 text-yellow-300"
                    }`}
                  >
                    {session.status}
                  </span>
                </div>

                <div className="text-sm text-gray-400 space-y-1">
                  {session.scenario && (
                    <div>Scenario: <span className="text-gray-300">{session.scenario.name}</span></div>
                  )}
                  <div>Started: <span className="text-gray-300">{new Date(session.startedAt).toLocaleString()}</span></div>
                </div>

                <a
                  href={`/sessions/${session.id}`}
                  className="mt-3 inline-block text-sm text-blue-400 hover:text-blue-300"
                >
                  View live logs →
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
