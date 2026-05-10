import { computed, onBeforeUnmount, reactive, watchEffect } from "vue";
import { apiFetchJson } from "@/lib/api";
import { applyBgVersion } from "@/lib/background";

export type AdminOrder = {
  id: string;
  userId: number;
  email: string;
  status: string;
  itemsTotalMinor: number;
  shippingProvider: string;
  pickupPoint: unknown;
  comment: string;
  payment: {
    provider: string | null;
    id: string | null;
    status: string | null;
    amountMinor: number | null;
    paidAt: number | null;
  };
  shippingEta: string | null;
  tracking: {
    number: string | null;
    status: string | null;
  };
  createdAt: number;
  updatedAt: number;
};

export type AdminReleaseTrack = {
  filename: string;
  title: string;
};

export type AdminRelease = {
  slug: string;
  albumName: string;
  tracks: AdminReleaseTrack[];
  coverUrl: string | null;
  notes: string;
  releaseDate: string | null;
  releaseType: string;
};

export type OldBackground = {
  id: string;
  previewUrl: string;
};

export type PaletteEntry = {
  id: string;
  name: string;
  colors: Array<{ r: number; g: number; b: number; hex: string }>;
  vars: Record<string, string>;
  createdAt: string;
};

export type AdminShopProduct = {
  slug: string;
  title: string;
  category: string;
  price: number; // kopeks
  status: "available" | "sold_out" | "coming_soon";
  quantity: number;
  images: string[]; // filenames (not URLs)
  coverImage: string | null;
  description: { en: string; ru: string };
};

export type ContentPost = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  content: string;
  lang: string;
  kind: string;
};

const state = reactive({
  status: "idle" as "idle" | "loading" | "ready" | "error",
  isAdmin: false,
  message: "",
  orders: [] as AdminOrder[],
  releases: [] as AdminRelease[],
  bgVersion: "",
  oldBackgrounds: [] as OldBackground[],
  palettes: [] as PaletteEntry[],
  palettesEnabled: false,
  activePaletteId: null as string | null,
  blogPosts: { en: [] as ContentPost[], ru: [] as ContentPost[] },
  newsPosts: { en: [] as ContentPost[], ru: [] as ContentPost[] },
  shopProducts: [] as AdminShopProduct[]
});

let stream: EventSource | null = null;

function closeStream() {
  try {
    stream?.close();
  } catch (error) {
    void error;
  }
  stream = null;
}

async function loadMe() {
  state.status = "loading";
  state.message = "";
  try {
    const payload = await apiFetchJson<{ ok: boolean; isAdmin: boolean }>("/api/admin/me", { method: "GET" });
    state.isAdmin = Boolean(payload.isAdmin);
    state.status = "ready";
  } catch (error) {
    state.isAdmin = false;
    state.status = "error";
    state.message = error instanceof Error ? error.message : "Unable to load admin session";
  }
}

async function loadOrders() {
  if (!state.isAdmin) return;
  try {
    const payload = await apiFetchJson<{ ok: boolean; orders: AdminOrder[] }>("/api/admin/orders?limit=200", { method: "GET" });
    state.orders = Array.isArray(payload.orders) ? payload.orders : [];
  } catch (error) {
    state.message = error instanceof Error ? error.message : "Unable to load orders";
  }
}

async function loadReleases() {
  if (!state.isAdmin) return;
  try {
    const payload = await apiFetchJson<{ ok: boolean; releases: AdminRelease[] }>("/api/admin/releases", { method: "GET" });
    state.releases = Array.isArray(payload.releases) ? payload.releases : [];
  } catch (error) {
    state.message = error instanceof Error ? error.message : "Unable to load releases";
  }
}

async function loadBackground() {
  if (!state.isAdmin) return;
  try {
    const payload = await apiFetchJson<{ ok: boolean; version: string; oldBackgrounds: OldBackground[] }>("/api/admin/background", { method: "GET" });
    state.bgVersion = payload.version ?? "";
    state.oldBackgrounds = Array.isArray(payload.oldBackgrounds) ? payload.oldBackgrounds : [];
  } catch { /* ignore */ }
}

async function loadPalettes() {
  if (!state.isAdmin) return;
  try {
    const payload = await apiFetchJson<{ ok: boolean; enabled?: boolean; active: string | null; palettes: PaletteEntry[] }>("/api/admin/palette", { method: "GET" });
    state.palettes = Array.isArray(payload.palettes) ? payload.palettes : [];
    state.activePaletteId = payload.active ?? null;
    state.palettesEnabled = Boolean(payload.enabled) && state.palettes.length > 0;
  } catch { /* ignore */ }
}

async function loadShopProducts() {
  if (!state.isAdmin) return;
  try {
    const payload = await apiFetchJson<{ ok: boolean; products: AdminShopProduct[] }>("/api/admin/shop", { method: "GET" });
    state.shopProducts = Array.isArray(payload.products) ? payload.products : [];
  } catch { /* ignore */ }
}

async function loadContent(kind: "blog" | "news") {
  if (!state.isAdmin) return;
  try {
    const payload = await apiFetchJson<{ ok: boolean; posts: { en: ContentPost[]; ru: ContentPost[] } }>(`/api/admin/content/${kind}`, { method: "GET" });
    if (kind === "blog") state.blogPosts = payload.posts ?? { en: [], ru: [] };
    else state.newsPosts = payload.posts ?? { en: [], ru: [] };
  } catch { /* ignore */ }
}

export function useAdmin() {
  watchEffect(() => {
    if (state.status === "idle") {
      void loadMe().then(() => {
        if (state.isAdmin) {
          void loadOrders();
          void loadReleases();
          void loadBackground();
          void loadPalettes();
          void loadContent("blog");
          void loadContent("news");
          void loadShopProducts();
        }
      });
    }
  });

  watchEffect(() => {
    closeStream();
    if (!state.isAdmin) return;
    stream = new EventSource("/api/admin/stream", { withCredentials: true });
    stream.addEventListener("order", () => { void loadOrders(); });
  });

  onBeforeUnmount(() => closeStream());

  const canManage = computed(() => state.isAdmin);

  async function login({ email, password }: { email: string; password: string }) {
    await apiFetchJson<{ ok: boolean }>("/api/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
    await loadMe();
    await loadOrders();
    await loadReleases();
    await loadBackground();
    await loadPalettes();
    await loadContent("blog");
    await loadContent("news");
    await loadShopProducts();
  }

  async function logout() {
    await apiFetchJson<{ ok: boolean }>("/api/admin/logout", { method: "POST", body: JSON.stringify({}) });
    state.isAdmin = false;
    state.orders = [];
    state.releases = [];
    state.oldBackgrounds = [];
    state.palettes = [];
    state.palettesEnabled = false;
    state.activePaletteId = null;
    state.blogPosts = { en: [], ru: [] };
    state.newsPosts = { en: [], ru: [] };
    state.shopProducts = [];
    closeStream();
  }

  async function updateOrder(orderId: string, patch: Record<string, unknown>) {
    await apiFetchJson<{ ok: boolean }>(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    await loadOrders();
  }

  async function updateRelease(slug: string, patch: {
    albumName?: string;
    notes?: string;
    releaseType?: string;
    releaseDate?: string;
    deleteCover?: boolean;
    trackRenames?: Record<string, string>;
    trackDeletes?: string[];
    newTracks?: File[];
    cover?: File | null;
  }) {
    const hasCover = patch.cover instanceof File;
    const hasNewTracks = Array.isArray(patch.newTracks) && patch.newTracks.length > 0;

    if (hasCover || hasNewTracks) {
      const formData = new FormData();
      if (patch.albumName !== undefined) formData.append("albumName", patch.albumName);
      if (patch.notes !== undefined) formData.append("notes", patch.notes);
      if (patch.releaseType !== undefined) formData.append("releaseType", patch.releaseType);
      if (patch.releaseDate !== undefined) formData.append("releaseDate", patch.releaseDate);
      if (patch.deleteCover) formData.append("deleteCover", "true");
      if (patch.trackRenames) formData.append("trackRenames", JSON.stringify(patch.trackRenames));
      if (patch.trackDeletes) formData.append("trackDeletes", JSON.stringify(patch.trackDeletes));
      if (hasCover) formData.append("cover", patch.cover!);
      if (hasNewTracks) {
        for (const f of patch.newTracks!) formData.append("tracks[]", f);
      }
      const resp = await fetch(`/api/admin/releases/${encodeURIComponent(slug)}`, { method: "PATCH", body: formData });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Update failed" }));
        throw new Error(err.error || "Update failed");
      }
    } else {
      const body: Record<string, unknown> = {};
      if (patch.albumName !== undefined) body.albumName = patch.albumName;
      if (patch.notes !== undefined) body.notes = patch.notes;
      if (patch.releaseType !== undefined) body.releaseType = patch.releaseType;
      if (patch.releaseDate !== undefined) body.releaseDate = patch.releaseDate;
      if (patch.deleteCover) body.deleteCover = true;
      if (patch.trackRenames) body.trackRenames = patch.trackRenames;
      if (patch.trackDeletes) body.trackDeletes = patch.trackDeletes;
      await apiFetchJson<{ ok: boolean }>(`/api/admin/releases/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
    }
    await loadReleases();
  }

  async function deleteRelease(slug: string) {
    await apiFetchJson<{ ok: boolean }>(`/api/admin/releases/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      body: JSON.stringify({})
    });
    await loadReleases();
  }

  // ── Background ──────────────────────────────────────────────────────────────
  async function uploadBackground(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    const resp = await fetch("/api/admin/background/upload", { method: "POST", body: fd });
    if (!resp.ok) { const e = await resp.json().catch(() => ({ error: "Upload failed" })); throw new Error(e.error); }
    const data = await resp.json() as { version?: string };
    if (data.version) applyBgVersion(data.version);
    await loadBackground();
  }

  async function activateBackground(id: string) {
    const data = await apiFetchJson<{ ok: boolean; version?: string }>(`/api/admin/background/activate/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({}) });
    if (data.version) applyBgVersion(data.version);
    await loadBackground();
  }

  async function deleteOldBackground(id: string) {
    await apiFetchJson<{ ok: boolean }>(`/api/admin/background/old/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({}) });
    await loadBackground();
  }

  // ── Palette ─────────────────────────────────────────────────────────────────
  async function generatePalette(name: string, bgId?: string) {
    const payload = await apiFetchJson<{ ok: boolean; palette: PaletteEntry }>("/api/admin/palette/generate", {
      method: "POST",
      body: JSON.stringify({ name, bgId })
    });
    await loadPalettes();
    return payload.palette;
  }

  async function activatePalette(id: string) {
    await apiFetchJson<{ ok: boolean }>(`/api/admin/palette/activate/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({}) });
    await loadPalettes();
  }

  async function updatePalette(id: string, patch: { name?: string; vars?: Record<string, string> }) {
    await apiFetchJson<{ ok: boolean }>(`/api/admin/palette/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    await loadPalettes();
  }

  async function deletePalette(id: string) {
    await apiFetchJson<{ ok: boolean }>(`/api/admin/palette/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({}) });
    await loadPalettes();
  }

  async function setPalettesEnabled(enabled: boolean) {
    await apiFetchJson<{ ok: boolean; enabled: boolean; active: string | null }>("/api/admin/palette/enabled", {
      method: "POST",
      body: JSON.stringify({ enabled })
    });
    await loadPalettes();
  }

  // ── Content (blog / news) ───────────────────────────────────────────────────
  async function createPost(kind: "blog" | "news", post: { slug: string; title: string; publishedAt: string; excerpt: string; content: string; lang: string }) {
    await apiFetchJson<{ ok: boolean }>(`/api/admin/content/${kind}`, { method: "POST", body: JSON.stringify(post) });
    await loadContent(kind);
  }

  async function updatePost(kind: "blog" | "news", lang: string, slug: string, patch: { title?: string; publishedAt?: string; excerpt?: string; content?: string }) {
    await apiFetchJson<{ ok: boolean }>(`/api/admin/content/${kind}/${lang}/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    await loadContent(kind);
  }

  async function deletePost(kind: "blog" | "news", lang: string, slug: string) {
    await apiFetchJson<{ ok: boolean }>(`/api/admin/content/${kind}/${lang}/${encodeURIComponent(slug)}`, { method: "DELETE", body: JSON.stringify({}) });
    await loadContent(kind);
  }

  async function uploadPostMedia(kind: "blog" | "news", lang: string, slug: string, files: File[]) {
    const fd = new FormData();
    for (const f of files) fd.append("file", f);
    const resp = await fetch(`/api/admin/content/${kind}/${lang}/${encodeURIComponent(slug)}/media`, { method: "POST", body: fd });
    if (!resp.ok) { const e = await resp.json().catch(() => ({ error: "Upload failed" })); throw new Error(e.error); }
    return (await resp.json()) as { ok: boolean; files: Array<{ name: string; url: string; ext: string }> };
  }

  async function deletePostMedia(kind: "blog" | "news", lang: string, slug: string, filename: string) {
    await apiFetchJson<{ ok: boolean }>(`/api/admin/content/${kind}/${lang}/${encodeURIComponent(slug)}/media/${encodeURIComponent(filename)}`, {
      method: "DELETE",
      body: JSON.stringify({})
    });
  }

  // ── Shop products ────────────────────────────────────────────────────────────
  async function createShopProduct(data: { title: string; category: string; price: number; status: "available" | "sold_out" | "coming_soon"; quantity: number; descriptionEn: string; descriptionRu: string }) {
    const result = await apiFetchJson<{ ok: boolean; slug: string }>("/api/admin/shop", { method: "POST", body: JSON.stringify(data) });
    await loadShopProducts();
    return result.slug;
  }

  async function updateShopProduct(slug: string, patch: Partial<{ title: string; category: string; price: number; status: "available" | "sold_out" | "coming_soon"; quantity: number; descriptionEn: string; descriptionRu: string; coverImage: string; images: string[] }>) {
    await apiFetchJson<{ ok: boolean }>(`/api/admin/shop/${encodeURIComponent(slug)}`, { method: "PATCH", body: JSON.stringify(patch) });
    await loadShopProducts();
  }

  async function deleteShopProduct(slug: string) {
    await apiFetchJson<{ ok: boolean }>(`/api/admin/shop/${encodeURIComponent(slug)}`, { method: "DELETE", body: JSON.stringify({}) });
    await loadShopProducts();
  }

  async function uploadShopImages(slug: string, files: File[]) {
    const fd = new FormData();
    for (const f of files) fd.append("file", f);
    const resp = await fetch(`/api/admin/shop/${encodeURIComponent(slug)}/images`, { method: "POST", body: fd });
    if (!resp.ok) { const e = await resp.json().catch(() => ({ error: "Upload failed" })); throw new Error(e.error); }
    await loadShopProducts();
  }

  async function deleteShopImage(slug: string, filename: string) {
    await apiFetchJson<{ ok: boolean }>(`/api/admin/shop/${encodeURIComponent(slug)}/images/${encodeURIComponent(filename)}`, { method: "DELETE", body: JSON.stringify({}) });
    await loadShopProducts();
  }

  return {
    state,
    canManage,
    login,
    logout,
    loadOrders,
    loadReleases,
    loadBackground,
    loadPalettes,
    loadContent,
    updateOrder,
    updateRelease,
    deleteRelease,
    uploadBackground,
    activateBackground,
    deleteOldBackground,
    generatePalette,
    activatePalette,
    updatePalette,
    deletePalette,
    setPalettesEnabled,
    createPost,
    updatePost,
    deletePost,
    uploadPostMedia,
    deletePostMedia,
    loadShopProducts,
    createShopProduct,
    updateShopProduct,
    deleteShopProduct,
    uploadShopImages,
    deleteShopImage
  };
}
