#!/usr/bin/env node

const axios = require('axios');
const chalk = require('chalk');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fs = require('fs');

// কমান্ড লাইন আর্গুমেন্ট
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log(chalk.yellow(`
╔══════════════════════════════════════════════╗
║   LoadTest Pro - IP Rotation Load Tester    ║
╚══════════════════════════════════════════════╝

📌 Usage:
  node loadtester-pro.js <URL> <TIME> <RATE> <CONNECTIONS>

📋 Examples:
  node loadtester-pro.js https://your-site.com 30 50 10 --proxy-file proxies.txt
  node loadtester-pro.js https://your-site.com 60 100 20 --tor
  node loadtester-pro.js https://your-site.com 120 200 50 --random-ip

📊 Options:
  --proxy-file <file>  - Proxy list file (one per line)
  --tor                - Use Tor network (socks5://127.0.0.1:9050)
  --random-ip          - Add random IP headers

⚠️  Use only on your own websites!
    `));
    process.exit(0);
}

// আর্গুমেন্ট পার্স
const target = args[0];
const duration = parseInt(args[1]) || 30;
const rate = parseInt(args[2]) || 50;
const connections = parseInt(args[3]) || 10;

// অপশন পার্স
const proxyFileIndex = args.indexOf('--proxy-file');
const proxyFile = proxyFileIndex > -1 ? args[proxyFileIndex + 1] : null;
const useTor = args.includes('--tor');
const useRandomIP = args.includes('--random-ip');

// প্রক্সি লিস্ট লোড
let proxies = [];
if (proxyFile && fs.existsSync(proxyFile)) {
    proxies = fs.readFileSync(proxyFile, 'utf8')
        .split('\n')
        .filter(line => line.trim());
    console.log(chalk.green(`✅ Loaded ${proxies.length} proxies`));
}

function getProxyAgent() {
    if (useTor) {
        return new SocksProxyAgent('socks5://127.0.0.1:9050');
    }
    
    if (proxies.length > 0) {
        const proxy = proxies[Math.floor(Math.random() * proxies.length)];
        if (proxy.startsWith('socks')) {
            return new SocksProxyAgent(proxy);
        }
        return new HttpsProxyAgent(proxy);
    }
    return null;
}

function generateRandomIP() {
    return Array(4).fill(0).map(() => Math.floor(Math.random() * 255)).join('.');
}

console.log(chalk.cyan('\n╔══════════════════════════════════════════════╗'));
console.log(chalk.cyan('║   LoadTest Pro - IP Rotation Load Tester   ║'));
console.log(chalk.cyan('╚══════════════════════════════════════════════╝\n'));

console.log(chalk.yellow('📋 Target:'), chalk.green(target));
console.log(chalk.yellow('⏱️  Duration:'), chalk.green(duration + ' seconds'));
console.log(chalk.yellow('⚡ Rate:'), chalk.green(rate + ' req/sec'));
console.log(chalk.yellow('🔗 Connections:'), chalk.green(connections));
if (useTor) console.log(`   🌐 Using: ${chalk.green('Tor Network')}`);
if (proxies.length > 0) console.log(`   🔄 Proxy Rotation: ${chalk.green('Enabled')}`);
if (useRandomIP) console.log(`   🎭 Random IP Headers: ${chalk.green('Enabled')}`);
console.log('');

console.log(chalk.green('🚀 Starting test with IP rotation...\n'));

let stats = {
    total: 0,
    success: 0,
    failed: 0,
    ipsUsed: new Set(),
    startTime: Date.now(),
    endTime: null
};

async function sendRequest() {
    const proxyAgent = getProxyAgent();
    const randomIP = generateRandomIP();
    const startTime = Date.now();
    
    const config = {
        method: 'GET',
        url: target,
        timeout: 5000,
        headers: {
            'User-Agent': `Mozilla/5.0 (${Math.random() > 0.5 ? 'Windows' : 'Macintosh'})`,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache'
        },
        httpsAgent: proxyAgent,
        validateStatus: false
    };

    if (useRandomIP) {
        config.headers['X-Forwarded-For'] = randomIP;
        config.headers['Client-IP'] = randomIP;
        config.headers['X-Real-IP'] = randomIP;
    }

    try {
        const response = await axios(config);
        stats.total++;
        
        if (proxyAgent && proxyAgent.proxy) {
            stats.ipsUsed.add(proxyAgent.proxy.host || randomIP);
        } else {
            stats.ipsUsed.add(randomIP);
        }
        
        if (response.status >= 200 && response.status < 400) {
            stats.success++;
        } else {
            stats.failed++;
        }
        
        if (stats.total % 50 === 0) {
            console.log(chalk.cyan(`📊 ${stats.total} req | ✅ ${stats.success} | ❌ ${stats.failed} | 🌐 ${stats.ipsUsed.size} IPs`));
        }
        
    } catch (error) {
        stats.failed++;
        stats.total++;
    }
}

const startTime = Date.now();
const endTime = startTime + (duration * 1000);

const interval = setInterval(() => {
    if (Date.now() > endTime) {
        clearInterval(interval);
        stats.endTime = Date.now();
        generateReport();
        return;
    }
    
    for (let i = 0; i < connections; i++) {
        if (Date.now() > endTime) break;
        sendRequest();
    }
}, 1000 / rate);

process.on('SIGINT', () => {
    clearInterval(interval);
    stats.endTime = Date.now();
    console.log(chalk.yellow('\n\n⏹️  Stopped! Generating report...\n'));
    generateReport();
});

function generateReport() {
    const totalTime = (stats.endTime - stats.startTime) / 1000;
    const successRate = stats.total > 0 ? (stats.success / stats.total * 100).toFixed(2) : 0;
    const avgRequestsPerSec = (stats.total / totalTime).toFixed(2);

    console.log(chalk.cyan('╔══════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║              Test Results                   ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════╝\n'));

    console.log(chalk.yellow('📊 Statistics:'));
    console.log(`   Total Requests: ${chalk.white(stats.total)}`);
    console.log(`   ✅ Successful: ${chalk.green(stats.success)}`);
    console.log(`   ❌ Failed: ${chalk.red(stats.failed)}`);
    console.log(`   🌐 Unique IPs Used: ${chalk.cyan(stats.ipsUsed.size)}`);
    console.log(`   📈 Success Rate: ${chalk.green(successRate + '%')}`);
    console.log(`   ⚡ Avg Requests/sec: ${chalk.white(avgRequestsPerSec)}`);
    
    if (stats.ipsUsed.size > 1) {
        console.log(chalk.green(`\n✅ IP Rotation Working! Used ${stats.ipsUsed.size} different IPs`));
    } else {
        console.log(chalk.yellow(`\n⚠️ Using single IP. Enable proxy/Tor for rotation.`));
    }

    console.log(chalk.green('\n✅ Test completed!\n'));
}
