const http = require('http');
const os = require('os');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const metrics = {
    requestsTotal: new Map() // key: 'method:endpoint:status' -> count
};

const log = (level, message, meta = {}) => {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...meta
    }));
};

const rawPort = parseInt(process.env.PORT);
const PORT = !isNaN(rawPort) && rawPort > 0 ? rawPort : 3002;

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['*'];

const sendError = (res, statusCode, message, headers = {}) => {
    log('warn', `HTTP error response: ${message}`, { statusCode });
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        ...headers
    });
    res.end(JSON.stringify({ error: message }));
};

const CONTAINER_PATHS = {
    'homeserver-fe': '/homeserver/apps/homeserver/fe-homeserver',
    'homeserver-be': '/homeserver/apps/homeserver/be-homeserver',
    'twc-fe': '/homeserver/apps/the-wine-corner/fe-the-wine-corner',
    'twc-be': '/homeserver/apps/the-wine-corner/be-the-wine-corner',
    'yp-fe': '/homeserver/apps/your-places/fe-your-places',
    'yp-be': '/homeserver/apps/your-places/be-your-places'
};

const getGitBranch = (targetPath) => {
    try {
        let resolvedPath = targetPath;
        if (path.isAbsolute(targetPath)) {
            // Local fallback logic
            if (!fs.existsSync('/homeserver') && targetPath.startsWith('/homeserver/')) {
                const workspaceRoot = path.resolve(__dirname, '../../..');
                resolvedPath = targetPath.replace(/^\/homeserver/, workspaceRoot);
            }
        } else {
            resolvedPath = path.resolve(__dirname, targetPath);
        }

        const gitHeadPath = path.join(resolvedPath, '.git', 'HEAD');
        if (!fs.existsSync(gitHeadPath)) return null;
        const data = fs.readFileSync(gitHeadPath, 'utf8').trim();
        if (data.startsWith('ref: refs/heads/')) {
            return data.replace('ref: refs/heads/', '');
        } else {
            return data.substring(0, 7);
        }
    } catch (e) {
        return null;
    }
};

const runCmd = (cmd, timeoutMs = 5000) => new Promise(resolve => {
    exec(cmd, { timeout: timeoutMs }, (error, stdout, stderr) => {
        if (error) {
            log('error', `Command failed: ${cmd}`, { error: error.message, stderr });
            resolve(null);
        } else {
            resolve(stdout.trim());
        }
    });
});

// Simple memory-based Rate Limiting implementation
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per window (safe for multiple tabs & refreshes)

const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress;
};

const checkRateLimit = (req, res) => {
    const ip = getClientIp(req);
    const now = Date.now();

    if (!rateLimitStore.has(ip)) {
        rateLimitStore.set(ip, []);
    }

    const timestamps = rateLimitStore.get(ip);
    const active = timestamps.filter(time => now - time < RATE_LIMIT_WINDOW_MS);

    if (active.length >= RATE_LIMIT_MAX) {
        rateLimitStore.set(ip, active);
        const oldestActive = active[0];
        const resetTimeMs = oldestActive + RATE_LIMIT_WINDOW_MS;
        const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));

        sendError(res, 429, 'Too many requests, please try again later.', {
            'Retry-After': String(retryAfterSeconds)
        });
        return false;
    }

    active.push(now);
    rateLimitStore.set(ip, active);
    return true;
};

// Periodic memory cleanup of rate limit store to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of rateLimitStore.entries()) {
        const active = timestamps.filter(time => now - time < RATE_LIMIT_WINDOW_MS);
        if (active.length === 0) {
            rateLimitStore.delete(ip);
        } else {
            rateLimitStore.set(ip, active);
        }
    }
}, 60000).unref();

const getContainerGroup = (name) => {
    const lower = name.toLowerCase();
    if (lower.includes('db-') || lower.includes('postgres') || lower.includes('mysql') || lower.includes('mongo') || lower.includes('redis') || lower.includes('mariadb')) {
        return 'database';
    }
    if (lower.includes('monitoring') || lower.includes('prometheus') || lower.includes('grafana') || lower.includes('loki') || lower.includes('promtail') || lower.includes('cadvisor') || lower.includes('node-exporter') || lower.includes('nginx-exporter')) {
        return 'monitoring';
    }
    if (lower.includes('infra-') || lower.includes('nginx') || lower.includes('portainer') || lower.includes('watchtower')) {
        return 'infra';
    }
    if (lower.includes('media-') || lower.includes('jellyfin') || lower.includes('plex') || lower.includes('openinary')) {
        return 'media';
    }
    return 'app';
};

let cachedDockerStats = null;
let lastDockerStatsFetchTime = 0;
const CACHE_DURATION_MS = 5000; // 5 seconds cache
let activeDockerStatsPromise = null;

const fetchDockerStatsAndCache = async () => {
    const now = Date.now();
    if (cachedDockerStats && (now - lastDockerStatsFetchTime < CACHE_DURATION_MS)) {
        return cachedDockerStats;
    }
    
    if (activeDockerStatsPromise) {
        return activeDockerStatsPromise;
    }
    
    activeDockerStatsPromise = (async () => {
        try {
            const [statsOut, psOut] = await Promise.all([
                runCmd("docker stats --no-stream --format '{{json .}}'"),
                runCmd("docker ps -a --format '{\"Name\":\"{{.Names}}\", \"Status\":\"{{.Status}}\"}'")
            ]);
            
            if (!statsOut) {
                throw new Error('Failed to fetch docker stats');
            }
            
            const stats = statsOut.split('\n').filter(Boolean).map(JSON.parse);
            const psInfo = psOut ? psOut.split('\n').filter(Boolean).map(JSON.parse) : [];
            
            stats.forEach(stat => {
                const psMatch = psInfo.find(p => p.Name === stat.Name);
                stat.Status = psMatch ? psMatch.Status : 'Unknown';
                
                // Grouping
                stat.Group = getContainerGroup(stat.Name);
                
                // Attach git branch if it's a public app
                const nameLower = stat.Name.toLowerCase();
                const pathKey = Object.keys(CONTAINER_PATHS).find(k => nameLower.includes(k.toLowerCase()));
                if (pathKey) {
                    const branch = getGitBranch(CONTAINER_PATHS[pathKey]);
                    if (branch) {
                        stat.Branch = branch;
                    }
                }
            });
            
            cachedDockerStats = stats;
            lastDockerStatsFetchTime = Date.now();
            return stats;
        } catch (e) {
            // Invalidate cache on error to prevent stale data from being served
            cachedDockerStats = null;
            lastDockerStatsFetchTime = 0;
            throw e;
        } finally {
            activeDockerStatsPromise = null;
        }
    })();
    
    return activeDockerStatsPromise;
};

const requestLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        log('info', 'HTTP request', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            durationMs: duration,
            ip: getClientIp(req)
        });
        
        // Track metric
        const endpoint = req.url.split('?')[0];
        const key = `${req.method}:${endpoint}:${res.statusCode}`;
        metrics.requestsTotal.set(key, (metrics.requestsTotal.get(key) || 0) + 1);
    });
    next();
};

const server = http.createServer((req, res) => {
    requestLogger(req, res, async () => {
        const origin = req.headers.origin;
        if (ALLOWED_ORIGINS.includes('*')) {
            res.setHeader('Access-Control-Allow-Origin', '*');
        } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
        }

        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.writeHead(204);
            res.end();
            return;
        }

        res.setHeader('Content-Type', 'application/json');

        if (req.url === '/vitals') {
            if (!checkRateLimit(req, res)) return;
            const load = os.loadavg();
            const cpus = os.cpus().length;
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;

            const [diskOut, tempOut] = await Promise.all([
                runCmd("df -h / | awk 'NR==2 {print $5}'"),
                runCmd("cat /sys/class/hwmon/hwmon*/temp1_input 2>/dev/null | head -n 1")
            ]);

            let temp = 'N/A';
            if (tempOut && !isNaN(tempOut)) {
                temp = (parseInt(tempOut) / 1000).toFixed(1) + '°C';
            }

            const vitals = {
                cpuLoad: (load[0] / cpus * 100).toFixed(1),
                ramUsed: (usedMem / (1024 * 1024 * 1024)).toFixed(1),
                ramTotal: (totalMem / (1024 * 1024 * 1024)).toFixed(1),
                disk: diskOut || 'N/A',
                temp: temp
            };

            res.writeHead(200);
            res.end(JSON.stringify(vitals));
        } else if (req.url === '/docker') {
            if (!checkRateLimit(req, res)) return;
            try {
                const stats = await fetchDockerStatsAndCache();
                res.writeHead(200);
                res.end(JSON.stringify(stats));
            } catch (e) {
                log('error', `Failed to fetch/parse docker stats`, { error: e.message });
                sendError(res, 500, 'Failed to fetch docker stats');
            }
        } else if (req.url === '/metrics') {
            const memory = process.memoryUsage();
            let body = '';
            
            body += '# HELP node_process_uptime_seconds Uptime of the Node.js process in seconds.\n';
            body += '# TYPE node_process_uptime_seconds gauge\n';
            body += `node_process_uptime_seconds ${process.uptime()}\n\n`;
            
            body += '# HELP node_process_memory_usage_bytes Memory usage of the Node.js process in bytes.\n';
            body += '# TYPE node_process_memory_usage_bytes gauge\n';
            body += `node_process_memory_usage_bytes{type="rss"} ${memory.rss}\n`;
            body += `node_process_memory_usage_bytes{type="heapTotal"} ${memory.heapTotal}\n`;
            body += `node_process_memory_usage_bytes{type="heapUsed"} ${memory.heapUsed}\n\n`;
            
            body += '# HELP http_requests_total Total number of HTTP requests.\n';
            body += '# TYPE http_requests_total counter\n';
            for (const [key, count] of metrics.requestsTotal.entries()) {
                const [method, endpoint, status] = key.split(':');
                body += `http_requests_total{method="${method}",endpoint="${endpoint}",status="${status}"} ${count}\n`;
            }
            
            res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
            res.end(body);
        } else if (req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        } else {
            sendError(res, 404, 'Not Found');
        }
    });
});

server.listen(PORT, () => {
    log('info', `Vitals API running on port ${PORT}`);
});

const shutdown = (signal) => {
    log('info', `Received ${signal}, starting graceful shutdown.`);
    server.close(() => {
        log('info', 'HTTP server closed. Exiting process.');
        process.exit(0);
    });
    
    // Force close after 10 seconds if connections are hanging
    setTimeout(() => {
        log('error', 'Force exiting due to hanging connections.');
        process.exit(1);
    }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    log('error', 'Unhandled promise rejection', { reason: String(reason) });
});
