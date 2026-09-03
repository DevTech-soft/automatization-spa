import { afterEach, describe, expect, it, vi } from "vitest";
import { SupabaseStorageProvider } from "../../src/integrations/storage/SupabaseStorageProvider.js";

function response(ok: boolean, status = 200, body: unknown = {}) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function makeProvider() {
  return new SupabaseStorageProvider({
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role-key",
    bucket: "gift-cards",
  });
}

describe("SupabaseStorageProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getPublicUrl arma la URL pública del objeto", () => {
    const url = makeProvider().getPublicUrl("biz-1/GIFT-ABC.png");
    expect(url).toBe("https://project.supabase.co/storage/v1/object/public/gift-cards/biz-1/GIFT-ABC.png");
  });

  it("upload crea el bucket si no existe y luego sube el archivo", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(false, 404)) // check bucket
      .mockResolvedValueOnce(response(true)) // create bucket
      .mockResolvedValueOnce(response(true)); // upload
    vi.stubGlobal("fetch", fetchMock);

    await makeProvider().upload("biz-1/x.png", Buffer.from("data"), "image/png");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]![0]).toContain("/storage/v1/bucket");
    expect(fetchMock.mock.calls[2]![0]).toContain("/storage/v1/object/gift-cards/biz-1/x.png");
    expect(fetchMock.mock.calls[2]![1].method).toBe("POST");
  });

  it("upload crea el bucket cuando Supabase responde 400 con code NoSuchBucket (quirk real de la API)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(false, 400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found", code: "NoSuchBucket" }),
      ) // check bucket: Supabase no devuelve 404, devuelve 400 con este body
      .mockResolvedValueOnce(response(true)) // create bucket
      .mockResolvedValueOnce(response(true)); // upload
    vi.stubGlobal("fetch", fetchMock);

    await makeProvider().upload("biz-1/x.png", Buffer.from("data"), "image/png");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]![1].method).toBe("POST");
  });

  it("upload no vuelve a comprobar el bucket en llamadas posteriores de la misma instancia", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(true)) // check bucket: ya existe
      .mockResolvedValue(response(true));
    vi.stubGlobal("fetch", fetchMock);
    const provider = makeProvider();

    await provider.upload("a.png", Buffer.from("1"), "image/png");
    await provider.upload("b.png", Buffer.from("2"), "image/png");

    // 1 check + 2 uploads = 3, no 4 (no repite el check en la segunda llamada)
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("upload lanza si Supabase responde con error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(response(true)).mockResolvedValueOnce(response(false, 500)),
    );

    await expect(makeProvider().upload("a.png", Buffer.from("1"), "image/png")).rejects.toThrow();
  });

  it("delete hace DELETE al objeto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(true));
    vi.stubGlobal("fetch", fetchMock);

    await makeProvider().delete("biz-1/x.png");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/storage/v1/object/gift-cards/biz-1/x.png",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
