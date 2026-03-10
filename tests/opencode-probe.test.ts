import { afterEach, describe, expect, it } from 'vitest';
import http, { type Server as HttpServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { FailureType } from '../src/reliability/types.js';
import { probeOpenCodeHealth } from '../src/reliability/opencode-probe.js';

const activeServers = new Set<HttpServer>();

async function startHttpServer(
  handler: http.RequestListener
): Promise<{ server: HttpServer; host: string; port: number }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  activeServers.add(server);
  const address = server.address() as AddressInfo;
  return {
    server,
    host: '127.0.0.1',
    port: address.port,
  };
}

async function getUnusedPort(): Promise<number> {
  const { server, port } = await startHttpServer((_req, res) => {
    res.statusCode = 204;
    res.end();
  });
  await new Promise<void>(resolve => {
    server.close(() => resolve());
  });
  activeServers.delete(server);
  return port;
}

afterEach(async () => {
  await Promise.all(
    Array.from(activeServers).map(
      server =>
        new Promise<void>(resolve => {
          server.close(() => resolve());
        })
    )
  );
  activeServers.clear();
});

describe('opencode-probe', () => {
  it('connection refused 应映射为 opencode_tcp_down', async () => {
    const port = await getUnusedPort();

    const result = await probeOpenCodeHealth({
      host: '127.0.0.1',
      port,
      healthPath: '/health',
      tcpTimeoutMs: 200,
      httpTimeoutMs: 200,
    });

    expect(result.ok).toBe(false);
    expect(result.failureType).toBe(FailureType.OPENCODE_TCP_DOWN);
    expect(result.tcp.reachable).toBe(false);
    expect(result.http.attempted).toBe(false);
    expect(result.auth.status).toBe('unknown');
  });

  it('HTTP timeout 时应区分 tcp up 与 http down', async () => {
    const { host, port } = await startHttpServer((_req, _res) => {
      // 故意不返回响应，用于触发客户端超时。
    });

    const result = await probeOpenCodeHealth({
      host,
      port,
      healthPath: '/health',
      tcpTimeoutMs: 300,
      httpTimeoutMs: 150,
    });

    expect(result.ok).toBe(false);
    expect(result.failureType).toBe(FailureType.OPENCODE_HTTP_DOWN);
    expect(result.tcp.reachable).toBe(true);
    expect(result.http.attempted).toBe(true);
    expect(result.http.ok).toBe(false);
    expect(result.http.reason).toBe('timeout');
    expect(result.auth.status).toBe('unknown');
  });

  it('401/403 应映射为 opencode_auth_invalid', async () => {
    for (const statusCode of [401, 403]) {
      const { host, port } = await startHttpServer((req, res) => {
        if (req.url === '/health') {
          res.statusCode = statusCode;
          res.end('auth failed');
          return;
        }
        res.statusCode = 404;
        res.end();
      });

      const result = await probeOpenCodeHealth({
        host,
        port,
        healthPath: '/health',
      });

      expect(result.ok).toBe(false);
      expect(result.failureType).toBe(FailureType.OPENCODE_AUTH_INVALID);
      expect(result.tcp.reachable).toBe(true);
      expect(result.http.statusCode).toBe(statusCode);
      expect(result.auth.status).toBe('invalid');
      expect(result.auth.failureType).toBe(FailureType.OPENCODE_AUTH_INVALID);
    }
  });

  it('5xx 应映射为 opencode_http_down', async () => {
    const { host, port } = await startHttpServer((req, res) => {
      if (req.url === '/health') {
        res.statusCode = 503;
        res.end('unavailable');
        return;
      }
      res.statusCode = 404;
      res.end();
    });

    const result = await probeOpenCodeHealth({
      host,
      port,
      healthPath: '/health',
    });

    expect(result.ok).toBe(false);
    expect(result.failureType).toBe(FailureType.OPENCODE_HTTP_DOWN);
    expect(result.tcp.reachable).toBe(true);
    expect(result.http.statusCode).toBe(503);
    expect(result.auth.status).toBe('unknown');
  });
});
