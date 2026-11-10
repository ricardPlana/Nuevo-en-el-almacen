using System.Text.Json;
using System.Text.RegularExpressions;
using Wh3d.Api.Models;

namespace Wh3d.Api.Data;

// Sirve los JSON de swa/public/mock (el .csproj los copia a Mock/ en la salida).
public sealed partial class MockWarehouseData : IWarehouseData
{
    private static readonly string MockDir = Path.Combine(AppContext.BaseDirectory, "Mock");

    public Task<Layout?> GetLayoutAsync(string warehouseId, string? company, CancellationToken ct) =>
        ReadAsync<Layout>($"layout-{warehouseId}.json", ct);

    public Task<Route?> GetRouteAsync(string workId, string? company, CancellationToken ct) =>
        ReadAsync<Route>($"route-{workId}.json", ct);

    public async Task<IReadOnlyList<Route>?> GetLoadRoutesAsync(string loadId, string? company, CancellationToken ct) =>
        await ReadAsync<List<Route>>($"load-{loadId}.json", ct);

    public async Task<IReadOnlyList<WorkSummary>> ListWorksAsync(string warehouseId, string? company, string status, int top, CancellationToken ct)
    {
        var works = new List<WorkSummary>();
        foreach (var file in Directory.EnumerateFiles(MockDir, "route-*.json"))
        {
            var r = await ReadAsync<Route>(Path.GetFileName(file), ct);
            if (r is null || r.WarehouseId != warehouseId || !Matches(r.WorkStatus, status)) continue;
            works.Add(new WorkSummary(r.WorkId, r.LoadId, r.WarehouseId, r.WorkStatus, r.StartedAt, r.ClosedAt));
        }
        return works.OrderByDescending(w => w.WorkId, StringComparer.Ordinal).Take(top).ToList();
    }

    public Task<WarehouseStock?> GetStockAsync(string warehouseId, string? company, CancellationToken ct) =>
        ReadAsync<WarehouseStock>($"stock-{warehouseId}.json", ct);

    internal static bool Matches(string workStatus, string status) => status switch
    {
        "open" => workStatus is "Open" or "InProcess",
        "closed" => workStatus == "Closed",
        _ => true,
    };

    private static async Task<T?> ReadAsync<T>(string fileName, CancellationToken ct) where T : class
    {
        // Los IDs vienen de la URL: solo letras, números, guiones y guiones bajos.
        if (!SafeFileName().IsMatch(fileName)) return null;
        var path = Path.Combine(MockDir, fileName);
        if (!File.Exists(path)) return null;
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<T>(stream, Json.Options, ct);
    }

    [GeneratedRegex(@"^[A-Za-z0-9_-]+\.json$")]
    private static partial Regex SafeFileName();
}
