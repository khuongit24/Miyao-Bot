/**
 * Performance Profiler Tool
 * Analyzes hot paths, memory usage, and bottlenecks
 */

import { performance } from 'perf_hooks';
import { createWriteStream } from 'fs';
import { resolve } from 'path';
import logger from '../utils/logger.js';

class PerformanceProfiler {
    constructor() {
        this.marks = new Map();
        this.measures = new Map();
        this.hotPaths = new Map();
        this.memorySnapshots = [];
        this.startTime = Date.now();
    }

    /**
     * Start tracking a code block
     */
    mark(label) {
        this.marks.set(label, {
            start: performance.now(),
            memory: process.memoryUsage()
        });
    }

    /**
     * End tracking and record results
     */
    measure(label) {
        const mark = this.marks.get(label);
        if (!mark) {
            logger.warn(`No mark found for: ${label}`);
            return null;
        }

        const duration = performance.now() - mark.start;
        const memoryEnd = process.memoryUsage();
        const memoryDelta = {
            heapUsed: memoryEnd.heapUsed - mark.memory.heapUsed,
            heapTotal: memoryEnd.heapTotal - mark.memory.heapTotal,
            external: memoryEnd.external - mark.memory.external,
            rss: memoryEnd.rss - mark.memory.rss
        };

        const measurement = {
            duration,
            memoryDelta,
            timestamp: Date.now()
        };

        // Store measurement
        if (!this.measures.has(label)) {
            this.measures.set(label, []);
        }
        this.measures.get(label).push(measurement);

        // Track hot paths (frequently called or slow operations)
        const hotPath = this.hotPaths.get(label) || { count: 0, totalDuration: 0, maxDuration: 0 };
        hotPath.count++;
        hotPath.totalDuration += duration;
        hotPath.maxDuration = Math.max(hotPath.maxDuration, duration);
        hotPath.avgDuration = hotPath.totalDuration / hotPath.count;
        this.hotPaths.set(label, hotPath);

        this.marks.delete(label);
        return measurement;
    }

    /**
     * Take memory snapshot
     */
    takeMemorySnapshot(label = 'snapshot') {
        const snapshot = {
            label,
            timestamp: Date.now(),
            memory: process.memoryUsage(),
            uptime: process.uptime()
        };
        this.memorySnapshots.push(snapshot);
        return snapshot;
    }

    /**
     * Analyze memory leak potential
     */
    analyzeMemoryLeaks() {
        if (this.memorySnapshots.length < 2) {
            return { hasLeak: false, message: 'Not enough snapshots' };
        }

        const first = this.memorySnapshots[0];
        const last = this.memorySnapshots[this.memorySnapshots.length - 1];
        
        const heapGrowth = last.memory.heapUsed - first.memory.heapUsed;
        const rssGrowth = last.memory.rss - first.memory.rss;
        const timeDelta = last.timestamp - first.timestamp;
        
        const heapGrowthRate = heapGrowth / (timeDelta / 1000); // bytes per second
        const rssGrowthRate = rssGrowth / (timeDelta / 1000);

        // Check if growth is concerning (>1MB per minute sustained)
        const concerningRate = (1024 * 1024) / 60; // 1MB per minute
        const hasLeak = heapGrowthRate > concerningRate;

        return {
            hasLeak,
            heapGrowth: this.formatBytes(heapGrowth),
            rssGrowth: this.formatBytes(rssGrowth),
            heapGrowthRate: this.formatBytes(heapGrowthRate) + '/s',
            rssGrowthRate: this.formatBytes(rssGrowthRate) + '/s',
            duration: this.formatDuration(timeDelta),
            snapshots: this.memorySnapshots.length
        };
    }

    /**
     * Get hot paths (most called or slowest operations)
     */
    getHotPaths(limit = 10) {
        return Array.from(this.hotPaths.entries())
            .map(([label, stats]) => ({
                label,
                ...stats,
                avgDurationMs: stats.avgDuration.toFixed(2),
                totalDurationMs: stats.totalDuration.toFixed(2),
                maxDurationMs: stats.maxDuration.toFixed(2)
            }))
            .sort((a, b) => b.totalDuration - a.totalDuration)
            .slice(0, limit);
    }

    /**
     * Get slow operations (p95, p99 latency)
     */
    getSlowOperations() {
        const slowOps = [];

        for (const [label, measurements] of this.measures.entries()) {
            const durations = measurements.map(m => m.duration).sort((a, b) => a - b);
            const count = durations.length;

            if (count === 0) continue;

            const p50 = durations[Math.floor(count * 0.5)];
            const p95 = durations[Math.floor(count * 0.95)];
            const p99 = durations[Math.floor(count * 0.99)];
            const max = durations[count - 1];

            slowOps.push({
                label,
                count,
                p50: p50.toFixed(2),
                p95: p95.toFixed(2),
                p99: p99.toFixed(2),
                max: max.toFixed(2)
            });
        }

        return slowOps.sort((a, b) => parseFloat(b.p95) - parseFloat(a.p95));
    }

    /**
     * Get memory allocations by operation
     */
    getMemoryAllocations() {
        const allocations = [];

        for (const [label, measurements] of this.measures.entries()) {
            const totalHeap = measurements.reduce((sum, m) => sum + m.memoryDelta.heapUsed, 0);
            const avgHeap = totalHeap / measurements.length;
            const maxHeap = Math.max(...measurements.map(m => m.memoryDelta.heapUsed));

            allocations.push({
                label,
                count: measurements.length,
                totalHeap: this.formatBytes(totalHeap),
                avgHeap: this.formatBytes(avgHeap),
                maxHeap: this.formatBytes(maxHeap)
            });
        }

        return allocations.sort((a, b) => 
            this.parseBytes(b.totalHeap) - this.parseBytes(a.totalHeap)
        );
    }

    /**
     * Generate comprehensive report
     */
    generateReport() {
        const report = {
            summary: {
                totalOperations: this.measures.size,
                totalMeasurements: Array.from(this.measures.values()).reduce((sum, arr) => sum + arr.length, 0),
                memorySnapshots: this.memorySnapshots.length,
                uptime: this.formatDuration(Date.now() - this.startTime)
            },
            hotPaths: this.getHotPaths(20),
            slowOperations: this.getSlowOperations(),
            memoryAllocations: this.getMemoryAllocations(),
            memoryLeakAnalysis: this.analyzeMemoryLeaks(),
            currentMemory: process.memoryUsage()
        };

        return report;
    }

    /**
     * Export report to JSON file
     */
    async exportReport(filepath = null) {
        const report = this.generateReport();
        const path = filepath || resolve(process.cwd(), `profile-${Date.now()}.json`);
        
        return new Promise((resolve, reject) => {
            const stream = createWriteStream(path);
            stream.write(JSON.stringify(report, null, 2));
            stream.end();
            
            stream.on('finish', () => {
                logger.info(`Profile report exported to: ${path}`);
                resolve(path);
            });
            
            stream.on('error', reject);
        });
    }

    /**
     * Print report to console
     */
    printReport() {
        const report = this.generateReport();

        console.log('\n' + '='.repeat(80));
        console.log('PERFORMANCE PROFILE REPORT');
        console.log('='.repeat(80));

        console.log('\n📊 SUMMARY:');
        console.log(`  Total Operations: ${report.summary.totalOperations}`);
        console.log(`  Total Measurements: ${report.summary.totalMeasurements}`);
        console.log(`  Memory Snapshots: ${report.summary.memorySnapshots}`);
        console.log(`  Uptime: ${report.summary.uptime}`);

        console.log('\n🔥 HOT PATHS (Top 10):');
        report.hotPaths.slice(0, 10).forEach((hp, i) => {
            console.log(`  ${i + 1}. ${hp.label}`);
            console.log(`     Calls: ${hp.count} | Avg: ${hp.avgDurationMs}ms | Max: ${hp.maxDurationMs}ms | Total: ${hp.totalDurationMs}ms`);
        });

        console.log('\n⏱️  SLOW OPERATIONS (Top 10):');
        report.slowOperations.slice(0, 10).forEach((so, i) => {
            console.log(`  ${i + 1}. ${so.label} (${so.count} samples)`);
            console.log(`     p50: ${so.p50}ms | p95: ${so.p95}ms | p99: ${so.p99}ms | max: ${so.max}ms`);
        });

        console.log('\n💾 MEMORY ALLOCATIONS (Top 10):');
        report.memoryAllocations.slice(0, 10).forEach((ma, i) => {
            console.log(`  ${i + 1}. ${ma.label} (${ma.count} samples)`);
            console.log(`     Total: ${ma.totalHeap} | Avg: ${ma.avgHeap} | Max: ${ma.maxHeap}`);
        });

        console.log('\n🔍 MEMORY LEAK ANALYSIS:');
        const leak = report.memoryLeakAnalysis;
        console.log(`  Potential Leak: ${leak.hasLeak ? '⚠️  YES' : '✅ NO'}`);
        console.log(`  Heap Growth: ${leak.heapGrowth} (${leak.heapGrowthRate})`);
        console.log(`  RSS Growth: ${leak.rssGrowth} (${leak.rssGrowthRate})`);
        console.log(`  Duration: ${leak.duration}`);
        console.log(`  Snapshots: ${leak.snapshots}`);

        console.log('\n📈 CURRENT MEMORY:');
        console.log(`  Heap Used: ${this.formatBytes(report.currentMemory.heapUsed)}`);
        console.log(`  Heap Total: ${this.formatBytes(report.currentMemory.heapTotal)}`);
        console.log(`  RSS: ${this.formatBytes(report.currentMemory.rss)}`);
        console.log(`  External: ${this.formatBytes(report.currentMemory.external)}`);

        console.log('\n' + '='.repeat(80) + '\n');
    }

    // Utility methods
    formatBytes(bytes) {
        const abs = Math.abs(bytes);
        const sign = bytes < 0 ? '-' : '';
        
        if (abs >= 1024 * 1024 * 1024) {
            return sign + (abs / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        }
        if (abs >= 1024 * 1024) {
            return sign + (abs / (1024 * 1024)).toFixed(2) + ' MB';
        }
        if (abs >= 1024) {
            return sign + (abs / 1024).toFixed(2) + ' KB';
        }
        return sign + abs + ' B';
    }

    parseBytes(str) {
        const match = str.match(/([\d.]+)\s*(GB|MB|KB|B)/);
        if (!match) return 0;
        
        const value = parseFloat(match[1]);
        const unit = match[2];
        
        const multipliers = { GB: 1024**3, MB: 1024**2, KB: 1024, B: 1 };
        return value * multipliers[unit];
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        }
        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    }

    /**
     * Reset profiler
     */
    reset() {
        this.marks.clear();
        this.measures.clear();
        this.hotPaths.clear();
        this.memorySnapshots = [];
        this.startTime = Date.now();
    }
}

// Singleton instance
const profiler = new PerformanceProfiler();

// Auto-snapshot every 5 minutes
setInterval(() => {
    profiler.takeMemorySnapshot('auto');
}, 5 * 60 * 1000);

export default profiler;
