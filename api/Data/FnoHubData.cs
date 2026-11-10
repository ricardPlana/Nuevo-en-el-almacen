using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Wh3d.Api.Fno;
using Wh3d.Api.Models;
using Wh3d.Api.Services;
using static Wh3d.Api.Fno.FnoClient;

namespace Wh3d.Api.Data;

// Hub desde F&O por OData estándar, sin escribir nada:
//  - Empresas y almacenes: Warehouses con gestión avanzada (AreAdvancedWarehouseManagementProcessesEnabled) + LegalEntities.
//  - Works: WarehouseWorkHeaders de todos los tipos, paginados en F&O ($skip/$count); líneas de pick y Locked by → empleado.
//  - Cargas: agrupando los works del almacén por LoadId (la cabecera de carga no publica su estado en la entidad estándar).
//  - Artículos: ProjInventoryOnHand (disponible físico > 0) en los almacenes WMS de la empresa; datos de ubicación del plano.
// El plano y el stock por almacén salen de IWarehouseData (con su caché).
public sealed class FnoHubData(FnoClient fno, IWarehouseData data, ILogger<FnoHubData> log) : IHubData
{
    private static readonly string Company = Environment.GetEnvironmentVariable("FNO_COMPANY") is { Length: > 0 } c ? c.ToLowerInvariant() : "usmf";
    private static readonly TimeSpan ListTtl = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan StockTtl = TimeSpan.FromMinutes(2);

    private const string WorkStatus = "Microsoft.Dynamics.DataEntities.WHSWorkStatus";
    private const string SalesWork = "WarehouseWorkOrderType eq Microsoft.Dynamics.DataEntities.WHSWorkTransType'Sales'";
    private static readonly string[] OpenStatuses = ["Open", "InProcess", "PendingReview"];

    private (List<WmsWarehouseRow> Rows, Dictionary<string, string> Names, DateTimeOffset At)? sites;
    private readonly ConcurrentDictionary<string, (Dictionary<string, ProductRow> Rows, DateTimeOffset At)> products = new();
    private readonly ConcurrentDictionary<string, (List<OnHandRow> Rows, DateTimeOffset At)> onHand = new();
    private readonly ConcurrentDictionary<string, (string? Name, DateTimeOffset At)> workers = new();
    private readonly ConcurrentDictionary<string, (List<LocationRow> Rows, DateTimeOffset At)> locationRows = new();
    private readonly ConcurrentDictionary<string, (WarehouseStock? Stock, DateTimeOffset At)> warehouseStock = new();
    private static readonly TimeSpan LocationsTtl = TimeSpan.FromMinutes(5);

    private static string Co(string? company) => string.IsNullOrEmpty(company) ? Company : company.ToLowerInvariant();

    public async Task<IReadOnlyList<HubCompany>> ListCompaniesAsync(CancellationToken ct)
    {
        var (rows, names, _) = await SitesAsync(ct);
        return rows.GroupBy(r => r.dataAreaId.ToLowerInvariant())
            .Select(g => new HubCompany(g.Key, names.GetValueOrDefault(g.Key) ?? g.Key.ToUpperInvariant(), g.Count()))
            .OrderBy(c => c.Company, StringComparer.Ordinal)
            .ToList();
    }

    public async Task<IReadOnlyList<HubWarehouse>> ListWarehousesAsync(string? company, CancellationToken ct)
    {
        var co = Co(company);
        return (await SitesAsync(ct)).Rows.Where(r => r.dataAreaId.Equals(co, StringComparison.OrdinalIgnoreCase))
            .Select(r => new HubWarehouse(r.WarehouseId, Blank(r.WarehouseName) ?? r.WarehouseId))
            .OrderBy(w => w.WarehouseId, StringComparer.Ordinal)
            .ToList();
    }

    public async Task<HubWarehouseSummary?> WarehouseSummaryAsync(string warehouseId, string? company, CancellationToken ct)
    {
        var co = Co(company);
        var layoutTask = data.GetLayoutAsync(warehouseId, co, ct);
        var openTask = fno.QueryPageAsync<WorkIdRow>("WarehouseWorkHeaders",
            $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)} and {StatusFilter(OpenStatuses)}", "WarehouseWorkId", "WarehouseWorkId", 0, 1, ct);
        var startTask = TryQueryAsync<StartRow>("Warehouses", $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)}", "D365_UbicacionInicio", ct);
        var layout = await layoutTask;
        if (layout is null) return null;
        // Sin ubicaciones no hay stock que pintar: no se pregunta.
        var stock = layout.Locations.Count > 0 ? await data.GetStockAsync(warehouseId, co, ct) : null;
        await Task.WhenAll(openTask, startTask);
        var name = (await ListWarehousesAsync(co, ct)).FirstOrDefault(w => w.WarehouseId.Equals(warehouseId, StringComparison.OrdinalIgnoreCase))?.Name ?? warehouseId;
        var aisles = layout.Aisles?.Count ?? layout.Locations.Where(l => l.Aisle is not ("-" or "")).Select(l => l.Aisle).Distinct().Count();
        return new HubWarehouseSummary(layout.WarehouseId, name, layout.Locations.Count, stock?.Locations.Count(l => l.Qty > 0) ?? 0, aisles,
            (int)openTask.Result.Total, layout.Building, layout.DistanceStrategy, layout.SortAlgorithm,
            Blank(startTask.Result?.FirstOrDefault()?.D365_UbicacionInicio));
    }

    public async Task<HubPage<HubWork>> ListWorksAsync(string warehouseId, string? company, string status, bool cancelled, string? q, int skip, int top, CancellationToken ct)
    {
        var co = Co(company);
        var statuses = status switch
        {
            "open" => OpenStatuses,
            "closed" => cancelled ? ["Closed", "Cancelled"] : ["Closed"],
            _ => cancelled ? [.. OpenStatuses, "Closed", "Cancelled"] : [.. OpenStatuses, "Closed"],
        };
        var filter = $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)} and {StatusFilter(statuses)}";
        if (Wildcard(q) is { } like) filter += $" and (WarehouseWorkId eq {like} or LoadId eq {like} or SourceOrderNumber eq {like})";
        var (rows, total) = await fno.QueryPageAsync<HubWorkRow>("WarehouseWorkHeaders", filter,
            "WarehouseWorkId,WarehouseId,WarehouseWorkStatus,WarehouseWorkOrderType,SourceOrderNumber,LoadId," +
            "WarehouseWorkProcessingStartDateTime,WarehouseWorkClosedDateTime,WarehouseWorkLockingWarehouseMobileDeviceUserId",
            "WarehouseWorkId desc", skip, top, ct);
        if (rows.Count == 0) return new HubPage<HubWork>(total, []);

        var linesTask = fno.QueryAsync<LineIdRow>("WarehouseWorkLines",
            $"dataAreaId eq {Lit(co)} and WarehouseWorkType eq Microsoft.Dynamics.DataEntities.WHSWorkType'Pick' and ({AnyOf("WarehouseWorkId", rows.Select(r => r.WarehouseWorkId))})",
            "WarehouseWorkId,WorkLineNumber", null, null, ct);
        var namesTask = WorkerNamesAsync(co, rows.Select(r => r.WarehouseWorkLockingWarehouseMobileDeviceUserId ?? "").Where(u => u.Length > 0).Distinct().ToList(), ct);
        await Task.WhenAll(linesTask, namesTask);
        var lines = linesTask.Result.GroupBy(l => l.WarehouseWorkId, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);
        var names = namesTask.Result;

        return new HubPage<HubWork>(total, rows.Select(r =>
        {
            var user = Blank(r.WarehouseWorkLockingWarehouseMobileDeviceUserId);
            return new HubWork(r.WarehouseWorkId, r.WarehouseId, r.WarehouseWorkStatus, r.WarehouseWorkOrderType, Blank(r.SourceOrderNumber), Blank(r.LoadId),
                lines.GetValueOrDefault(r.WarehouseWorkId), Date(r.WarehouseWorkProcessingStartDateTime), Date(r.WarehouseWorkClosedDateTime),
                user is null ? null : new HubWorker(user, names.GetValueOrDefault(user)));
        }).ToList());
    }

    public async Task<HubPage<HubLoad>> ListLoadsAsync(string warehouseId, string? company, string status, bool cancelled, string? q, int skip, int top, CancellationToken ct)
    {
        var co = Co(company);
        var headers = await fno.QueryAsync<LoadWorkRow>("WarehouseWorkHeaders",
            $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)} and LoadId ne ''",
            "WarehouseWorkId,LoadId,WarehouseWorkStatus", "LoadId desc", 5000, ct);
        var loads = headers.GroupBy(h => h.LoadId, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var open = g.Count(h => OpenStatuses.Contains(h.WarehouseWorkStatus));
                var state = g.All(h => h.WarehouseWorkStatus == "Cancelled") ? "Cancelled" : open > 0 ? "Open" : "Closed";
                // Works: los que siguen vivos; en una carga cancelada, los que tenía.
                var works = state == "Cancelled" ? g.Count() : g.Count(h => h.WarehouseWorkStatus != "Cancelled");
                return new HubLoad(g.Key, warehouseId, state, works, open, null);
            })
            .Where(l => status switch
            {
                "open" => l.Status == "Open",
                "closed" => l.Status == "Closed" || cancelled && l.Status == "Cancelled",
                _ => l.Status != "Cancelled" || cancelled,
            })
            .Where(l => string.IsNullOrWhiteSpace(q) || l.LoadId.Contains(q.Trim(), StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(l => l.LoadId, StringComparer.Ordinal)
            .ToList();
        var page = loads.Skip(skip).Take(top).ToList();
        // Estado de la carga en F&O (Waved, Loaded, Shipped…) cuando la entidad BI lo publica para esa empresa; si no, sin él.
        if (page.Count > 0 && await TryQueryAsync<LoadStatusRow>("WHSLoadTableBiEntities",
                $"dataAreaId eq {Lit(co)} and ({AnyOf("LoadId", page.Select(l => l.LoadId))})", "LoadId,LoadStatus", ct) is { Count: > 0 } statuses)
        {
            var byId = statuses.GroupBy(s => s.LoadId, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First().LoadStatus, StringComparer.OrdinalIgnoreCase);
            page = page.Select(l => l with { LoadStatus = byId.GetValueOrDefault(l.LoadId) }).ToList();
        }
        return new HubPage<HubLoad>(loads.Count, page);
    }

    public async Task<HubLoadDetail?> LoadDetailAsync(string loadId, string warehouseId, string? company, bool cancelled, CancellationToken ct)
    {
        var co = Co(company);
        var all = await fno.QueryAsync<HubWorkRow>("WarehouseWorkHeaders",
            $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)} and LoadId eq {Lit(loadId)}",
            "WarehouseWorkId,WarehouseId,WarehouseWorkStatus,WarehouseWorkOrderType,SourceOrderNumber,LoadId," +
            "WarehouseWorkProcessingStartDateTime,WarehouseWorkClosedDateTime,WarehouseWorkLockingWarehouseMobileDeviceUserId",
            "WarehouseWorkId", null, ct);
        if (all.Count == 0) return null;
        var rows = cancelled || all.All(h => h.WarehouseWorkStatus == "Cancelled") ? all : all.Where(h => h.WarehouseWorkStatus != "Cancelled").ToList();

        var statusTask = TryQueryAsync<LoadStatusRow>("WHSLoadTableBiEntities", $"dataAreaId eq {Lit(co)} and LoadId eq {Lit(loadId)}", "LoadId,LoadStatus", ct);
        var workTask = WorkBuilderAsync(co, rows, ct);
        await Task.WhenAll(statusTask, workTask);
        var Work = workTask.Result;

        var orders = rows.GroupBy(h => Blank(h.SourceOrderNumber) ?? "", StringComparer.OrdinalIgnoreCase)
            .OrderBy(g => g.Key.Length == 0).ThenBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => new HubLoadOrder(g.Key.Length == 0 ? null : g.Key, g.Select(Work).ToList()))
            .ToList();
        return new HubLoadDetail(loadId, warehouseId, Blank(statusTask.Result?.FirstOrDefault()?.LoadStatus), orders);
    }

    // Convierte cabeceras de work en las filas con su estado y sus picks (lo comparten la carga y el pedido).
    private async Task<Func<HubWorkRow, HubLoadWork>> WorkBuilderAsync(string co, List<HubWorkRow> rows, CancellationToken ct)
    {
        var linesTask = fno.QueryAsync<LoadLineRow>("WarehouseWorkLines",
            $"dataAreaId eq {Lit(co)} and ({AnyOf("WarehouseWorkId", rows.Select(r => r.WarehouseWorkId))})",
            "WarehouseWorkId,WorkLineNumber,WarehouseWorkType,WarehouseWorkStatus,WarehouseLocationId,ItemNumber,WorkQuantity,WorkQuantityUnitSymbol",
            "WarehouseWorkId,WorkLineNumber", null, ct);
        var productsTask = ProductsAsync(co, ct);
        var namesTask = WorkerNamesAsync(co, rows.Select(r => Blank(r.WarehouseWorkLockingWarehouseMobileDeviceUserId)).OfType<string>().Distinct().ToList(), ct);
        await Task.WhenAll(linesTask, productsTask, namesTask);
        var lines = linesTask.Result.ToLookup(l => l.WarehouseWorkId, StringComparer.OrdinalIgnoreCase);

        return h =>
        {
            var workLines = lines[h.WarehouseWorkId].OrderBy(l => l.WorkLineNumber).ToList();
            // Lo que se recoge en estantería: los picks antes del primer put (el pick desde STAGE-OUT no es otro artículo que buscar).
            var firstPut = workLines.FindIndex(l => l.WarehouseWorkType == "Put");
            var picks = (firstPut < 0 ? workLines : workLines.Take(firstPut)).Where(l => l.WarehouseWorkType == "Pick")
                .Select(l =>
                {
                    var item = Blank(l.ItemNumber);
                    return new HubLoadPick((int)l.WorkLineNumber, l.WarehouseLocationId, item, item is null ? null : productsTask.Result.GetValueOrDefault(item)?.SearchName ?? item,
                        (double)l.WorkQuantity, Blank(l.WorkQuantityUnitSymbol), l.WarehouseWorkStatus == "Closed");
                }).ToList();
            var (stage, at) = StageOf(h.WarehouseWorkStatus, workLines);
            var user = Blank(h.WarehouseWorkLockingWarehouseMobileDeviceUserId);
            return new HubLoadWork(h.WarehouseWorkId, h.WarehouseWorkStatus, stage, at, user is null ? null : new HubWorker(user, namesTask.Result.GetValueOrDefault(user)), picks, Blank(h.LoadId));
        };
    }

    public async Task<HubPage<HubOrder>> ListOrdersAsync(string warehouseId, string? company, string? q, int skip, int top, CancellationToken ct)
    {
        var co = Co(company);
        var works = await fno.QueryAsync<OrderWorkRow>("WarehouseWorkHeaders",
            $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)} and SourceOrderNumber ne '' and {SalesWork} and {StatusFilter(OpenStatuses)}",
            "WarehouseWorkId,SourceOrderNumber,LoadId,WarehouseWorkStatus", "SourceOrderNumber desc", 5000, ct);
        var ids = works.Select(w => w.SourceOrderNumber).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

        // Cliente y fecha, de SalesOrderHeaders por número de pedido (rápida; SalesOrderHeadersV2 no responde a tiempo). Si falla, sin ellos.
        var headers = new Dictionary<string, SalesHeaderRow>(StringComparer.OrdinalIgnoreCase);
        foreach (var chunk in ids.Chunk(50))
        {
            var rows = await TryQueryAsync<SalesHeaderRow>("SalesOrderHeaders", $"dataAreaId eq {Lit(co)} and ({AnyOf("SalesOrderNumber", chunk)})",
                "SalesOrderNumber,OrderingCustomerAccountNumber,SalesOrderName,DeliveryAddressName,SalesOrderStatus,RequestedShippingDate", ct);
            foreach (var r in rows ?? []) headers[r.SalesOrderNumber] = r;
        }

        var text = q?.Trim();
        var orders = works.GroupBy(w => w.SourceOrderNumber, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var h = headers.GetValueOrDefault(g.Key);
                return new HubOrder(g.Key, Blank(h?.OrderingCustomerAccountNumber), Blank(h?.SalesOrderName) ?? Blank(h?.DeliveryAddressName), Blank(h?.SalesOrderStatus),
                    Date(h?.RequestedShippingDate), g.Count(), g.Count(w => w.WarehouseWorkStatus == "InProcess"),
                    g.Select(w => Blank(w.LoadId)).OfType<string>().Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.Ordinal).ToList());
            })
            .Where(o => string.IsNullOrEmpty(text) || o.OrderNumber.Contains(text, StringComparison.OrdinalIgnoreCase)
                        || (o.CustomerName?.Contains(text, StringComparison.OrdinalIgnoreCase) ?? false)
                        || (o.CustomerAccount?.Contains(text, StringComparison.OrdinalIgnoreCase) ?? false))
            .OrderByDescending(o => o.OrderNumber, StringComparer.Ordinal)
            .ToList();
        return new HubPage<HubOrder>(orders.Count, orders.Skip(skip).Take(top).ToList());
    }

    public async Task<HubOrderDetail?> OrderDetailAsync(string orderNumber, string warehouseId, string? company, CancellationToken ct)
    {
        var co = Co(company);
        var rows = await fno.QueryAsync<HubWorkRow>("WarehouseWorkHeaders",
            $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)} and SourceOrderNumber eq {Lit(orderNumber)} and {SalesWork} and WarehouseWorkStatus ne {WorkStatus}'Cancelled'",
            "WarehouseWorkId,WarehouseId,WarehouseWorkStatus,WarehouseWorkOrderType,SourceOrderNumber,LoadId," +
            "WarehouseWorkProcessingStartDateTime,WarehouseWorkClosedDateTime,WarehouseWorkLockingWarehouseMobileDeviceUserId",
            "WarehouseWorkId desc", null, ct);
        if (rows.Count == 0) return null;
        var work = await WorkBuilderAsync(co, rows, ct);
        return new HubOrderDetail(orderNumber, warehouseId, rows.Select(work).ToList());
    }

    // En qué punto va el work, por sus líneas: el último put cerrado sin que el work haya acabado es dónde está la mercancía.
    // Cargado = work cerrado (el último put, a BAYDOOR, hecho).
    private static (string Stage, string? Location) StageOf(string workStatus, List<LoadLineRow> lines)
    {
        if (workStatus == "Cancelled") return ("Cancelled", null);
        if (workStatus == "Closed") return ("Loaded", null);
        var lastPutDone = lines.LastOrDefault(l => l.WarehouseWorkType == "Put" && l.WarehouseWorkStatus == "Closed");
        return lastPutDone is null ? ("Picking", null) : ("Staged", Blank(lastPutDone.WarehouseLocationId));
    }

    public async Task<HubPage<HubItem>> ListItemsAsync(string? warehouseId, bool withStock, string? company, string? q, int skip, int top, CancellationToken ct)
    {
        var co = Co(company);
        var stockTask = StockRowsAsync(co, ct);
        var namesTask = ProductsAsync(co, ct);
        await Task.WhenAll(stockTask, namesTask);
        var names = namesTask.Result;
        var stock = stockTask.Result
            .Where(r => warehouseId is null || r.WarehouseId.Equals(warehouseId, StringComparison.OrdinalIgnoreCase))
            .ToLookup(r => r.ItemNumber, StringComparer.OrdinalIgnoreCase);
        // Sin filtro de stock: todos los artículos liberados, con su stock (o 0); con filtro, solo los que tienen.
        var ids = withStock || warehouseId is not null
            ? stock.Select(g => g.Key)
            : names.Keys.Concat(stock.Select(g => g.Key)).Distinct(StringComparer.OrdinalIgnoreCase);
        var items = ids
            .Select(id =>
            {
                var p = names.GetValueOrDefault(id);
                var rows = stock[id].ToList();
                return new HubItem(p?.ItemNumber ?? id, p?.SearchName ?? id, p?.InventoryUnitSymbol ?? "", rows.Sum(r => r.Qty),
                    rows.Select(r => $"{r.WarehouseId}|{r.LocationId}").Distinct(StringComparer.OrdinalIgnoreCase).Count(),
                    rows.Select(r => r.WarehouseId).Distinct(StringComparer.OrdinalIgnoreCase).Count());
            })
            .Where(i => string.IsNullOrWhiteSpace(q) || i.ItemId.Contains(q.Trim(), StringComparison.OrdinalIgnoreCase) || i.Name.Contains(q.Trim(), StringComparison.OrdinalIgnoreCase))
            .OrderBy(i => i.ItemId, StringComparer.Ordinal)
            .ToList();
        return new HubPage<HubItem>(items.Count, items.Skip(skip).Take(top).ToList());
    }

    public async Task<HubItemStock?> ItemStockAsync(string itemId, string? warehouseId, string? company, CancellationToken ct)
    {
        var co = Co(company);
        var stockTask = StockRowsAsync(co, ct);
        var namesTask = ProductsAsync(co, ct);
        var pickFilter = $"dataAreaId eq {Lit(co)} and ItemNumber eq {Lit(itemId)} and WarehouseWorkType eq Microsoft.Dynamics.DataEntities.WHSWorkType'Pick' and {StatusFilter(OpenStatuses)}";
        if (warehouseId is not null) pickFilter += $" and WarehouseId eq {Lit(warehouseId)}";
        var picksTask = fno.QueryAsync<PickQtyRow>("WarehouseWorkLines", pickFilter, "WarehouseWorkId,WorkLineNumber,RemainingWorkQuantity", null, null, ct);
        await Task.WhenAll(stockTask, namesTask, picksTask);

        var product = namesTask.Result.GetValueOrDefault(itemId);
        var rows = stockTask.Result
            .Where(r => r.ItemNumber.Equals(itemId, StringComparison.OrdinalIgnoreCase))
            .Where(r => warehouseId is null || r.WarehouseId.Equals(warehouseId, StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (product is null && rows.Count == 0) return null;

        // Pasillo, rack, estante y hueco de F&O, del plano de cada almacén (en caché).
        var fnoByWarehouse = new Dictionary<string, Dictionary<string, FnoLocation?>>(StringComparer.OrdinalIgnoreCase);
        foreach (var wh in rows.Select(r => r.WarehouseId).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var layout = await data.GetLayoutAsync(wh, co, ct);
            fnoByWarehouse[wh] = layout?.Locations.GroupBy(l => l.LocationId, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First().Fno, StringComparer.OrdinalIgnoreCase) ?? [];
        }
        var locations = rows
            .OrderBy(r => r.WarehouseId, StringComparer.Ordinal).ThenBy(r => r.LocationId, StringComparer.Ordinal)
            .Select(r => new HubItemLocation(r.WarehouseId, r.LocationId, r.Qty, r.LicensePlate, r.InventoryStatus,
                fnoByWarehouse.GetValueOrDefault(r.WarehouseId)?.GetValueOrDefault(r.LocationId)))
            .ToList();
        var picks = picksTask.Result;
        return new HubItemStock(product?.ItemNumber ?? itemId, product?.SearchName ?? itemId, product?.InventoryUnitSymbol ?? "",
            locations.Sum(l => l.Qty), picks.Count, (double)picks.Sum(p => p.RemainingWorkQuantity), locations);
    }

    public async Task<IReadOnlyList<HubMatch>> ResolveAsync(string q, string? company, CancellationToken ct)
    {
        var co = Co(company);
        var id = q.Trim();
        var workTask = fno.QueryAsync<WorkMatchRow>("WarehouseWorkHeaders", $"dataAreaId eq {Lit(co)} and WarehouseWorkId eq {Lit(id)}",
            "WarehouseWorkId,WarehouseId,WarehouseWorkStatus", null, 1, ct);
        var loadTask = fno.QueryAsync<LoadWorkMatchRow>("WarehouseWorkHeaders", $"dataAreaId eq {Lit(co)} and LoadId eq {Lit(id)}",
            "WarehouseWorkId,LoadId,WarehouseId", null, 50, ct);
        var locTask = fno.QueryAsync<LocationMatchRow>("WarehouseLocations", $"dataAreaId eq {Lit(co)} and WarehouseLocationId eq {Lit(id)}",
            "WarehouseLocationId,WarehouseId", null, 10, ct);
        var namesTask = ProductsAsync(co, ct);
        await Task.WhenAll(workTask, loadTask, locTask, namesTask);

        var matches = new List<HubMatch>();
        matches.AddRange(workTask.Result.Select(w => new HubMatch("work", w.WarehouseWorkId, w.WarehouseId, $"Work · {w.WarehouseId}")));
        matches.AddRange(loadTask.Result.GroupBy(l => (l.LoadId, l.WarehouseId))
            .Select(g => new HubMatch("load", g.Key.LoadId, g.Key.WarehouseId, $"Carga · {g.Key.WarehouseId} · {g.Count()} works")));
        matches.AddRange(locTask.Result.Select(l => new HubMatch("location", l.WarehouseLocationId, l.WarehouseId, $"Ubicación · {l.WarehouseId}")));
        if (namesTask.Result.GetValueOrDefault(id) is { } p) matches.Add(new HubMatch("item", p.ItemNumber, null, $"Artículo · {p.SearchName ?? p.ItemNumber}"));
        return matches;
    }

    public async Task<IReadOnlyList<HubMyWork>> MyWorksAsync(string email, string? company, CancellationToken ct)
    {
        var locked = await data.LockedWorksAsync(null, Co(company), ct);
        return locked
            .Where(x => string.Equals(x.Email, email, StringComparison.OrdinalIgnoreCase))
            .Select(x =>
            {
                var route = RouteExplanation.Enrich(x.Route);
                return new HubMyWork(route.WorkId, route.WarehouseId, route.Lines.Count, route.TotalDistance, route.Lines.FirstOrDefault()?.LocationId);
            })
            .ToList();
    }

    public async Task<HubPage<HubLocation>> ListLocationsAsync(string warehouseId, string? company, string filter, string? zone, string? aisle, string? profile,
        string? q, int skip, int top, CancellationToken ct)
    {
        var text = q?.Trim();
        var list = (await LocationsAsync(Co(company), warehouseId, ct))
            .Where(l => filter switch
            {
                "stock" => l.Qty > 0,
                "empty" => l.Qty <= 0,
                "picks" => l.OpenPicks > 0,
                _ => true,
            })
            .Where(l => zone is null || string.Equals(l.Zone, zone, StringComparison.OrdinalIgnoreCase))
            .Where(l => aisle is null || string.Equals(l.Aisle, aisle, StringComparison.OrdinalIgnoreCase))
            .Where(l => profile is null || string.Equals(l.Profile, profile, StringComparison.OrdinalIgnoreCase))
            .Where(l => string.IsNullOrEmpty(text) || l.LocationId.Contains(text, StringComparison.OrdinalIgnoreCase)
                        || l.ItemIds.Any(i => i.Contains(text, StringComparison.OrdinalIgnoreCase)))
            .ToList();
        return new HubPage<HubLocation>(list.Count, list.Skip(skip).Take(top).ToList());
    }

    public async Task<HubLocationFacets> LocationFacetsAsync(string warehouseId, string? company, CancellationToken ct)
    {
        var all = await LocationsAsync(Co(company), warehouseId, ct);
        static List<string> Values(IEnumerable<string?> v) => v.OfType<string>().Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.Ordinal).ToList();
        return new HubLocationFacets(all.Count, Values(all.Select(l => l.Zone)), Values(all.Select(l => l.Aisle)), Values(all.Select(l => l.Profile)));
    }

    public async Task<HubLocationDetail?> LocationAsync(string warehouseId, string locationId, string? company, CancellationToken ct)
    {
        var co = Co(company);
        var loc = (await LocationsAsync(co, warehouseId, ct)).FirstOrDefault(l => l.LocationId.Equals(locationId, StringComparison.OrdinalIgnoreCase));
        if (loc is null) return null;
        var stock = (await WarehouseStockAsync(co, warehouseId, ct))?.Locations.FirstOrDefault(s => s.LocationId.Equals(locationId, StringComparison.OrdinalIgnoreCase));
        return new HubLocationDetail(loc, stock?.Items ?? [], stock?.OpenPicks ?? []);
    }

    public async Task<HubOccupancy> OccupancyAsync(string warehouseId, string? company, CancellationToken ct)
    {
        var all = await LocationsAsync(Co(company), warehouseId, ct);
        static HubOccupancyGroup Group(string? key, IEnumerable<HubLocation> locs)
        {
            var list = locs.ToList();
            return new HubOccupancyGroup(key, list.Count, list.Count(l => l.Qty > 0), list.Count(l => l.OpenPicks > 0));
        }
        // Sin pasillo / sin zona al final.
        List<HubOccupancyGroup> By(Func<HubLocation, string?> key) => all
            .GroupBy(l => key(l) ?? "", StringComparer.OrdinalIgnoreCase)
            .OrderBy(g => g.Key.Length == 0).ThenBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => Group(g.Key.Length == 0 ? null : g.Key, g))
            .ToList();
        return new HubOccupancy(Group(null, all), By(l => l.Aisle), By(l => l.Zone));
    }

    // Todas las ubicaciones del almacén (WarehouseLocations, 5 min) con su stock y picks (los de la vista de almacén, 2 min).
    private async Task<List<HubLocation>> LocationsAsync(string co, string warehouseId, CancellationToken ct)
    {
        var key = $"{co}|{warehouseId}";
        var rowsTask = locationRows.TryGetValue(key, out var cached) && DateTimeOffset.UtcNow - cached.At < LocationsTtl
            ? Task.FromResult(cached.Rows)
            : fno.QueryAsync<LocationRow>("WarehouseLocations", $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)}",
                "WarehouseLocationId,WarehouseZoneId,WarehouseLocationProfileId,WarehouseAisleId,RackId,ShelfId,BinId," +
                "WarehouseLocationXCoordinate,WarehouseLocationYCoordinate,WarehouseLocationZCoordinate", "WarehouseLocationId", null, ct);
        var stockTask = WarehouseStockAsync(co, warehouseId, ct);
        await Task.WhenAll(rowsTask, stockTask);
        locationRows[key] = (rowsTask.Result, cached.Rows == rowsTask.Result ? cached.At : DateTimeOffset.UtcNow);
        var byId = stockTask.Result?.Locations.ToDictionary(s => s.LocationId, StringComparer.OrdinalIgnoreCase) ?? [];
        return rowsTask.Result.Select(r =>
        {
            var s = byId.GetValueOrDefault(r.WarehouseLocationId);
            var items = s?.Items.Select(i => i.ItemId).Distinct(StringComparer.OrdinalIgnoreCase).ToList() ?? [];
            return new HubLocation(r.WarehouseLocationId, Blank(r.WarehouseZoneId), Dashes(r.WarehouseAisleId), r.RackId, r.ShelfId, r.BinId,
                Blank(r.WarehouseLocationProfileId), (double)r.WarehouseLocationXCoordinate, (double)r.WarehouseLocationYCoordinate,
                (double)r.WarehouseLocationZCoordinate, s?.Qty ?? 0, items.Count, items, s?.OpenPicks.Count ?? 0);
        }).ToList();
    }

    private async Task<WarehouseStock?> WarehouseStockAsync(string co, string warehouseId, CancellationToken ct)
    {
        var key = $"{co}|{warehouseId}";
        if (warehouseStock.TryGetValue(key, out var cached) && DateTimeOffset.UtcNow - cached.At < StockTtl) return cached.Stock;
        var stock = await data.GetStockAsync(warehouseId, co, ct);
        warehouseStock[key] = (stock, DateTimeOffset.UtcNow);
        return stock;
    }

    public async Task<IReadOnlyList<HubOperator>> ListOperatorsAsync(string? company, CancellationToken ct)
    {
        var co = Co(company);
        var users = await fno.QueryAsync<MobileUserRow>("WarehouseMobileDeviceUsers", $"dataAreaId eq {Lit(co)}", "UserId,UserName,WarehouseWorkerPersonnelNumber", "UserId", null, ct);
        var names = await WorkerNamesAsync(co, users.Select(u => u.UserId).ToList(), ct);
        return users.Select(u => new HubOperator(u.UserId, names.GetValueOrDefault(u.UserId))).ToList();
    }

    // Líneas de pick cerradas: el usuario, la hora y el tiempo real van en la línea (User ID del formulario de Trabajo).
    // Se piden todas las del rango (hasta 5000) para dar los totales y se pagina aquí.
    public async Task<HubPicks> ListPicksAsync(string warehouseId, string? company, DateTimeOffset from, DateTimeOffset to, string? userId, int skip, int top, CancellationToken ct)
    {
        var co = Co(company);
        var filter = $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)}" +
                     " and WarehouseWorkType eq Microsoft.Dynamics.DataEntities.WHSWorkType'Pick'" +
                     $" and WarehouseWorkStatus eq {WorkStatus}'Closed'" +
                     $" and WarehouseWorkClosedDateTime ge {Utc(from)} and WarehouseWorkClosedDateTime lt {Utc(to)}";
        if (!string.IsNullOrEmpty(userId)) filter += $" and ProcessingWarehouseMobileDeviceUserId eq {Lit(userId)}";
        var rows = await fno.QueryAsync<PickLineRow>("WarehouseWorkLines", filter,
            "WarehouseWorkId,WorkLineNumber,ProcessingWarehouseMobileDeviceUserId,WarehouseWorkClosedDateTime,WarehouseLocationId,ItemNumber," +
            "WorkQuantity,WorkQuantityUnitSymbol,ActualProcessingTimeSeconds,SourceOrderNumber,LoadId",
            "WarehouseWorkClosedDateTime desc", 5000, ct);
        var page = rows.Skip(skip).Take(top).ToList();
        var namesTask = WorkerNamesAsync(co, page.Select(r => Blank(r.ProcessingWarehouseMobileDeviceUserId)).OfType<string>().Distinct().ToList(), ct);
        var productsTask = ProductsAsync(co, ct);
        await Task.WhenAll(namesTask, productsTask);
        var items = page.Select(r =>
        {
            var user = Blank(r.ProcessingWarehouseMobileDeviceUserId);
            var item = Blank(r.ItemNumber);
            return new HubPick(r.WarehouseWorkId, (int)r.WorkLineNumber, user, user is null ? null : namesTask.Result.GetValueOrDefault(user), Date(r.WarehouseWorkClosedDateTime),
                r.WarehouseLocationId, item, item is null ? null : productsTask.Result.GetValueOrDefault(item)?.SearchName ?? item, (double)r.WorkQuantity, Blank(r.WorkQuantityUnitSymbol),
                (double)r.ActualProcessingTimeSeconds, Blank(r.SourceOrderNumber), Blank(r.LoadId));
        }).ToList();
        return new HubPicks(rows.Count, rows.Select(r => r.WarehouseWorkId).Distinct(StringComparer.OrdinalIgnoreCase).Count(),
            (double)rows.Sum(r => r.ActualProcessingTimeSeconds), items);
    }

    private static string Utc(DateTimeOffset d) => d.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss'Z'", System.Globalization.CultureInfo.InvariantCulture);

    // Almacenes WMS de todas las empresas y nombres de las empresas (cambian poco: 10 min).
    private async Task<(List<WmsWarehouseRow> Rows, Dictionary<string, string> Names, DateTimeOffset At)> SitesAsync(CancellationToken ct)
    {
        if (sites is { } s && DateTimeOffset.UtcNow - s.At < ListTtl) return s;
        var whTask = fno.QueryAsync<WmsWarehouseRow>("Warehouses",
            "AreAdvancedWarehouseManagementProcessesEnabled eq Microsoft.Dynamics.DataEntities.NoYes'Yes'", "dataAreaId,WarehouseId,WarehouseName", null, null, ct);
        var leTask = TryQueryAsync<LegalEntityRow>("LegalEntities", "LegalEntityId ne ''", "LegalEntityId,Name", ct);
        await Task.WhenAll(whTask, leTask);
        var names = (leTask.Result ?? []).GroupBy(l => l.LegalEntityId.ToLowerInvariant())
            .ToDictionary(g => g.Key, g => Blank(g.First().Name) ?? g.Key.ToUpperInvariant());
        sites = (whTask.Result, names, DateTimeOffset.UtcNow);
        return sites.Value;
    }

    // Nombre y unidad de todos los artículos liberados de la empresa (10 min): el buscador de artículos busca también por nombre.
    private async Task<Dictionary<string, ProductRow>> ProductsAsync(string co, CancellationToken ct)
    {
        if (products.TryGetValue(co, out var cached) && DateTimeOffset.UtcNow - cached.At < ListTtl) return cached.Rows;
        var rows = await fno.QueryAsync<ProductRow>("ReleasedProductsV2", $"dataAreaId eq {Lit(co)}", "ItemNumber,SearchName,InventoryUnitSymbol", null, null, ct);
        var byId = rows.GroupBy(r => r.ItemNumber, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First() with { SearchName = Blank(g.First().SearchName) }, StringComparer.OrdinalIgnoreCase);
        products[co] = (byId, DateTimeOffset.UtcNow);
        return byId;
    }

    // Disponible físico > 0 por almacén WMS + ubicación + artículo + matrícula + estado (como la vista de almacén), 2 min de caché.
    private async Task<List<StockRow>> StockRowsAsync(string co, CancellationToken ct)
    {
        if (onHand.TryGetValue(co, out var cached) && DateTimeOffset.UtcNow - cached.At < StockTtl) return Rows(cached.Rows);
        var wms = (await ListWarehousesAsync(co, ct)).Select(w => w.WarehouseId).ToList();
        if (wms.Count == 0) return [];
        var rows = await fno.QueryAsync<OnHandRow>("ProjInventoryOnHand",
            $"dataAreaId eq {Lit(co)} and LocationId ne '' and ({AnyOf("WarehouseId", wms)})",
            "ItemNumber,WarehouseId,LocationId,LicensePlateId,InventoryStatusId,AvailPhysical", null, null, ct);
        onHand[co] = (rows, DateTimeOffset.UtcNow);
        log.LogInformation("Hub: stock de {Company} desde F&O, {Rows} filas en {Warehouses} almacenes", co, rows.Count, wms.Count);
        return Rows(rows);

        static List<StockRow> Rows(List<OnHandRow> rows) => rows
            .GroupBy(r => (r.ItemNumber, r.WarehouseId, r.LocationId, Lp: Blank(r.LicensePlateId), Status: Blank(r.InventoryStatusId)))
            .Select(g => new StockRow(g.Key.ItemNumber, g.Key.WarehouseId, g.Key.LocationId, g.Key.Lp, g.Key.Status, (double)g.Sum(r => r.AvailPhysical)))
            .Where(r => r.Qty > 0)
            .ToList();
    }

    // Locked by → nombre del empleado: usuario móvil (WarehouseMobileDeviceUsers) → nº de personal → Workers. 10 min por usuario.
    private async Task<Dictionary<string, string?>> WorkerNamesAsync(string co, List<string> userIds, CancellationToken ct)
    {
        var result = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        var missing = new List<string>();
        foreach (var u in userIds)
        {
            if (workers.TryGetValue($"{co}|{u}", out var w) && DateTimeOffset.UtcNow - w.At < ListTtl) result[u] = w.Name;
            else missing.Add(u);
        }
        if (missing.Count == 0) return result;

        var users = await TryQueryAsync<MobileUserRow>("WarehouseMobileDeviceUsers",
            $"dataAreaId eq {Lit(co)} and ({AnyOf("UserId", missing)})", "UserId,UserName,WarehouseWorkerPersonnelNumber", ct) ?? [];
        var personnel = users.Select(u => Blank(u.WarehouseWorkerPersonnelNumber)).OfType<string>().Distinct().ToList();
        var people = personnel.Count == 0 ? [] : await TryQueryAsync<WorkerRow>("Workers", AnyOf("PersonnelNumber", personnel), "PersonnelNumber,Name", ct) ?? [];
        var nameOf = people.GroupBy(p => p.PersonnelNumber).ToDictionary(g => g.Key, g => Blank(g.First().Name));
        foreach (var u in missing)
        {
            var user = users.FirstOrDefault(x => x.UserId.Equals(u, StringComparison.OrdinalIgnoreCase));
            var name = (Blank(user?.WarehouseWorkerPersonnelNumber) is { } p ? nameOf.GetValueOrDefault(p) : null) ?? Blank(user?.UserName);
            workers[$"{co}|{u}"] = (name, DateTimeOffset.UtcNow);
            result[u] = name;
        }
        return result;
    }

    private async Task<List<T>?> TryQueryAsync<T>(string entitySet, string filter, string select, CancellationToken ct)
    {
        try
        {
            return await fno.QueryAsync<T>(entitySet, filter, select, null, null, ct);
        }
        catch (FnoUnavailableException e)
        {
            log.LogWarning("Hub sin {EntitySet} ({Select}): {Reason}", entitySet, select, e.Message);
            return null;
        }
    }

    private static string StatusFilter(IEnumerable<string> statuses) =>
        "(" + string.Join(" or ", statuses.Select(s => $"WarehouseWorkStatus eq {WorkStatus}'{s}'")) + ")";

    private static string AnyOf(string field, IEnumerable<string> values) => string.Join(" or ", values.Select(v => $"{field} eq {Lit(v)}"));

    // Búsqueda "contiene" con el comodín de F&O (*texto*). Sin texto o con comodines propios, nada.
    private static string? Wildcard(string? q)
    {
        var text = q?.Trim();
        if (string.IsNullOrEmpty(text) || text.Contains('*')) return null;
        return Lit($"*{text}*");
    }

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    // Pasillo «--» (ubicaciones sin estructura): sin pasillo.
    private static string? Dashes(string? s) => Blank(s) is { } v && v.Trim('-').Length > 0 ? v : null;

    private static DateTimeOffset? Date(DateTimeOffset? d) => d is { Year: > 1900 } ? d : null;

    private sealed record StockRow(string ItemNumber, string WarehouseId, string LocationId, string? LicensePlate, string? InventoryStatus, double Qty);

    private sealed record WmsWarehouseRow(string dataAreaId, string WarehouseId, string? WarehouseName);

    private sealed record LegalEntityRow(string LegalEntityId, string? Name);

    private sealed record StartRow(string? D365_UbicacionInicio);

    private sealed record WorkIdRow(string WarehouseWorkId);

    private sealed record HubWorkRow(string WarehouseWorkId, string WarehouseId, string WarehouseWorkStatus, string WarehouseWorkOrderType,
        string? SourceOrderNumber, string? LoadId, DateTimeOffset? WarehouseWorkProcessingStartDateTime, DateTimeOffset? WarehouseWorkClosedDateTime,
        string? WarehouseWorkLockingWarehouseMobileDeviceUserId);

    private sealed record LineIdRow(string WarehouseWorkId, decimal WorkLineNumber);

    private sealed record LoadWorkRow(string WarehouseWorkId, string LoadId, string WarehouseWorkStatus);

    private sealed record LoadStatusRow(string LoadId, string? LoadStatus);

    private sealed record OrderWorkRow(string WarehouseWorkId, string SourceOrderNumber, string? LoadId, string WarehouseWorkStatus);

    private sealed record SalesHeaderRow(string SalesOrderNumber, string? OrderingCustomerAccountNumber, string? SalesOrderName, string? DeliveryAddressName,
        string? SalesOrderStatus, DateTimeOffset? RequestedShippingDate);

    private sealed record LoadLineRow(string WarehouseWorkId, decimal WorkLineNumber, string WarehouseWorkType, string WarehouseWorkStatus, string WarehouseLocationId,
        string? ItemNumber, decimal WorkQuantity, string? WorkQuantityUnitSymbol);

    private sealed record ProductRow(string ItemNumber, string? SearchName, string? InventoryUnitSymbol);

    private sealed record OnHandRow(string ItemNumber, string WarehouseId, string LocationId, string? LicensePlateId, string? InventoryStatusId, decimal AvailPhysical);

    private sealed record PickQtyRow(string WarehouseWorkId, decimal WorkLineNumber, decimal RemainingWorkQuantity);

    private sealed record MobileUserRow(string UserId, string? UserName, string? WarehouseWorkerPersonnelNumber);

    private sealed record WorkerRow(string PersonnelNumber, string? Name);

    private sealed record LocationRow(string WarehouseLocationId, string? WarehouseZoneId, string? WarehouseLocationProfileId,
        string? WarehouseAisleId, int RackId, int ShelfId, int BinId,
        decimal WarehouseLocationXCoordinate, decimal WarehouseLocationYCoordinate, decimal WarehouseLocationZCoordinate);

    private sealed record PickLineRow(string WarehouseWorkId, decimal WorkLineNumber, string? ProcessingWarehouseMobileDeviceUserId, DateTimeOffset? WarehouseWorkClosedDateTime,
        string WarehouseLocationId, string? ItemNumber, decimal WorkQuantity, string? WorkQuantityUnitSymbol, decimal ActualProcessingTimeSeconds, string? SourceOrderNumber, string? LoadId);

    private sealed record WorkMatchRow(string WarehouseWorkId, string WarehouseId, string WarehouseWorkStatus);

    private sealed record LoadWorkMatchRow(string WarehouseWorkId, string LoadId, string WarehouseId);

    private sealed record LocationMatchRow(string WarehouseLocationId, string WarehouseId);
}
