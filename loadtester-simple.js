#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs');

// কমান্ড লাইন আর্গুমেন্ট নেওয়া
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log(chalk.yellow(`
╔══════════════════════════════════════════════╗
║     LoadTest v3.0 - Simple Load Tester      ║
╚══════════════════════════════════════════════╝

📌 Usage:
  node loadtester-simple.js <URL> <TIME> <RATE> <CONNECTIONS>

📋 Examples:
  node loadtester-simple.js https://your-site.com 30 50 10
  node loadtester-simple.js https://your-site.com 60 100 20
  node loadtester-simple.js https://your-site.com 120 200 50

📊 Parameters:
  URL         - Target website (required)
  TIME        - Duration in seconds (default: 30)
  RATE        - Requests per second (default: 50)
  CONNECTIONS - Concurrent connections (default: 10)

⚠️  Use only on your own websites!
    `));
    process.exit(0);
}

// আর্গুমেন্ট পার্স
const target = args[0];
const duration = parseInt(args[1]) || 30;
const rate = parseInt(args[2]) || 50;
const connections = parseInt(args[3]) || 10;

// User Agents
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
];

// স্ট্যাটস
let stats = {
    total: 0,
    success: 0,
    failed: 0,
    errors: [],
    responseTimes: [],
    startTime: null,
    endTime: null
};

// হেডার প্রিন্ট
console.log(chalk.cyan('\n╔══════════════════════════════════════════════╗'));
console.log(chalk.cyan('║     LoadTest v3.0 - Simple Load Tester     ║'));
console.log(chalk.cyan('╚══════════════════════════════════════════════╝\n'));

console.log(chalk.yellow('📋 Target:'), chalk.green(target));
console.log(chalk.yellow('⏱️  Duration:'), chalk.green(duration + ' seconds'));
console.log(chalk.yellow('⚡ Rate:'), chalk.green(rate + ' req/sec'));
console.log(chalk.yellow('🔗 Connections:'), chalk.green(connections));
console.log('');

console.log(chalk.green('🚀 Starting attack... Press Ctrl+C to stop\n'));

stats.startTime = Date.now();

// রিকুয়েস্ট ফাংশন
async function sendRequest() {
    const startTime = Date.now();
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    // র্যান্ডম প্যারামিটার (ক্যাশে বাইপাস)
    const randomParam = `_=${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const url = target + (target.includes('?') ? '&' : '?') + randomParam;
    
    const config = {
        method: 'GET',
        url: url,
        timeout: 5000,
        headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        },
        validateStatus: false
    };

    try {
        const response = await axios(config);
        const responseTime = Date.now() - startTime;
        
        stats.total++;
        stats.responseTimes.push(responseTime);
        
        if (response.status >= 200 && response.status < 400) {
            stats.success++;
        } else {
            stats.failed++;
            stats.errors.push({
                status: response.status,
                time: responseTime
            });
        }
        
        // প্রতি ৫০ রিকুয়েস্টে স্ট্যাটাস দেখান
        if (stats.total % 50 === 0) {
            const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
            console.log(chalk.cyan(`📊 ${stats.total} req | ✅ ${stats.success} | ❌ ${stats.failed} | ⏱️ ${elapsed}s`));
        }
        
    } catch (error) {
        stats.total++;
        stats.failed++;
        stats.errors.push({
            error: error.message,
            time: Date.now() - startTime
        });
    }
}

// টেস্ট রান
const startTime = Date.now();
const endTime = startTime + (duration * 1000);

// রিকুয়েস্ট জেনারেটর
const interval = setInterval(() => {
    if (Date.now() > endTime) {
        clearInterval(interval);
        console.log(chalk.yellow('\n⏱️  Time\'s up! Generating report...\n'));
        stats.endTime = Date.now();
        generateReport();
        return;
    }
    
    for (let i = 0; i < connections; i++) {
        if (Date.now() > endTime) break;
        sendRequest();
    }
}, 1000 / rate);

// Ctrl+C হ্যান্ডলিং
process.on('SIGINT', () => {
    clearInterval(interval);
    stats.endTime = Date.now();
    console.log(chalk.yellow('\n\n⏹️  Stopped by user! Generating report...\n'));
    generateReport();
});

// রিপোর্ট ফাংশন
function generateReport() {
    const totalTime = (stats.endTime - stats.startTime) / 1000;
    const successRate = stats.total > 0 ? (stats.success / stats.total * 100).toFixed(2) : 0;
    const avgRequestsPerSec = (stats.total / totalTime).toFixed(2);
    
    // রেসপন্স টাইম
    let avgResponseTime = 0;
    let minResponseTime = 0;
    let maxResponseTime = 0;
    
    if (stats.responseTimes.length > 0) {
        const sorted = stats.responseTimes.sort((a, b) => a - b);
        avgResponseTime = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        minResponseTime = sorted[0];
        maxResponseTime = sorted[sorted.length - 1];
    }

    console.log(chalk.cyan('╔══════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║              Test Results                   ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════╝\n'));

    console.log(chalk.yellow('📊 Statistics:'));
    console.log(`   Target: ${chalk.white(target)}`);
    console.log(`   Duration: ${chalk.white(totalTime.toFixed(2) + 's')}`);
    console.log(`   Total Requests: ${chalk.white(stats.total.toLocaleString())}`);
    console.log(`   ✅ Successful: ${chalk.green(stats.success.toLocaleString())}`);
    console.log(`   ❌ Failed: ${chalk.red(stats.failed.toLocaleString())}`);
    console.log(`   📈 Success Rate: ${chalk[successRate > 90 ? 'green' : 'yellow'](successRate + '%')}`);
    console.log(`   ⚡ Avg Requests/sec: ${chalk.white(avgRequestsPerSec)}`);
    
    console.log(chalk.yellow('\n⏱️  Response Times:'));
    console.log(`   Average: ${chalk.white(avgResponseTime.toFixed(2) + ' ms')}`);
    console.log(`   Minimum: ${chalk.green(minResponseTime.toFixed(2) + ' ms')}`);
    console.log(`   Maximum: ${chalk.red(maxResponseTime.toFixed(2) + ' ms')}`);

    // এরর সামারি
    if (stats.errors.length > 0) {
        console.log(chalk.red('\n⚠️  Errors:'));
        const errorCount = {};
        stats.errors.slice(0, 20).forEach(err => {
            const key = err.status || err.error;
            errorCount[key] = (errorCount[key] || 0) + 1;
        });
        
        Object.entries(errorCount).slice(0, 5).forEach(([error, count]) => {
            console.log(`   ${error}: ${count} times`);
        });
        
        if (stats.errors.length > 20) {
            console.log(`   ... and ${stats.errors.length - 20} more errors`);
        }
    }

    // WAF ডিটেকশন
    if (stats.failed > stats.total * 0.3) {
        console.log(chalk.yellow('\n⚠️  Warning: High failure rate detected!'));
        console.log(chalk.yellow('   Your site might be protected by WAF/CDN.'));
        console.log(chalk.yellow('   💡 Tip: Enable dev mode or test via IP.'));
    }

    // সার্ভার হেলথ
    if (avgResponseTime > 1000) {
        console.log(chalk.red('\n⚠️  Server is responding slowly!'));
        console.log(chalk.red(`   Average: ${avgResponseTime.toFixed(0)}ms > 1000ms`));
    } else if (avgResponseTime > 500) {
        console.log(chalk.yellow('\n⚠️  Server response is moderate.'));
        console.log(chalk.yellow(`   Average: ${avgResponseTime.toFixed(0)}ms`));
    } else {
        console.log(chalk.green('\n✅ Server is responding fast!'));
        console.log(chalk.green(`   Average: ${avgResponseTime.toFixed(0)}ms`));
    }

    console.log(chalk.green('\n✅ Test completed!\n'));

    // অটো রিপোর্ট সেভ
    try {
        if (!fs.existsSync('reports')) {
            fs.mkdirSync('reports');
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportFile = `reports/report-${timestamp}.json`;
        
        const report = {
            timestamp: new Date().toISOString(),
            target: target,
            config: { 
                duration: duration, 
                rate: rate, 
                connections: connections 
            },
            results: {
                totalRequests: stats.total,
                success: stats.success,
                failed: stats.failed,
                successRate: parseFloat(successRate),
                avgRequestsPerSec: parseFloat(avgRequestsPerSec),
                totalTime: parseFloat(totalTime),
                avgResponseTime: parseFloat(avgResponseTime),
                minResponseTime: parseFloat(minResponseTime),
                maxResponseTime: parseFloat(maxResponseTime)
            },
            errors: stats.errors.slice(0, 50)
        };
        
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
        console.log(chalk.green(`📄 Report saved: ${reportFile}`));
    } catch (err) {
        console.log(chalk.yellow(`⚠️ Could not save report: ${err.message}`));
    }
}
