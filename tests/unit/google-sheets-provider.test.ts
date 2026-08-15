import { afterEach, describe, expect, it, vi } from "vitest";

const getAccessToken = vi.fn().mockResolvedValue({ token: "fake-token" });

vi.mock("google-auth-library", () => ({
  JWT: vi.fn().mockImplementation(() => ({ getAccessToken })),
}));

const { GoogleSheetsApiProvider } = await import("../../src/integrations/google-sheets/GoogleSheetsApiProvider.js");

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe("GoogleSheetsApiProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function makeProvider() {
    return new GoogleSheetsApiProvider({
      serviceAccountEmail: "bot@example.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\\nFAKE\\n-----END PRIVATE KEY-----\\n",
      spreadsheetId: "sheet-123",
    });
  }

  it("ensureSheet crea la hoja con encabezados si no existe", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ sheets: [{ properties: { title: "OTRA" } }] })) // metadata
      .mockResolvedValueOnce(jsonResponse({})) // batchUpdate addSheet
      .mockResolvedValueOnce(jsonResponse({})); // values.update headers
    vi.stubGlobal("fetch", fetchMock);

    await makeProvider().ensureSheet("RESERVAS", ["ID", "Nombre"]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]![0]).toContain(":batchUpdate");
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({
      requests: [{ addSheet: { properties: { title: "RESERVAS" } } }],
    });
    expect(fetchMock.mock.calls[2]![0]).toContain("RESERVAS!A1");
  });

  it("ensureSheet no hace nada si la hoja ya existe", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ sheets: [{ properties: { title: "RESERVAS" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await makeProvider().ensureSheet("RESERVAS", ["ID"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ensureSheet solo consulta una vez por instancia aunque se llame varias veces (caché)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ sheets: [{ properties: { title: "RESERVAS" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = makeProvider();

    await provider.ensureSheet("RESERVAS", ["ID"]);
    await provider.ensureSheet("RESERVAS", ["ID"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("upsertRow agrega una fila nueva si el ID no existe todavía", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ values: [["ID"], ["otro-id"]] })) // lectura columna A
      .mockResolvedValueOnce(jsonResponse({})); // append
    vi.stubGlobal("fetch", fetchMock);

    await makeProvider().upsertRow("RESERVAS", "appt-1", ["appt-1", "APT-ABC12345"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[1]!;
    expect(url).toContain(":append");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ values: [["appt-1", "APT-ABC12345"]] });
  });

  it("upsertRow actualiza la fila existente si el ID ya está en la hoja", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ values: [["ID"], ["otro-id"], ["appt-1"]] }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await makeProvider().upsertRow("RESERVAS", "appt-1", ["appt-1", "APT-ABC12345"]);

    const [url, options] = fetchMock.mock.calls[1]!;
    expect(url).toContain("RESERVAS!A3%3AB3");
    expect(options.method).toBe("PUT");
  });

  it("lanza si la API de Google responde con error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, false, 403)));

    await expect(makeProvider().upsertRow("RESERVAS", "x", ["x"])).rejects.toThrow();
  });
});
