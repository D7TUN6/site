import { computed, onBeforeUnmount, reactive, watchEffect } from "vue";
import { apiFetchJson } from "@/lib/api";

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

const state = reactive({
  status: "idle" as "idle" | "loading" | "ready" | "error",
  isAdmin: false,
  message: "",
  orders: [] as AdminOrder[],
  releases: [] as AdminRelease[]
});

let stream: EventSource | null = null;

function closeStream() {
  try {
    stream?.close();
  } catch {
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

export function useAdmin() {
  watchEffect(() => {
    if (state.status === "idle") {
      void loadMe().then(() => {
        if (state.isAdmin) {
          void loadOrders();
          void loadReleases();
        }
      });
    }
  });

  watchEffect(() => {
    closeStream();
    if (!state.isAdmin) return;

    stream = new EventSource("/api/admin/stream", { withCredentials: true });
    stream.addEventListener("order", () => {
      void loadOrders();
    });
  });

  onBeforeUnmount(() => closeStream());

  const canManage = computed(() => state.isAdmin);

  async function login({ email, password }: { email: string; password: string }) {
    await apiFetchJson<{ ok: boolean }>("/api/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
    await loadMe();
    await loadOrders();
    await loadReleases();
  }

  async function logout() {
    await apiFetchJson<{ ok: boolean }>("/api/admin/logout", { method: "POST", body: JSON.stringify({}) });
    state.isAdmin = false;
    state.orders = [];
    state.releases = [];
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
      const resp = await fetch(`/api/admin/releases/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        body: formData
      });
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

  return {
    state,
    canManage,
    login,
    logout,
    loadOrders,
    loadReleases,
    updateOrder,
    updateRelease,
    deleteRelease
  };
}
