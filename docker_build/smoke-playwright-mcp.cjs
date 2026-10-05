// Exercise the image's actual MCP defaults as coder, without a model or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

async function smoke() {
  const started = Date.now();
  const config = JSON.parse(fs.readFileSync('/etc/coder-skel/.pi/agent/mcp.json')).mcpServers.playwright;
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-mcp-smoke-'));
  const child = spawn(config.command, [...config.args, '--output-dir', output], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let id = 0;
  let stderr = '';
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-8000); });
  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', line => {
    const response = JSON.parse(line);
    const request = pending.get(response.id);
    if (request) {
      pending.delete(response.id);
      request.resolve(response);
    }
  });
  child.on('error', error => {
    for (const request of pending.values()) request.reject(error);
  });
  child.on('exit', code => {
    for (const request of pending.values()) request.reject(new Error(`MCP exited with code ${code}`));
  });
  function rpc(method, params) {
    return new Promise((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => reject(new Error(`MCP timed out: ${method}`)), 20000);
      pending.set(current, {
        resolve: response => { clearTimeout(timer); resolve(response); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: current, method, params }) + '\n');
    });
  }
  try {
    const initialized = await rpc('initialize', {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'image-smoke', version: '1' },
    });
    assert.ok(!initialized.error, JSON.stringify(initialized.error));
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const response = await rpc('tools/call', {
      name: 'browser_navigate', arguments: { url: 'data:text/html,<title>HaakCo MCP smoke</title><h1>Browser works</h1>' },
    });
    assert.ok(!response.error && !response.result.isError, JSON.stringify(response));
    assert.ok(response.result.content.some(content => content.text?.includes('Page Title: HaakCo MCP smoke')), JSON.stringify(response));
    const closed = await rpc('tools/call', { name: 'browser_close', arguments: {} });
    assert.ok(!closed.error && !closed.result.isError, JSON.stringify(closed));
    console.log(`PLAYWRIGHT_MCP_SMOKE_OK (${Date.now() - started}ms)`);
  } catch (error) {
    throw new Error(`${error.message}\n${stderr}`, { cause: error });
  } finally {
    lines.close();
    child.kill('SIGTERM');
    fs.rmSync(output, { recursive: true, force: true });
  }
}

smoke().catch(error => { console.error(error); process.exitCode = 1; });
