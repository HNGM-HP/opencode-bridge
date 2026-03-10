import { opencodeConfig } from '../config.js';
import { FailureType } from './types.js';
import { probeTcpPort } from './process-guard.js';

export interface TcpProbeLayerResult {
  reachable: boolean;
  reason: string;
  failureType: FailureType | null;
}

export interface HttpProbeLayerResult {
  attempted: boolean;
  ok: boolean;
  statusCode: number | null;
  reason: string;
  url: string | null;
  failureType: FailureType | null;
}

export type AuthProbeStatus = 'valid' | 'invalid' | 'unknown';

export interface AuthProbeLayerResult {
  status: AuthProbeStatus;
  reason: string;
  failureType: FailureType | null;
}

export interface OpenCodeProbeResult {
  ok: boolean;
  failureType: FailureType | null;
  tcp: TcpProbeLayerResult;
  http: HttpProbeLayerResult;
  auth: AuthProbeLayerResult;
}

export interface OpenCodeProbeOptions {
  host?: string;
  port?: number;
  healthPath?: string;
  tcpTimeoutMs?: number;
  httpTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface HttpProbeResponse {
  ok: boolean;
  statusCode: number | null;
  reason: string;
}

export async function probeOpenCodeHealth(options: OpenCodeProbeOptions = {}): Promise<OpenCodeProbeResult> {
  const host = options.host ?? opencodeConfig.host;
  const port = options.port ?? opencodeConfig.port;
  const healthPath = normalizeHealthPath(options.healthPath ?? '/health');
  const tcpTimeoutMs = options.tcpTimeoutMs ?? 1200;
  const httpTimeoutMs = options.httpTimeoutMs ?? 1200;

  const tcpResult = await probeTcpPort(host, port, tcpTimeoutMs);
  if (!tcpResult.isOpen) {
    return {
      ok: false,
      failureType: FailureType.OPENCODE_TCP_DOWN,
      tcp: {
        reachable: false,
        reason: tcpResult.reason,
        failureType: FailureType.OPENCODE_TCP_DOWN,
      },
      http: {
        attempted: false,
        ok: false,
        statusCode: null,
        reason: 'skipped:tcp_unreachable',
        url: null,
        failureType: null,
      },
      auth: {
        status: 'unknown',
        reason: 'skipped:tcp_unreachable',
        failureType: null,
      },
    };
  }

  const healthUrl = new URL(healthPath, `http://${host}:${port}`).toString();
  const httpResult = await probeHttpHealthEndpoint(healthUrl, httpTimeoutMs, options.fetchImpl);
  const authStatus = deriveAuthStatus(httpResult.statusCode);

  if (authStatus === 'invalid') {
    return {
      ok: false,
      failureType: FailureType.OPENCODE_AUTH_INVALID,
      tcp: {
        reachable: true,
        reason: tcpResult.reason,
        failureType: null,
      },
      http: {
        attempted: true,
        ok: false,
        statusCode: httpResult.statusCode,
        reason: httpResult.reason,
        url: healthUrl,
        failureType: FailureType.OPENCODE_AUTH_INVALID,
      },
      auth: {
        status: 'invalid',
        reason: `http_${httpResult.statusCode}`,
        failureType: FailureType.OPENCODE_AUTH_INVALID,
      },
    };
  }

  if (!httpResult.ok) {
    return {
      ok: false,
      failureType: FailureType.OPENCODE_HTTP_DOWN,
      tcp: {
        reachable: true,
        reason: tcpResult.reason,
        failureType: null,
      },
      http: {
        attempted: true,
        ok: false,
        statusCode: httpResult.statusCode,
        reason: httpResult.reason,
        url: healthUrl,
        failureType: FailureType.OPENCODE_HTTP_DOWN,
      },
      auth: {
        status: authStatus,
        reason: authStatus === 'valid' ? 'http_non_auth_failure' : 'unknown',
        failureType: null,
      },
    };
  }

  return {
    ok: true,
    failureType: null,
    tcp: {
      reachable: true,
      reason: tcpResult.reason,
      failureType: null,
    },
    http: {
      attempted: true,
      ok: true,
      statusCode: httpResult.statusCode,
      reason: httpResult.reason,
      url: healthUrl,
      failureType: null,
    },
    auth: {
      status: authStatus,
      reason: authStatus === 'valid' ? 'http_ok' : 'unknown',
      failureType: null,
    },
  };
}

function normalizeHealthPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return '/health';
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

async function probeHttpHealthEndpoint(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch | undefined
): Promise<HttpProbeResponse> {
  const requestFetch = fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await requestFetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        statusCode: response.status,
        reason: `http_${response.status}`,
      };
    }

    if (response.status < 200 || response.status >= 400) {
      return {
        ok: false,
        statusCode: response.status,
        reason: `http_${response.status}`,
      };
    }

    return {
      ok: true,
      statusCode: response.status,
      reason: `http_${response.status}`,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        statusCode: null,
        reason: 'timeout',
      };
    }

    return {
      ok: false,
      statusCode: null,
      reason: extractErrorReason(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function deriveAuthStatus(statusCode: number | null): AuthProbeStatus {
  if (statusCode === 401 || statusCode === 403) {
    return 'invalid';
  }
  if (statusCode !== null && statusCode >= 200 && statusCode < 400) {
    return 'valid';
  }
  return 'unknown';
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  if ('name' in error && String(error.name) === 'AbortError') {
    return true;
  }

  if ('code' in error && String(error.code) === 'ABORT_ERR') {
    return true;
  }

  return false;
}

function extractErrorReason(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String(error.code);
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}
