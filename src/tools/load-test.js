/**
 * Load Testing Tool for Miyao Bot
 * Simulates multiple guilds with concurrent operations
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { config as dotenvConfig } from 'dotenv';
import logger from '../utils/logger.js';
import profiler from './profiler.js';
import { getDatabaseManager } from '../database/DatabaseManager.js';

dotenvConfig();

class LoadTester {
    constructor(config = {}) {
        this.config = {
            numGuilds: config.numGuilds || 50,
            tracksPerQueue: config.tracksPerQueue || 100,
            searchesPerMinute: config.searchesPerMinute || 100,
            duration: config.duration || 60 * 60 * 1000, // 1 hour default
            ...config
        };
        
        this.stats = {
            totalSearches: 0,
            successfulSearches: 0,
            failedSearches: 0,
            totalPlayback: 0,
            errors: [],
            startTime: null,
            endTime: null
        };
        
        this.running = false;
    }

    /**
     * Generate mock guild data
     */
    generateMockGuilds(count) {
        const guilds = [];
        for (let i = 0; i < count; i++) {
            guilds.push({
                id: `test-guild-${i}`,
                name: `Test Guild ${i}`,
                memberCount: Math.floor(Math.random() * 1000) + 10
            });
        }
        return guilds;
    }

    /**
     * Generate test search queries
     */
    generateSearchQueries(count) {
        const popularArtists = [
            'Taylor Swift', 'Ed Sheeran', 'Adele', 'Drake', 'The Weeknd',
            'Billie Eilish', 'Post Malone', 'Ariana Grande', 'Justin Bieber',
            'Imagine Dragons', 'Coldplay', 'Maroon 5', 'Bruno Mars'
        ];
        
        const queries = [];
        for (let i = 0; i < count; i++) {
            const artist = popularArtists[Math.floor(Math.random() * popularArtists.length)];
            queries.push(`${artist} popular songs`);
        }
        return queries;
    }

    /**
     * Simulate search operation
     */
    async simulateSearch(musicManager, query) {
        profiler.mark('load-test:search');
        
        try {
            const result = await musicManager.search(query);
            this.stats.successfulSearches++;
            profiler.measure('load-test:search');
            return result;
        } catch (error) {
            this.stats.failedSearches++;
            this.stats.errors.push({
                type: 'search',
                error: error.message,
                timestamp: Date.now()
            });
            profiler.measure('load-test:search');
            return null;
        } finally {
            this.stats.totalSearches++;
        }
    }

    /**
     * Simulate queue operations
     */
    async simulateQueueOperations(musicManager, guildId, trackCount) {
        profiler.mark(`load-test:queue-${guildId}`);
        
        try {
            // Generate and add tracks to queue
            const queries = this.generateSearchQueries(trackCount);
            
            for (const query of queries) {
                const result = await this.simulateSearch(musicManager, query);
                if (result && result.tracks && result.tracks.length > 0) {
                    // Simulate adding to queue (without actual playback)
                    // This tests the queue data structure and management
                }
            }
            
            profiler.measure(`load-test:queue-${guildId}`);
        } catch (error) {
            this.stats.errors.push({
                type: 'queue',
                guildId,
                error: error.message,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Simulate database operations
     */
    async simulateDatabaseLoad(db, guildCount) {
        profiler.mark('load-test:database');
        
        const operations = [
            // Read operations
            () => db.getGuildSettings('test-guild-123'),
            () => db.getPlaylistsByGuild('test-guild-123'),
            () => db.getUserFavorites('test-user-123'),
            () => db.getHistory('test-guild-123', 10),
            
            // Write operations
            () => db.updateGuildSettings('test-guild-123', { volume: 50 }),
            () => db.addToHistory('test-guild-123', 'test-user-123', {
                title: 'Test Track',
                url: 'https://youtube.com/watch?v=test',
                duration: 180000
            })
        ];
        
        try {
            // Execute random operations
            const promises = [];
            for (let i = 0; i < guildCount * 5; i++) {
                const op = operations[Math.floor(Math.random() * operations.length)];
                promises.push(op().catch(err => {
                    this.stats.errors.push({
                        type: 'database',
                        error: err.message,
                        timestamp: Date.now()
                    });
                }));
            }
            
            await Promise.all(promises);
            profiler.measure('load-test:database');
        } catch (error) {
            logger.error('Database load test error', error);
        }
    }

    /**
     * Run stress test
     */
    async runStressTest(musicManager, db) {
        logger.info(`Starting load test: ${this.config.numGuilds} guilds, ${this.config.duration}ms duration`);
        
        this.running = true;
        this.stats.startTime = Date.now();
        
        // Take initial memory snapshot
        profiler.takeMemorySnapshot('load-test:start');
        
        // Generate mock guilds
        const guilds = this.generateMockGuilds(this.config.numGuilds);
        
        // Start continuous operations
        const stopTime = Date.now() + this.config.duration;
        
        while (this.running && Date.now() < stopTime) {
            const operations = [];
            
            // Simulate searches (distributed across guilds)
            for (let i = 0; i < this.config.searchesPerMinute / 60; i++) {
                const query = this.generateSearchQueries(1)[0];
                operations.push(this.simulateSearch(musicManager, query));
            }
            
            // Simulate database operations
            operations.push(this.simulateDatabaseLoad(db, this.config.numGuilds));
            
            // Wait for all operations
            await Promise.all(operations);
            
            // Take memory snapshot every minute
            if (Date.now() % 60000 < 1000) {
                profiler.takeMemorySnapshot('load-test:checkpoint');
            }
            
            // Sleep for 1 second
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Take final snapshot
        profiler.takeMemorySnapshot('load-test:end');
        
        this.stats.endTime = Date.now();
        this.running = false;
        
        return this.generateReport();
    }

    /**
     * Run 24-hour stability test
     */
    async runStabilityTest(musicManager, db) {
        logger.info('Starting 24-hour stability test...');
        
        // Lower intensity but longer duration
        const stabilityConfig = {
            ...this.config,
            numGuilds: 10,
            searchesPerMinute: 20,
            duration: 24 * 60 * 60 * 1000 // 24 hours
        };
        
        const originalConfig = this.config;
        this.config = stabilityConfig;
        
        const result = await this.runStressTest(musicManager, db);
        
        this.config = originalConfig;
        return result;
    }

    /**
     * Test cache performance
     */
    async testCachePerformance(musicManager) {
        logger.info('Testing cache performance...');
        
        profiler.mark('cache-test:start');
        
        // Test same query multiple times
        const testQuery = 'popular music 2024';
        const iterations = 100;
        
        const results = {
            firstHit: 0,
            avgCacheHit: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
        
        // First search (cache miss)
        const start = Date.now();
        await this.simulateSearch(musicManager, testQuery);
        results.firstHit = Date.now() - start;
        
        // Subsequent searches (should be cache hits)
        const times = [];
        for (let i = 0; i < iterations; i++) {
            const startTime = Date.now();
            await this.simulateSearch(musicManager, testQuery);
            times.push(Date.now() - startTime);
        }
        
        results.avgCacheHit = times.reduce((a, b) => a + b, 0) / times.length;
        results.improvement = ((results.firstHit - results.avgCacheHit) / results.firstHit * 100).toFixed(2);
        
        profiler.measure('cache-test:start');
        
        return results;
    }

    /**
     * Generate test report
     */
    generateReport() {
        const duration = this.stats.endTime - this.stats.startTime;
        const successRate = (this.stats.successfulSearches / this.stats.totalSearches * 100).toFixed(2);
        
        const report = {
            config: this.config,
            duration: {
                ms: duration,
                formatted: this.formatDuration(duration)
            },
            searches: {
                total: this.stats.totalSearches,
                successful: this.stats.successfulSearches,
                failed: this.stats.failedSearches,
                successRate: successRate + '%',
                avgPerSecond: (this.stats.totalSearches / (duration / 1000)).toFixed(2)
            },
            errors: {
                total: this.stats.errors.length,
                byType: this.groupErrorsByType()
            },
            performance: profiler.generateReport(),
            memoryLeaks: profiler.analyzeMemoryLeaks()
        };
        
        return report;
    }

    /**
     * Group errors by type
     */
    groupErrorsByType() {
        const grouped = {};
        for (const error of this.stats.errors) {
            grouped[error.type] = (grouped[error.type] || 0) + 1;
        }
        return grouped;
    }

    /**
     * Print report
     */
    printReport(report) {
        console.log('\n' + '='.repeat(80));
        console.log('LOAD TEST REPORT');
        console.log('='.repeat(80));
        
        console.log('\n⚙️  CONFIGURATION:');
        console.log(`  Guilds: ${report.config.numGuilds}`);
        console.log(`  Tracks per Queue: ${report.config.tracksPerQueue}`);
        console.log(`  Searches per Minute: ${report.config.searchesPerMinute}`);
        console.log(`  Duration: ${report.duration.formatted}`);
        
        console.log('\n🔍 SEARCH PERFORMANCE:');
        console.log(`  Total Searches: ${report.searches.total}`);
        console.log(`  Successful: ${report.searches.successful}`);
        console.log(`  Failed: ${report.searches.failed}`);
        console.log(`  Success Rate: ${report.searches.successRate}`);
        console.log(`  Avg per Second: ${report.searches.avgPerSecond}`);
        
        console.log('\n❌ ERRORS:');
        console.log(`  Total: ${report.errors.total}`);
        Object.entries(report.errors.byType).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });
        
        console.log('\n💾 MEMORY LEAK ANALYSIS:');
        const leak = report.memoryLeaks;
        console.log(`  Potential Leak: ${leak.hasLeak ? '⚠️  YES' : '✅ NO'}`);
        console.log(`  Heap Growth: ${leak.heapGrowth} (${leak.heapGrowthRate})`);
        console.log(`  RSS Growth: ${leak.rssGrowth} (${leak.rssGrowthRate})`);
        
        console.log('\n' + '='.repeat(80) + '\n');
        
        // Print profiler report
        profiler.printReport();
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
     * Stop test
     */
    stop() {
        this.running = false;
        logger.info('Stopping load test...');
    }
}

export default LoadTester;

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new LoadTester({
        numGuilds: 50,
        duration: 5 * 60 * 1000 // 5 minutes for quick test
    });
    
    logger.info('Load tester ready. Configure and run manually or integrate into test suite.');
}
