import process from "node:process";

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return Math.round(sorted[idx]);
}

export class MetricsRecorder {
  constructor(label) {
    this.label = label;
    this.samples = [];
    this.statusCounts = new Map();
    this.errors = new Map();
    this.startedAt = globalThis.performance.now();
    this.endedAt = this.startedAt;
  }

  record(result) {
    this.endedAt = globalThis.performance.now();
    this.samples.push(result.latencyMs);
    const key = String(result.status);
    this.statusCounts.set(key, (this.statusCounts.get(key) ?? 0) + 1);
    if (!result.ok && result.error) {
      this.errors.set(result.error, (this.errors.get(result.error) ?? 0) + 1);
    }
  }

  summary() {
    const sorted = [...this.samples].sort((a, b) => a - b);
    const durationMs = Math.max(1, this.endedAt - this.startedAt);
    const count = sorted.length;
    const statusObj = Object.fromEntries(this.statusCounts.entries());
    const errorObj = Object.fromEntries(this.errors.entries());
    const serverErrors = [...this.statusCounts.entries()]
      .filter(([code]) => Number(code) >= 500 || code === "0")
      .reduce((sum, [, n]) => sum + n, 0);

    return {
      label: this.label,
      count,
      durationMs: Math.round(durationMs),
      rps: Number(((count / durationMs) * 1000).toFixed(1)),
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted.length ? Math.round(sorted[sorted.length - 1]) : 0,
      statuses: statusObj,
      errors: errorObj,
      serverErrors,
    };
  }
}

export function writeLine(text = "") {
  process.stdout.write(`${text}\n`);
}

export function printReport(title, recorders, checks) {
  writeLine("");
  writeLine(`=== ${title} ===`);
  for (const recorder of recorders) {
    const s = recorder.summary();
    const statuses = Object.entries(s.statuses)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    writeLine(
      `  ${s.label.padEnd(24)} n=${String(s.count).padStart(3)}  ` +
        `p50=${String(s.p50).padStart(4)}ms  p95=${String(s.p95).padStart(4)}ms  ` +
        `p99=${String(s.p99).padStart(4)}ms  max=${String(s.max).padStart(4)}ms  ` +
        `rps=${String(s.rps).padStart(5)}  [${statuses}]`
    );
    if (Object.keys(s.errors).length > 0) {
      const errSummary = Object.entries(s.errors)
        .map(([k, v]) => `${k}(${v})`)
        .join(", ");
      writeLine(`    errors: ${errSummary}`);
    }
  }
  for (const check of checks) {
    const mark = check.passed ? "PASS" : "FAIL";
    writeLine(`  [${mark}] ${check.name}: ${check.detail}`);
  }
}
