/**
 * Quality Scorer Module
 *
 * Computes multi-dimensional quality scores for chatbot responses.
 * Scoring dimensions: relevance, coherence, completeness, safety, latency.
 */

export interface QualityWeights {
  relevance: number;
  coherence: number;
  completeness: number;
  safety: number;
  latency: number;
}

export interface QualityScore {
  relevance: number; // 0-1
  coherence: number; // 0-1
  completeness: number; // 0-1
  safety: number; // 0-1
  latency: number; // 0-1
  overall: number; // weighted average 0-1
}

export interface QualityScorerConfig {
  weights?: Partial<QualityWeights>;
  targetLatencyMs?: number; // SLA target for latency scoring (default 5000)
  blocklist?: string[]; // Harmful content patterns
}

const DEFAULT_WEIGHTS: QualityWeights = {
  relevance: 0.25,
  coherence: 0.20,
  completeness: 0.20,
  safety: 0.20,
  latency: 0.15,
};

const DEFAULT_TARGET_LATENCY_MS = 5000;

const DEFAULT_BLOCKLIST = [
  "as an ai",
  "i cannot help with",
  "i'm sorry, but i can't",
  "error occurred",
  "internal server error",
  "undefined",
  "null",
];

export class QualityScorer {
  private weights: QualityWeights;
  private targetLatencyMs: number;
  private blocklist: string[];

  constructor(config: QualityScorerConfig = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...config.weights };
    this.targetLatencyMs = config.targetLatencyMs ?? DEFAULT_TARGET_LATENCY_MS;
    this.blocklist = config.blocklist ?? DEFAULT_BLOCKLIST;

    // Normalize weights so they sum to 1
    const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);
    if (sum > 0 && Math.abs(sum - 1) > 0.001) {
      for (const key of Object.keys(this.weights) as (keyof QualityWeights)[]) {
        this.weights[key] /= sum;
      }
    }
  }

  /**
   * Score a single response
   */
  score(prompt: string, response: string, responseTimeMs: number): QualityScore {
    const relevance = this.scoreRelevance(prompt, response);
    const coherence = this.scoreCoherence(response);
    const completeness = this.scoreCompleteness(prompt, response);
    const safety = this.scoreSafety(response);
    const latency = this.scoreLatency(responseTimeMs);

    const overall =
      relevance * this.weights.relevance +
      coherence * this.weights.coherence +
      completeness * this.weights.completeness +
      safety * this.weights.safety +
      latency * this.weights.latency;

    return {
      relevance: round(relevance),
      coherence: round(coherence),
      completeness: round(completeness),
      safety: round(safety),
      latency: round(latency),
      overall: round(overall),
    };
  }

  /**
   * Relevance: Does the response address the prompt?
   * Uses keyword overlap between prompt and response.
   */
  private scoreRelevance(prompt: string, response: string): number {
    const promptWords = extractKeywords(prompt);
    const responseWords = extractKeywords(response);

    if (promptWords.length === 0) return 0.5; // Neutral for empty prompts
    if (responseWords.length === 0) return 0;

    const promptSet = new Set(promptWords);
    const responseSet = new Set(responseWords);

    // Count how many prompt keywords appear in response
    let overlap = 0;
    for (const word of promptSet) {
      if (responseSet.has(word)) overlap++;
    }

    const overlapRatio = overlap / promptSet.size;

    // Scale: 0.3+ overlap is considered good relevance
    return Math.min(1, overlapRatio / 0.3);
  }

  /**
   * Coherence: Is the response internally consistent?
   * Checks for incomplete sentences, repetition, and structural issues.
   */
  private scoreCoherence(response: string): number {
    if (response.trim().length === 0) return 0;

    let score = 1.0;

    // Check for incomplete sentences (ending without punctuation)
    const sentences = response.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length > 0) {
      const lastSentence = sentences[sentences.length - 1].trim();
      if (lastSentence.length > 20 && !/[.!?:;]$/.test(response.trim())) {
        score -= 0.2; // Likely truncated
      }
    }

    // Check for excessive repetition within the response
    const words = response.toLowerCase().split(/\s+/);
    if (words.length > 10) {
      const wordFreq = new Map<string, number>();
      for (const word of words) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
      const maxFreq = Math.max(...wordFreq.values());
      const repetitionRatio = maxFreq / words.length;
      if (repetitionRatio > 0.15) {
        score -= Math.min(0.3, (repetitionRatio - 0.15) * 2);
      }
    }

    // Check for empty or near-empty response
    if (response.trim().length < 10) {
      score -= 0.3;
    }

    return Math.max(0, score);
  }

  /**
   * Completeness: Does the response fully answer the question?
   * Compares response length against question complexity.
   */
  private scoreCompleteness(prompt: string, response: string): number {
    if (response.trim().length === 0) return 0;

    const promptComplexity = estimateComplexity(prompt);
    const responseLength = response.split(/\s+/).length;

    // Expected minimum response length based on prompt complexity
    const expectedMinWords = promptComplexity * 10; // ~10 words per complexity unit

    if (expectedMinWords === 0) return 1; // Simple prompts

    const completenessRatio = responseLength / expectedMinWords;

    // Score: 1.0 if response is >= expected, scaled down for shorter responses
    return Math.min(1, completenessRatio);
  }

  /**
   * Safety: Check for harmful content patterns
   */
  private scoreSafety(response: string): number {
    const lowerResponse = response.toLowerCase();
    let violations = 0;

    for (const pattern of this.blocklist) {
      if (lowerResponse.includes(pattern.toLowerCase())) {
        violations++;
      }
    }

    if (violations === 0) return 1;

    // Each violation reduces score
    return Math.max(0, 1 - violations * 0.2);
  }

  /**
   * Latency: Score based on response time vs target SLA
   */
  private scoreLatency(responseTimeMs: number): number {
    if (responseTimeMs <= 0) return 1;
    if (responseTimeMs <= this.targetLatencyMs) return 1;

    // Linearly decrease from 1 to 0 as response time goes from target to 3x target
    const excess = responseTimeMs - this.targetLatencyMs;
    const maxExcess = this.targetLatencyMs * 2; // At 3x target, score = 0

    return Math.max(0, 1 - excess / maxExcess);
  }

  /**
   * Compute aggregate quality summary for multiple scores
   */
  static aggregate(scores: QualityScore[]): QualityScore & { count: number } {
    if (scores.length === 0) {
      return {
        relevance: 0,
        coherence: 0,
        completeness: 0,
        safety: 0,
        latency: 0,
        overall: 0,
        count: 0,
      };
    }

    const sum = {
      relevance: 0,
      coherence: 0,
      completeness: 0,
      safety: 0,
      latency: 0,
      overall: 0,
    };

    for (const score of scores) {
      sum.relevance += score.relevance;
      sum.coherence += score.coherence;
      sum.completeness += score.completeness;
      sum.safety += score.safety;
      sum.latency += score.latency;
      sum.overall += score.overall;
    }

    const n = scores.length;
    return {
      relevance: round(sum.relevance / n),
      coherence: round(sum.coherence / n),
      completeness: round(sum.completeness / n),
      safety: round(sum.safety / n),
      latency: round(sum.latency / n),
      overall: round(sum.overall / n),
      count: n,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "and", "but", "or",
  "nor", "not", "no", "so", "than", "that", "this", "these", "those",
  "it", "its", "i", "me", "my", "you", "your", "he", "she", "they",
  "we", "our", "them", "his", "her", "what", "which", "who", "when",
  "where", "how", "if", "then", "else", "about", "up", "out",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function estimateComplexity(prompt: string): number {
  const words = prompt.split(/\s+/).length;
  const hasQuestion = /\?/.test(prompt);
  const hasMultipleParts = /\band\b|\balso\b|\badditionally\b/i.test(prompt);

  let complexity = 1;
  if (words > 20) complexity++;
  if (words > 50) complexity++;
  if (hasQuestion) complexity++;
  if (hasMultipleParts) complexity++;

  return complexity;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
