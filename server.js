const http = require('http');
const os = require('os');
const { exec } = require('child_process');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const PORT = 3002;

const CONTAINER_PATHS = {
    'homeserver-fe': '../fe-homeserver',
    'homeserver-be': '.',
    'twc-fe': '../../the-wine-corner/fe-the-wine-corner',
    'twc-be': '../../the-wine-corner/be-the-wine-corner',
    'yp-fe': '../../your-places/fe-your-places',
    'yp-be': '../../your-places/be-your-places'
};

const getGitBranch = (relativeDir) => {
    try {
        const gitHeadPath = path.join(__dirname, relativeDir, '.git', 'HEAD');
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

const runCmd = (cmd) => new Promise(resolve => {
    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error(`[DEBUG] Command failed: ${cmd}\nError: ${error.message}\nStderr: ${stderr}`);
            resolve(null);
        } else {
            resolve(stdout.trim());
        }
    });
});

const logger = morgan('dev');

const server = http.createServer((req, res) => {
    logger(req, res, async (err) => {
        if (err) {
            res.writeHead(500);
            return res.end('Error');
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        if (req.url === '/vitals') {
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
            const [statsOut, psOut] = await Promise.all([
                runCmd("docker stats --no-stream --format '{{json .}}'"),
                runCmd("docker ps -a --format '{\"Name\":\"{{.Names}}\", \"Status\":\"{{.Status}}\"}'")
            ]);

            if (!statsOut) {
                console.error(`[DEBUG] /api/docker failed to fetch statsOut`);
                res.writeHead(500);
                return res.end(JSON.stringify({ error: 'Failed to fetch docker stats' }));
            }

            try {
				const stats = statsOut.split('\n').filter(Boolean).map(JSON.parse);
				const psInfo = psOut ? psOut.split('\n').filter(Boolean).map(JSON.parse) : [];

				// Merge Status into stats
				stats.forEach(stat => {
					const psMatch = psInfo.find(p => p.Name === stat.Name);
					stat.Status = psMatch ? psMatch.Status : 'Unknown';

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

                res.writeHead(200);
                res.end(JSON.stringify(stats));
            } catch (e) {
                console.error(`[DEBUG] /api/docker JSON parse error: ${e.message}`);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Failed to parse docker stats' }));
            }
        } else if (req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });
});

server.listen(PORT, () => {
    console.log(`Vitals API running on port ${PORT}`);
});
