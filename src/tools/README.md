# Performance & Testing Tools

This directory contains tools for profiling, load testing, and performance analysis.

## 🔧 Available Tools

### 1. **profiler.js** - Performance Profiler

Comprehensive performance profiling tool that tracks hot paths, memory usage, and latency metrics.

**Features:**
- Hot path detection (most frequently called or slowest operations)
- Memory leak analysis
- Latency percentiles (p50, p95, p99)
- Automatic memory snapshots every 5 minutes
- Detailed reporting

**Usage:**

```javascript
import profiler from './tools/profiler.js';

// Mark start of operation
profiler.mark('my-operation');

// ... your code ...

// Measure and record
const measurement = profiler.measure('my-operation');

// Take memory snapshot
profiler.takeMemorySnapshot('checkpoint-1');

// Generate report
const report = profiler.generateReport();
profiler.printReport();

// Export to file
await profiler.exportReport('./profile-report.json');
```

**Metrics Provided:**
- Total operations and measurements
- Hot paths (top functions by total time)
- Slow operations (p50/p95/p99 latency)
- Memory allocations per operation
- Memory leak analysis
- Current memory usage

### 2. **load-test.js** - Load Testing Framework

Production-ready load testing tool for simulating concurrent guilds and operations.

**Features:**
- Simulate multiple concurrent guilds
- Configurable track queue sizes
- Search cache performance testing
- 24-hour stability testing support
- Database load simulation
- Comprehensive reporting

**Usage:**

```javascript
import LoadTester from './tools/load-test.js';
import MusicManager from '../src/music/MusicManager.js';
import { getDatabaseManager } from '../src/database/DatabaseManager.js';

// Initialize
const musicManager = new MusicManager(client, config);
const database = getDatabaseManager();

// Configure load test
const tester = new LoadTester({
    numGuilds: 50,              // Number of guilds to simulate
    tracksPerQueue: 100,        // Tracks per queue
    searchesPerMinute: 100,     // Search operations per minute
    duration: 60 * 60 * 1000    // Test duration (1 hour)
});

// Run stress test
const report = await tester.runStressTest(musicManager, database);
tester.printReport(report);

// Or run 24-hour stability test
const stabilityReport = await tester.runStabilityTest(musicManager, database);

// Test cache performance
const cacheReport = await tester.testCachePerformance(musicManager);
```

**Metrics Provided:**
- Total searches (successful/failed)
- Success rate percentage
- Average searches per second
- Error breakdown by type
- Memory leak analysis
- Hot paths from profiler

---

## 📊 Example Workflows

### Performance Analysis

```javascript
// 1. Start profiling
import profiler from './tools/profiler.js';

// 2. Run your application normally
// Profiler automatically tracks marked operations

// 3. After some time, generate report
setTimeout(() => {
    const report = profiler.generateReport();
    
    // Print to console
    profiler.printReport();
    
    // Or export to file
    await profiler.exportReport('./reports/profile-' + Date.now() + '.json');
}, 60000); // After 1 minute
```

### Load Testing

```javascript
import LoadTester from './tools/load-test.js';

// Quick 5-minute test
const tester = new LoadTester({
    numGuilds: 10,
    duration: 5 * 60 * 1000
});

const report = await tester.runStressTest(musicManager, database);
tester.printReport(report);
```

### Memory Leak Detection

```javascript
import profiler from './tools/profiler.js';

// Take snapshots periodically
setInterval(() => {
    profiler.takeMemorySnapshot('periodic-check');
    
    // Analyze for leaks
    const leakAnalysis = profiler.analyzeMemoryLeaks();
    
    if (leakAnalysis.hasLeak) {
        console.error('Memory leak detected!', leakAnalysis);
    }
}, 10 * 60 * 1000); // Every 10 minutes
```

### Cache Performance Testing

```javascript
const tester = new LoadTester();
const cacheReport = await tester.testCachePerformance(musicManager);

console.log('First hit (cache miss):', cacheReport.firstHit, 'ms');
console.log('Average cache hit:', cacheReport.avgCacheHit, 'ms');
console.log('Improvement:', cacheReport.improvement, '%');
```

---

## 🎯 Best Practices

### 1. Regular Profiling
- Run profiler during development to catch performance regressions early
- Take snapshots before and after major changes
- Keep historical profiles for comparison

### 2. Continuous Load Testing
- Run load tests before each release
- Test with realistic data (actual track counts, search patterns)
- Monitor long-term stability (24-hour tests)

### 3. Memory Monitoring
- Check for leaks after major features
- Monitor production memory usage trends
- Take action if growth rate exceeds 1MB/minute

### 4. Baseline Comparison
- Always compare against established baselines
- Document performance improvements/regressions
- Update baselines after significant optimizations

---

## 📈 Integration with CI/CD

### GitHub Actions Example

```yaml
name: Performance Tests

on:
  pull_request:
    branches: [ main, development ]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run load tests
        run: node tools/load-test.js --duration 60000 --guilds 10
      
      - name: Check memory leaks
        run: node -e "import('./tools/profiler.js').then(p => p.default.analyzeMemoryLeaks())"
      
      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: performance-reports
          path: ./profile-*.json
```

---

## 🔍 Troubleshooting

### High Memory Usage
1. Check profiler for hot paths consuming memory
2. Review memory allocation report
3. Look for objects that aren't being cleaned up
4. Use WeakRefManager for temporary objects

### Slow Operations
1. Check profiler's slow operations report
2. Look at p95/p99 latencies
3. Identify bottlenecks in hot paths
4. Consider caching or optimization

### Memory Leaks
1. Run profiler for extended period
2. Check leak analysis (growth rate)
3. Review event listeners and timers
4. Use resource leak detector

---

## 📚 Additional Resources

- **Performance Guide:** `docs/performance/`
- **Technical Debt:** `docs/TECHNICAL_DEBT.md`
- **Phase 0 Report:** `docs/performance/Phase0-Completion-Report.md`

---

## 🤝 Contributing

When adding new tools:
1. Follow existing code style
2. Add comprehensive documentation
3. Include usage examples
4. Add tests if applicable
5. Update this README

---

**Last Updated:** October 7, 2025  
**Version:** v1.6.2
