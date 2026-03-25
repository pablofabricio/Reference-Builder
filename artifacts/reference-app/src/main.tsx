import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?.trim()
  .replace(/\/$/, "");

// Intercept fetch calls to automatically inject the JWT token
// This allows the generated API client to work seamlessly with our auth state
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  
  if (typeof resource === 'string' && resource.startsWith('/api')) {
    const method = (config?.method || 'GET').toUpperCase();

    const rewriteQueryParams = (url: string): string => {
      const [path, rawQuery] = url.split('?');
      if (!rawQuery) return url;

      const params = new URLSearchParams(rawQuery);
      if (params.has('referenceNodeId')) {
        const value = params.get('referenceNodeId');
        params.delete('referenceNodeId');
        if (value != null) params.set('reference_node_id', value);
      }
      if (params.has('parentNodeId')) {
        const value = params.get('parentNodeId');
        params.delete('parentNodeId');
        if (value != null) params.set('parent_node_id', value);
      }
      if (params.has('channelId')) {
        const value = params.get('channelId');
        params.delete('channelId');
        if (value != null) params.set('channel_id', value);
      }

      const query = params.toString();
      return query ? `${path}?${query}` : path;
    };

    const rewriteJsonBody = (body: unknown): unknown => {
      if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
      const record = body as Record<string, unknown>;
      const out: Record<string, unknown> = { ...record };

      if ('referenceNodeId' in out) {
        out.reference_node_id = out.referenceNodeId;
        delete out.referenceNodeId;
      }
      if ('parentNodeId' in out) {
        out.parent_node_id = out.parentNodeId;
        delete out.parentNodeId;
      }
      if ('channelId' in out) {
        out.channel_id = out.channelId;
        delete out.channelId;
      }
      if ('referenceId' in out) {
        out.reference_id = out.referenceId;
        delete out.referenceId;
      }

      return out;
    };

    // Compatibility mapping for the Laravel API routes.
    resource = resource.replace(/^\/api\/me$/, '/api/auth/me');

    const referenceNodesMatch = resource.match(/^\/api\/references\/(\d+)\/nodes(?:\?(.*))?$/);
    if (referenceNodesMatch) {
      const params = new URLSearchParams(referenceNodesMatch[2] || '');
      const parentNodeId = params.get('parentNodeId');
      resource = `/api/reference-nodes?reference_id=${referenceNodesMatch[1]}`;
      if (parentNodeId != null) {
        resource += `&parent_node_id=${parentNodeId}`;
      }
    }

    const channelReferencesMatch = resource.match(/^\/api\/channels\/(\d+)\/references$/);
    if (channelReferencesMatch) {
      resource = `/api/channel-references?channel_id=${channelReferencesMatch[1]}`;
    }

    const channelMembersMatch = resource.match(/^\/api\/channels\/(\d+)\/members$/);
    if (channelMembersMatch) {
      resource = `/api/channel-members?channel_id=${channelMembersMatch[1]}`;
    }

    resource = rewriteQueryParams(resource);

    if (typeof config?.body === 'string' && config.body.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(config.body);
        config = {
          ...config,
          body: JSON.stringify(rewriteJsonBody(parsed)),
        };
      } catch {
        // Ignore invalid JSON payloads.
      }
    }

    if (apiBaseUrl) {
      resource = `${apiBaseUrl}${resource}`;
    }

    const token = localStorage.getItem('auth_token');
    if (token) {
      config = config || {};
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`
      };
    }
  }
  
  return originalFetch(resource, config);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
