"use client";

import { useState, useEffect } from "react";
import { Loader2, MessageSquare, Clock, Coins, AlertTriangle, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StepNavigation } from "../shared/step-navigation";
import { useWizard } from "../wizard-context";

interface SessionMetrics {
  messageCount: number;
  avgResponseTimeMs: number;
  totalTokens: number;
  errorRate: number;
  status: string;
  responseTimes: number[];
}

export function StepResults() {
  const { createdSessionId, markComplete, currentStep, goNext } = useWizard();
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!createdSessionId) { setLoading(false); return; }

    let interval: ReturnType<typeof setInterval>;
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`/api/sessions/${createdSessionId}`);
        const data = await res.json();
        if (!data.success) return;

        const session = data.data;
        const summary = session.summaryMetrics || {};
        const messages = session.messages || [];

        const responseTimes = messages
          .filter((m: any) => m.responseTimeMs)
          .map((m: any) => m.responseTimeMs);

        const errorCount = messages.filter((m: any) => m.error || m.status === "error").length;

        setMetrics({
          messageCount: summary.totalMessages || messages.length,
          avgResponseTimeMs: summary.avgResponseTimeMs || (responseTimes.length > 0 ? responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length : 0),
          totalTokens: summary.totalTokens || 0,
          errorRate: messages.length > 0 ? (errorCount / messages.length) * 100 : 0,
          status: session.status,
          responseTimes,
        });

        if (session.status === "COMPLETED" || session.status === "FAILED") {
          setLoading(false);
          markComplete(currentStep);
          if (interval) clearInterval(interval);
        }
      } catch {
        setLoading(false);
      }
    };

    fetchMetrics();
    interval = setInterval(fetchMetrics, 2000);
    return () => clearInterval(interval);
  }, [createdSessionId]);

  if (!createdSessionId) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No session to show results for.</p>
          <p className="text-xs mt-1">Run a test in the previous step first.</p>
        </div>
        <StepNavigation canProceed showSkip />
      </div>
    );
  }

  if (loading && !metrics) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
          <p className="text-sm text-gray-400">Waiting for results...</p>
        </div>
      </div>
    );
  }

  const maxResponseTime = metrics?.responseTimes.length
    ? Math.max(...metrics.responseTimes)
    : 1;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100 mb-1">Results</h2>
          <p className="text-sm text-gray-500">
            {loading ? "Session still running..." : "Session complete. Here are your metrics."}
          </p>
        </div>
        <a
          href={`/sessions/${createdSessionId}`}
          className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1 transition-colors"
        >
          Full view
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Metrics cards */}
      {metrics && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="!p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-blue-400" />
                <span className="text-[10px] text-gray-500 uppercase">Messages</span>
              </div>
              <div className="text-2xl font-bold text-gray-100">{metrics.messageCount}</div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-purple-400" />
                <span className="text-[10px] text-gray-500 uppercase">Avg Response</span>
              </div>
              <div className="text-2xl font-bold text-gray-100">
                {Math.round(metrics.avgResponseTimeMs)}<span className="text-sm text-gray-500 ml-0.5">ms</span>
              </div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-center gap-2 mb-2">
                <Coins className="h-4 w-4 text-amber-400" />
                <span className="text-[10px] text-gray-500 uppercase">Tokens</span>
              </div>
              <div className="text-2xl font-bold text-gray-100">{metrics.totalTokens.toLocaleString()}</div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <span className="text-[10px] text-gray-500 uppercase">Error Rate</span>
              </div>
              <div className="text-2xl font-bold text-gray-100">
                {metrics.errorRate.toFixed(1)}<span className="text-sm text-gray-500 ml-0.5">%</span>
              </div>
            </Card>
          </div>

          {/* Response time chart */}
          {metrics.responseTimes.length > 0 && (
            <Card className="!p-4">
              <h3 className="text-xs font-medium text-gray-400 mb-3">Response Times</h3>
              <div className="flex items-end gap-1 h-32">
                {metrics.responseTimes.map((time, i) => {
                  const height = Math.max(4, (time / maxResponseTime) * 100);
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-blue-500/30 rounded-t hover:bg-blue-500/50 transition-colors relative group"
                      style={{ height: `${height}%` }}
                    >
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 whitespace-nowrap z-10">
                        {Math.round(time)}ms
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-gray-600">
                <span>Message 1</span>
                <span>Message {metrics.responseTimes.length}</span>
              </div>
            </Card>
          )}

          {/* Interpretation */}
          <Card className="!p-4">
            <h3 className="text-xs font-medium text-gray-400 mb-2">What this means</h3>
            <div className="space-y-1.5 text-xs text-gray-500">
              {metrics.avgResponseTimeMs > 0 && (
                <p>
                  Your chatbot responded in an average of{" "}
                  <span className="text-gray-300">{Math.round(metrics.avgResponseTimeMs)}ms</span>
                  {metrics.avgResponseTimeMs < 1000 ? " - within normal range." : " - this is on the slower side."}
                </p>
              )}
              <p>
                <span className="text-gray-300">{Math.round(100 - metrics.errorRate)}%</span> success rate across{" "}
                <span className="text-gray-300">{metrics.messageCount}</span> messages.
              </p>
              {metrics.totalTokens > 0 && (
                <p>
                  Total token consumption: <span className="text-gray-300">{metrics.totalTokens.toLocaleString()}</span>
                </p>
              )}
            </div>
          </Card>
        </>
      )}

      <StepNavigation
        canProceed={!loading}
        onNext={() => {
          markComplete(currentStep);
          goNext();
        }}
      />
    </div>
  );
}
