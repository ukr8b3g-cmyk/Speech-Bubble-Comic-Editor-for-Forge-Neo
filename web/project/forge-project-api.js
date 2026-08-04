(function (root) {
  "use strict";

  const DEFAULT_BASE = "/speech-bubble-forge";
  const PROJECT_ID_RE =
    /^project:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  function normalizeProjectId(value) {
    const projectId = String(value || "").trim().toLowerCase();
    if (!PROJECT_ID_RE.test(projectId)) {
      throw new TypeError("Invalid project ID");
    }
    return projectId;
  }

  async function responsePayload(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.detail || `Project request failed (${response.status})`);
    }
    return payload;
  }

  class ForgeProjectApi {
    constructor(options = {}) {
      this.base = String(options.base || DEFAULT_BASE).replace(/\/+$/, "");
    }

    projectPath(projectId) {
      return `${this.base}/projects/${encodeURIComponent(normalizeProjectId(projectId))}`;
    }

    async list() {
      const response = await fetch(`${this.base}/projects`, {
        cache: "no-store",
      });
      return (await responsePayload(response)).projects || [];
    }

    async create(options = {}) {
      const response = await fetch(`${this.base}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: options.projectId || undefined,
          title: options.title || "Untitled Comic Project",
          source_revisions: options.sourceRevisions || {},
        }),
      });
      return (await responsePayload(response)).project;
    }

    async load(projectId) {
      const response = await fetch(this.projectPath(projectId), {
        cache: "no-store",
      });
      return (await responsePayload(response)).project;
    }

    async save(projectId, payload) {
      const response = await fetch(this.projectPath(projectId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return (await responsePayload(response)).project;
    }

    async remove(projectId) {
      const response = await fetch(this.projectPath(projectId), {
        method: "DELETE",
      });
      return responsePayload(response);
    }

    async uploadImage(projectId, blob, metadata = {}) {
      if (!(blob instanceof Blob)) throw new TypeError("Image Blob is required");
      const response = await fetch(`${this.projectPath(projectId)}/images`, {
        method: "POST",
        headers: {
          "Content-Type": blob.type || "application/octet-stream",
          "X-SBE-Image-Name": encodeURIComponent(
            String(metadata.name || "generated-image").slice(0, 260),
          ),
          "X-SBE-Source-Kind": String(metadata.sourceKind || "forge-gallery"),
          "X-SBE-Source-Tab": String(metadata.sourceTab || ""),
        },
        body: blob,
      });
      return (await responsePayload(response)).asset;
    }

    imageUrl(projectId, assetId) {
      return `${this.projectPath(projectId)}/images/${encodeURIComponent(
        String(assetId || ""),
      )}`;
    }

    async imageBlob(projectId, assetId) {
      const response = await fetch(this.imageUrl(projectId, assetId), {
        cache: "force-cache",
      });
      if (!response.ok) throw new Error(`Project image request failed (${response.status})`);
      return response.blob();
    }

    async cleanup(projectId) {
      const response = await fetch(`${this.projectPath(projectId)}/cleanup`, {
        method: "POST",
      });
      return responsePayload(response);
    }
  }

  root.SpeechBubbleForgeProjectApi = Object.freeze({
    ForgeProjectApi,
    normalizeProjectId,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
