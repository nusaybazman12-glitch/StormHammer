#!/usr/bin/env node

const axios = require('axios');
const { program } = require('commander');
const chalk = require('chalk');
const cliProgress = require('cli-progress');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const path = require('path');

// কনফিগারেশন ভেরিয়েবল
let stats = {
    total: 0,
    success: 0,
    failed: 0,
    errors: [],
    startTime: null,
    endTime: null,
    bytesTransferred: 0
};

// User Agents রোটেট করার জন্য
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0'
];

// প্রোগ্রাম আর্গুমেন্ট কনফিগারেশন
program
    .name('loadtester')
    .description('Advanced website load testing tool for Layer 7 performance analysis')
    .version('1.0.0')
    .requiredOption('-t, --target <url>', 'Target URL to test')
    .option('-d, --duration <seconds>', 'Test duration in seconds', '30')
    .option('-c, --connections <number>', 'Number of concurrent connections', '10')
    .option('-r, --rate <number>', 'Requests per second', '50')
    .option('-m, --method <method>', 'HTTP method (GET, POST, etc.)', 'GET')
    .option('--body <data>', 'Request body (for POST requests)')
    .option('--headers <json>', 'Custom headers in JSON format')
    .option('--proxy <url>', 'Proxy URL (e.g., http://proxy:8080)')
    .option('--timeout <ms>', 'Request timeout in milliseconds', '5000')
    .option('--no-tls-verify', 'Disable TLS/SSL verification')
    .option('--report <file>', 'Save report to file');

program.parse(process.argv);

const options = program.opts();

// মূল ফাংশন
async function main() {
    console.log(chalk.cyan('\n╔════════════════════════════════════════╗'));
    console.log(chalk.cyan('║      LoadTest - Advanced Load Tester  ║'));
    console.log(chalk.cyan('╚════════════════════════════════════════╝\n'));

    // টার্গেট যাচাই
    const target = options.target;
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
        console.log(chalk.red('❌ Error: Target must start with http:// or https://'));
        process.exit(1);
    }

    // কনফিগারেশন প্রিন্ট
    console.log(chalk.yellow('📋 Configuration:'));
    console.log(`   Target: ${chalk.green(target)}`);
    console.log(`   Duration: ${chalk.green(options.duration)} seconds`);
    console.log(`   Connections: ${chalk.green(options.connections)}`);
    console.log(`   Rate: ${chalk.green(options.rate)} req/sec`);
    console.log(`   Method: ${chalk.green(options.method)}`);
    console.log(`   Timeout: ${chalk.green(options.timeout)} ms`);
    if (options.proxy) console.log(`   Proxy: ${chalk.green(options.proxy)}`);
    console.log('');

    // অক্ষি বিন্যাস (এক্সিকিউশন)
    const duration = parseInt(options.duration);
    const connections = parseInt(options.connections);
    const rate = parseInt(options.rate);
    const timeout = parseInt(options.timeout);
    const method = options.method.toUpperCase();

    // প্রোক্সি এজেন্ট সেটআপ
    let proxyAgent = null;
    if (options.proxy) {
        proxyAgent = new HttpsProxyAgent(options.proxy);
    }

    // হেডার কনফিগারেশন
    let customHeaders = {};
    if (options.headers) {
        try {
            customHeaders = JSON.parse(options.headers);
        } catch (e) {
            console.log(chalk.red('❌ Error: Invalid JSON for headers'));
            process.exit(1);
        }
    }

    // এক্সিকিউশন শুরু
    console.log(chalk.green('🚀 Starting load test...\n'));

    stats.startTime = Date.now();

    // প্রগ্রেস বার
    const progressBar = new cliProgress.SingleBar({
        format: 'Progress |' + chalk.cyan('{bar}') + '| {percentage}% || {value}/{total} requests',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
    });

    // মোট রিকুয়েস্ট ক্যালকুলেশন (আনুমানিক)
    const totalRequests = duration * rate;
    progressBar.start(totalRequests, 0);

    // কানেকশন পুল
    const requestPool = [];
    let requestCounter = 0;

    // রিকুয়েস্ট ফাংশন
    async function sendRequest() {
        const startTime = Date.now();
        const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        
        const config = {
            method: method,
            url: target,
            timeout: timeout,
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                ...customHeaders
            },
            httpsAgent: proxyAgent,
            validateStatus: false,
            maxRedirects: 5,
            ...(options.body && { data: options.body })
        };

        if (options.noTlsVerify) {
            config.httpsAgent = new (require('https').Agent)({ rejectUnauthorized: false });
        }

        try {
            const response = await axios(config);
            const responseTime = Date.now() - startTime;

            stats.total++;
            stats.bytesTransferred += response.headers['content-length'] || 0;

            if (response.status >= 200 && response.status < 400) {
                stats.success++;
                progressBar.increment();
            } else {
                stats.failed++;
                stats.errors.push({
                    status: response.status,
                    time: responseTime,
                    url: target
                });
                progressBar.increment();
            }

            // রেসপন্স টাইম লগ (ঐচ্ছিক)
            if (responseTime > timeout * 0.8) {
                console.log(chalk.yellow(`⚠️  Slow response: ${responseTime}ms`));
            }

            return { success: true, status: response.status, time: responseTime };
        } catch (error) {
            stats.total++;
            stats.failed++;
            
            let errorMsg = error.message;
            if (error.code === 'ECONNREFUSED') errorMsg = 'Connection refused';
            else if (error.code === 'ETIMEDOUT') errorMsg = 'Timeout';
            else if (error.code === 'ENOTFOUND') errorMsg = 'DNS resolution failed';
            
            stats.errors.push({
                error: errorMsg,
                url: target,
                time: Date.now() - startTime
            });
            
            progressBar.increment();
            return { success: false, error: errorMsg };
        }
    }

    // রেট-লিমিটেড রিকুয়েস্ট জেনারেটর
    const interval = 1000 / rate; // মিলিসেকেন্ডে
    let startTime = Date.now();

    // টাইমার ভিত্তিক রিকুয়েস্ট জেনারেশন
    const requestGenerator = setInterval(() => {
        if (Date.now() - startTime > duration * 1000) {
            clearInterval(requestGenerator);
            return;
        }
        
        // কানেকশন সংখ্যা অনুযায়ী প্যারালাল রিকুয়েস্ট
        for (let i = 0; i < connections; i++) {
            if (Date.now() - startTime > duration * 1000) break;
            sendRequest().catch(() => {});
        }
    }, interval);

    // ডিউরেশন শেষ হওয়া পর্যন্ত অপেক্ষা
    await new Promise(resolve => setTimeout(resolve, duration * 1000 + 2000));
    clearInterval(requestGenerator);

    // শেষ কিছু রিকুয়েস্ট সম্পন্ন হওয়ার জন্য অপেক্ষা
    await new Promise(resolve => setTimeout(resolve, 3000));

    stats.endTime = Date.now();
    progressBar.stop();

    // রিপোর্ট জেনারেট
    generateReport();
}

// রিপোর্ট জেনারেট ফাংশন
function generateReport() {
    const totalTime = (stats.endTime - stats.startTime) / 1000;
    const successRate = stats.total > 0 ? (stats.success / stats.total * 100).toFixed(2) : 0;
    const avgRequestsPerSec = (stats.total / totalTime).toFixed(2);
    const bandwidth = stats.bytesTransferred / (totalTime * 1024); // KB/s

    console.log(chalk.cyan('\n╔════════════════════════════════════════╗'));
    console.log(chalk.cyan('║           Test Results                 ║'));
    console.log(chalk.cyan('╚════════════════════════════════════════╝\n'));

    console.log(chalk.yellow('📊 Statistics:'));
    console.log(`   Total Requests: ${chalk.white(stats.total)}`);
    console.log(`   Successful: ${chalk.green(stats.success)}`);
    console.log(`   Failed: ${chalk.red(stats.failed)}`);
    console.log(`   Success Rate: ${chalk[successRate > 90 ? 'green' : 'yellow'](successRate + '%')}`);
    console.log(`   Avg Requests/sec: ${chalk.white(avgRequestsPerSec)}`);
    console.log(`   Bandwidth: ${chalk.white(bandwidth.toFixed(2) + ' KB/s')}`);
    console.log(`   Total Time: ${chalk.white(totalTime.toFixed(2) + 's')}`);
    console.log(`   Data Transferred: ${chalk.white((stats.bytesTransferred / (1024 * 1024)).toFixed(2) + ' MB')}`);

    // এরর দেখানো (যদি থাকে)
    if (stats.errors.length > 0) {
        console.log(chalk.red('\n⚠️  Error Summary:'));
        const errorCount = {};
        stats.errors.forEach(err => {
            const key = err.status || err.error;
            errorCount[key] = (errorCount[key] || 0) + 1;
        });
        
        Object.entries(errorCount).forEach(([error, count]) => {
            console.log(`   ${error}: ${count} times`);
        });
    }

    // WAF ডিটেকশন
    if (stats.failed > stats.total * 0.3) {
        console.log(chalk.yellow('\n⚠️  Warning: High failure rate detected.'));
        console.log(chalk.yellow('   Your site might be protected by WAF/CDN.'));
        console.log(chalk.yellow('   Consider testing directly via IP or enabling dev mode.'));
    }

    console.log(chalk.green('\n✅ Test completed successfully!\n'));

    // রিপোর্ট ফাইলে সেভ
    if (options.report) {
        const report = {
            timestamp: new Date().toISOString(),
            target: options.target,
            duration: options.duration,
            connections: options.connections,
            rate: options.rate,
            totalRequests: stats.total,
            success: stats.success,
            failed: stats.failed,
            successRate: successRate,
            avgRequestsPerSec: avgRequestsPerSec,
            bandwidth: bandwidth,
            totalTime: totalTime,
            dataTransferred: stats.bytesTransferred,
            errors: stats.errors.slice(0, 100) // শুধু প্রথম ১০০টি এরর
        };

        fs.writeFileSync(options.report, JSON.stringify(report, null, 2));
        console.log(chalk.green(`📄 Report saved to: ${options.report}`));
    }
}

// এরর হ্যান্ডলিং
process.on('unhandledRejection', (err) => {
    console.log(chalk.red('❌ Unhandled error:'), err.message);
});

// মেইন ফাংশন কল
main().catch(err => {
    console.log(chalk.red('❌ Fatal error:'), err.message);
    process.exit(1);
});
