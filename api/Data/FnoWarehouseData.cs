using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Wh3d.Api.Fno;
using Wh3d.Api.Models;
using static Wh3d.Api.Fno.FnoClient;

namespace Wh3d.Api.Data;

// MOCK_MODE=false: todo sale de Finance por OData estándar.
//  - Layout: Warehouses (estrategia/algoritmo y medidas D365_*), InventLocationZones (zonas de la nave), WarehouseLocations
//    (coordenadas o Pasillo-Rack-Estante-Hueco), WarehouseAisles, perfiles y parámetros de WHS (tipos de muelle/staging). Ver AutoLayout.
//  - Ruta: WarehouseWorkHeaders + WarehouseWorkLines en orden de WorkLineNumber (el que deja "Sort picking work lines").
//    Solo el tramo que toca: los picks y el put del primer tramo con líneas sin hacer. No se reordena nada.
//  - Stock: ProjInventoryOnHand (disponible físico por ubicación y matrícula) + WarehouseWorkLines Pick abiertas.
// Empresa: la de ?company= (la pasa la extensión X++ con curExt()); si no llega, el app setting FNO_COMPANY (por defecto usmf).
public sealed class FnoWarehouseData(FnoClient fno, ILogger<FnoWarehouseData> log) : IWarehouseData
{
    private static readonly string Company = Environment.GetEnvironmentVariable("FNO_COMPANY") is { Length: > 0 } c ? c.ToLowerInvariant() : "usmf";
    private static readonly TimeSpan LayoutTtl = TimeSpan.FromMinutes(5);
    // Clave empresa|almacén. Site: ubicaciones tal como están en F&O (las rutas calculan distancias con sus coordenadas,
    // no con la posición del dibujo). Start: ubicación de inicio del almacén (D365_UbicacionInicio), si la hay.
    private readonly ConcurrentDictionary<string, (Site Site, DateTimeOffset At)> layouts = new();

    private sealed record Site(Layout Layout, IReadOnlyDictionary<string, SiteLocation> Locations, string? Start);

    private static string Co(string? company) => string.IsNullOrEmpty(company) ? Company : company.ToLowerInvariant();

    public async Task<Layout?> GetLayoutAsync(string warehouseId, string? company, CancellationToken ct) =>
        (await GetSiteAsync(warehouseId, Co(company), ct))?.Layout;

    public void Forget(string warehouseId, string? company) => layouts.TryRemove($"{Co(company)}|{warehouseId}", out _);

    private async Task<Site?> GetSiteAsync(string warehouseId, string co, CancellationToken ct)
    {
        var key = $"{co}|{warehouseId}";
        if (layouts.TryGetValue(key, out var cached) && DateTimeOffset.UtcNow - cached.At < LayoutTtl) return cached.Site;

        // En paralelo: en un Tier-1 lento cada consulta puede tardar decenas de segundos.
        var whTask = fno.QueryAsync<WarehouseRow>("Warehouses", $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)}",
            "WarehouseId,WarehouseName,DistanceCalculationStrategy,SpatialLocationSortingStrategy", null, 1, ct);
        var rowsTask = fno.QueryAsync<LocationRow>("WarehouseLocations", $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)}",
            "WarehouseLocationId,WarehouseZoneId,WarehouseLocationProfileId,WarehouseAisleId,RackId,ShelfId,BinId," +
            "WarehouseLocationXCoordinate,WarehouseLocationYCoordinate,WarehouseLocationZCoordinate",
            "WarehouseLocationId", null, ct);
        var typesTask = LocationTypesAsync(co, ct);
        var buildingTask = BuildingAsync(co, warehouseId, ct);
        var zonesTask = ZonesAsync(co, warehouseId, ct);
        var aislesTask = TryQueryAsync<AisleRow>("WarehouseAisles", $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)}",
            "AisleId,AisleNumber", ct);
        // Aparte de las medidas: si el entorno aún no tiene el campo, la nave se sigue leyendo.
        var startTask = TryQueryAsync<StartRow>("Warehouses", $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)}",
            "D365_UbicacionInicio", ct);
        await Task.WhenAll(whTask, rowsTask, typesTask, buildingTask, zonesTask, aislesTask, startTask);
        var wh = whTask.Result.FirstOrDefault();
        if (wh is null) return null;

        var (types, profiles) = typesTask.Result;
        var site = rowsTask.Result.Select(r =>
        {
            var profile = r.WarehouseLocationProfileId is { Length: > 0 } p ? profiles.GetValueOrDefault(p) : default;
            return new SiteLocation(r.WarehouseLocationId, Blank(r.WarehouseZoneId), Blank(r.WarehouseLocationProfileId), profile.Type,
                Blank(r.WarehouseAisleId), r.RackId, r.ShelfId, r.BinId,
                (double)r.WarehouseLocationXCoordinate, (double)r.WarehouseLocationYCoordinate, (double)r.WarehouseLocationZCoordinate, profile.Size);
        }).ToList();
        var building = buildingTask.Result;
        var zones = zonesTask.Result;
        var name = string.IsNullOrWhiteSpace(wh.WarehouseName) ? $"Almacén {wh.WarehouseId}" : $"Almacén {wh.WarehouseId} · {wh.WarehouseName}";
        var distance = wh.DistanceCalculationStrategy == "StraightLine" ? "StraightLine" : "CityBlock";
        var sort = wh.SpatialLocationSortingStrategy == "OptimizedRoute" ? "Optimized" : "Fast";

        // Con nave o zonas definidas en F&O, plano completo (y las ubicaciones sin XYZ se colocan solas).
        // Sin ellas, como hasta ahora: solo las ubicaciones con coordenadas.
        var layout = building is { Length: > 0 } || zones.Any(z => z.Length > 0)
            ? AutoLayout.Build(wh.WarehouseId, name, distance, sort, building, zones, site,
                (aislesTask.Result ?? []).Select(a => new SiteAisle(a.AisleId, a.AisleNumber)).ToList(), types)
            : BuildLayout(wh.WarehouseId, name, distance, sort, site.Where(l => l.HasCoordinates).ToList(), types);
        var byId = site.GroupBy(l => l.Id, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        // Cada ubicación lleva también sus campos de F&O: el panel enseña esos, no los calculados para dibujar.
        layout = layout with
        {
            Locations = layout.Locations.Select(l => byId.TryGetValue(l.LocationId, out var s)
                ? l with { Fno = new FnoLocation(s.WhsZone, s.AisleId, s.Rack, s.Shelf, s.Bin, s.X, s.Y, s.Z) }
                : l).ToList(),
        };
        var result = new Site(layout, byId, Blank(startTask.Result?.FirstOrDefault()?.D365_UbicacionInicio));
        layouts[key] = (result, DateTimeOffset.UtcNow);
        log.LogInformation("Layout {Company}/{Warehouse} desde F&O: {Count} ubicaciones, {Zones} zonas, nave {Building}, inicio {Start}",
            co, warehouseId, layout.Locations.Count, zones.Count, building is null ? "no" : $"{building.Length}x{building.Width}", result.Start ?? "no");
        return result;
    }

    // Tipos de ubicación de los parámetros de WHS y, de cada perfil (por empresa), su tipo y sus medidas reales.
    private async Task<(LocationTypes Types, Dictionary<string, (string? Type, ProfileSize? Size)> Profiles)> LocationTypesAsync(string co, CancellationToken ct)
    {
        var paramsTask = TryQueryAsync<WhsParamsRow>("WarehouseManagementParametersV2", $"dataAreaId eq {Lit(co)}",
            "DefaultFinalShippingWarehouseLocationTypeId,DefaultStagingWarehouseLocationTypeId,PackingWarehouseLocationType,DefaultUserWarehouseLocationProfileId", ct);
        var profilesTask = TryQueryAsync<ProfileRow>("WarehouseLocationProfiles", $"dataAreaId eq {Lit(co)}",
            "ProfileId,WarehouseLocationTypeId,ActualLocationHeight,ActualLocationWidth,ActualLocationDepth", ct);
        await Task.WhenAll(paramsTask, profilesTask);
        var p = paramsTask.Result?.FirstOrDefault();
        var types = new LocationTypes(Blank(p?.DefaultFinalShippingWarehouseLocationTypeId), Blank(p?.DefaultStagingWarehouseLocationTypeId),
            Blank(p?.PackingWarehouseLocationType), Blank(p?.DefaultUserWarehouseLocationProfileId));
        var byProfile = (profilesTask.Result ?? []).GroupBy(r => r.ProfileId, StringComparer.OrdinalIgnoreCase).Select(g => g.First())
            .ToDictionary(r => r.ProfileId, r => (Blank(r.WarehouseLocationTypeId),
                r.ActualLocationHeight > 0 || r.ActualLocationWidth > 0 || r.ActualLocationDepth > 0
                    ? new ProfileSize((double)r.ActualLocationHeight, (double)r.ActualLocationWidth, (double)r.ActualLocationDepth)
                    : null), StringComparer.OrdinalIgnoreCase);
        return (types, byProfile);
    }

    // Medidas de la nave: campos D365_* de la extensión de Warehouses. Si el entorno no los tiene, no hay nave.
    private async Task<Building?> BuildingAsync(string co, string warehouseId, CancellationToken ct)
    {
        var rows = await TryQueryAsync<BuildingRow>("Warehouses", $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)}",
            "D365_Largo,D365_Ancho,D365_AlturaLibre,D365_AlturaEstanterias", ct);
        return rows?.FirstOrDefault() is { } b && (b.D365_Largo > 0 || b.D365_Ancho > 0)
            ? new Building((double)b.D365_Largo, (double)b.D365_Ancho, (double)b.D365_AlturaLibre, (double)b.D365_AlturaEstanterias)
            : null;
    }

    // Zonas de la nave (entidad InventLocationZones). La función (enum D365_WarehouseZoneFunction) se publica como Function
    // o ZoneFunction según el entorno; si no existe, se deduce del nombre de la zona.
    private async Task<List<SiteZone>> ZonesAsync(string co, string warehouseId, CancellationToken ct)
    {
        var filter = $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)}";
        var rows = await TryQueryAsync<ZoneRow>("InventLocationZones", filter, "ZoneNumber,ZoneName,Length,Width,Function", ct)
                   ?? await TryQueryAsync<ZoneRow>("InventLocationZones", filter, "ZoneNumber,ZoneName,Length,Width,ZoneFunction", ct)
                   ?? await TryQueryAsync<ZoneRow>("InventLocationZones", filter, "ZoneNumber,ZoneName,Length,Width", ct)
                   ?? [];
        return rows.Select(z => new SiteZone(z.ZoneNumber, z.ZoneName ?? "", Blank(z.Function ?? z.ZoneFunction), (double)z.Length, (double)z.Width)).ToList();
    }

    // Para datos opcionales (extensiones propias, parámetros): si la consulta falla, se sigue sin ellos.
    private async Task<List<T>?> TryQueryAsync<T>(string entitySet, string filter, string select, CancellationToken ct)
    {
        try
        {
            return await fno.QueryAsync<T>(entitySet, filter, select, null, null, ct);
        }
        catch (FnoUnavailableException e)
        {
            log.LogWarning("Sin {EntitySet} ({Select}): {Reason}", entitySet, select, e.Message);
            return null;
        }
    }

    public async Task<Route?> GetRouteAsync(string workId, string? company, CancellationToken ct)
    {
        var co = Co(company);
        // Las líneas solo dependen del WorkId: se piden a la vez que la cabecera (una ida y vuelta a F&O menos).
        var linesTask = LinesAsync(workId, co, ct);
        _ = linesTask.ContinueWith(t => _ = t.Exception, TaskContinuationOptions.OnlyOnFaulted);
        var header = (await fno.QueryAsync<WorkHeaderRow>("WarehouseWorkHeaders",
            $"dataAreaId eq {Lit(co)} and WarehouseWorkId eq {Lit(workId)}", HeaderSelect, null, 1, ct)).FirstOrDefault();
        return header is null ? null : await BuildRouteAsync(header, co, ct, linesTask);
    }

    public async Task<IReadOnlyList<Route>?> GetLoadRoutesAsync(string loadId, string? company, CancellationToken ct)
    {
        var co = Co(company);
        var headers = await fno.QueryAsync<WorkHeaderRow>("WarehouseWorkHeaders",
            $"dataAreaId eq {Lit(co)} and LoadId eq {Lit(loadId)} and WarehouseWorkOrderType eq Microsoft.Dynamics.DataEntities.WHSWorkTransType'Sales'",
            HeaderSelect, "WarehouseWorkId", null, ct);
        var routes = new List<Route>();
        foreach (var h in headers.Where(h => h.WarehouseWorkStatus != "Cancelled"))
        {
            if (await BuildRouteAsync(h, co, ct) is { } r) routes.Add(r);
        }
        return routes;
    }

    public async Task<IReadOnlyList<WorkSummary>> ListWorksAsync(string warehouseId, string? company, string status, int top, CancellationToken ct)
    {
        var co = Co(company);
        var filter = $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)} and WarehouseWorkOrderType eq Microsoft.Dynamics.DataEntities.WHSWorkTransType'Sales'";
        filter += status switch
        {
            "open" => " and (WarehouseWorkStatus eq Microsoft.Dynamics.DataEntities.WHSWorkStatus'Open' or WarehouseWorkStatus eq Microsoft.Dynamics.DataEntities.WHSWorkStatus'InProcess')",
            "closed" => " and WarehouseWorkStatus eq Microsoft.Dynamics.DataEntities.WHSWorkStatus'Closed'",
            _ => "",
        };
        var rows = await fno.QueryAsync<WorkHeaderRow>("WarehouseWorkHeaders", filter, HeaderSelect, "WarehouseWorkId desc", top, ct);
        return rows.Select(h => new WorkSummary(h.WarehouseWorkId, Blank(h.LoadId), h.WarehouseId, h.WarehouseWorkStatus,
            Date(h.WarehouseWorkProcessingStartDateTime), Date(h.WarehouseWorkClosedDateTime))).ToList();
    }

    // Works cogidos en la app móvil: Locked by (WarehouseWorkLockingWarehouseMobileDeviceUserId) relleno y abiertos o en curso.
    // De ahí al empleado: usuario móvil → nº de personal (WarehouseMobileDeviceUsers) → Workers (correo de Entra o de contacto).
    public async Task<IReadOnlyList<(Route Route, string UserId, string? PersonnelNumber, string? WorkerName, string? Email)>> LockedWorksAsync(
        string? warehouseId, string? company, CancellationToken ct)
    {
        var co = Co(company);
        var filter = $"dataAreaId eq {Lit(co)} and WarehouseWorkLockingWarehouseMobileDeviceUserId ne '' " +
                     "and WarehouseWorkOrderType eq Microsoft.Dynamics.DataEntities.WHSWorkTransType'Sales' " +
                     "and (WarehouseWorkStatus eq Microsoft.Dynamics.DataEntities.WHSWorkStatus'Open' or WarehouseWorkStatus eq Microsoft.Dynamics.DataEntities.WHSWorkStatus'InProcess')";
        if (!string.IsNullOrEmpty(warehouseId)) filter += $" and WarehouseId eq {Lit(warehouseId)}";
        var headers = await fno.QueryAsync<LockedHeaderRow>("WarehouseWorkHeaders", filter,
            HeaderSelect + ",WarehouseWorkLockingWarehouseMobileDeviceUserId", "WarehouseWorkId desc", 50, ct);

        var result = new List<(Route, string, string?, string?, string?)>();
        foreach (var h in headers)
        {
            var header = new WorkHeaderRow(h.WarehouseWorkId, h.LoadId, h.WarehouseId, h.WarehouseWorkStatus,
                h.WarehouseWorkProcessingStartDateTime, h.WarehouseWorkClosedDateTime, h.SourceOrderNumber);
            var userId = h.WarehouseWorkLockingWarehouseMobileDeviceUserId;
            var routeTask = BuildRouteAsync(header, co, ct);
            var user = (await fno.QueryAsync<MobileUserRow>("WarehouseMobileDeviceUsers",
                $"dataAreaId eq {Lit(co)} and UserId eq {Lit(userId)}", "UserId,UserName,WarehouseWorkerPersonnelNumber", null, 1, ct)).FirstOrDefault();
            var personnel = Blank(user?.WarehouseWorkerPersonnelNumber);
            var worker = personnel is null ? null : (await fno.QueryAsync<WorkerRow>("Workers",
                $"PersonnelNumber eq {Lit(personnel)}", "PersonnelNumber,Name,IdentityEmail,PrimaryContactEmail", null, 1, ct)).FirstOrDefault();
            var email = Blank(worker?.IdentityEmail) ?? Blank(worker?.PrimaryContactEmail);
            if (email is null) log.LogWarning("Work {WorkId}: el usuario {User} no tiene empleado con correo (nº {Personnel})", h.WarehouseWorkId, userId, personnel);
            if (await routeTask is { } route) result.Add((route, userId, personnel, Blank(worker?.Name) ?? Blank(user?.UserName), email));
        }
        return result;
    }

    // Disponible físico (AvailPhysical) sumado por ubicación + artículo + matrícula + estado: F&O guarda
    // varias filas por dimensión y algunas en negativo (reservas), así que se suma y se quita lo que queda ≤ 0.
    public async Task<WarehouseStock?> GetStockAsync(string warehouseId, string? company, CancellationToken ct)
    {
        var co = Co(company);
        if (await GetLayoutAsync(warehouseId, co, ct) is null) return null;

        var onHandTask = fno.QueryAsync<OnHandRow>("ProjInventoryOnHand",
            $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)} and LocationId ne ''",
            "ItemNumber,LocationId,LicensePlateId,InventoryStatusId,AvailPhysical", null, null, ct);
        var picksTask = fno.QueryAsync<OpenPickRow>("WarehouseWorkLines",
            $"dataAreaId eq {Lit(co)} and WarehouseId eq {Lit(warehouseId)} and WarehouseWorkType eq Microsoft.Dynamics.DataEntities.WHSWorkType'Pick'" +
            " and (WarehouseWorkStatus eq Microsoft.Dynamics.DataEntities.WHSWorkStatus'Open' or WarehouseWorkStatus eq Microsoft.Dynamics.DataEntities.WHSWorkStatus'InProcess')",
            "WarehouseWorkId,WorkLineNumber,WarehouseLocationId,ItemNumber,RemainingWorkQuantity,WorkQuantityUnitSymbol",
            "WarehouseWorkId,WorkLineNumber", null, ct);
        await Task.WhenAll(onHandTask, picksTask);
        var onHand = onHandTask.Result;
        var picks = picksTask.Result;

        var products = await ProductsAsync(onHand.Select(r => r.ItemNumber).Concat(picks.Select(p => p.ItemNumber ?? "")).Where(i => i.Length > 0).Distinct().ToList(), co, ct);

        var items = onHand
            .GroupBy(r => (r.LocationId, r.ItemNumber, Lp: Blank(r.LicensePlateId), Status: Blank(r.InventoryStatusId)))
            .Select(g => (g.Key.LocationId, Item: new StockItem(g.Key.ItemNumber, products.GetValueOrDefault(g.Key.ItemNumber)?.SearchName ?? g.Key.ItemNumber,
                (double)g.Sum(r => r.AvailPhysical), products.GetValueOrDefault(g.Key.ItemNumber)?.InventoryUnitSymbol ?? "", g.Key.Lp, g.Key.Status)))
            .Where(t => t.Item.Qty > 0)
            .ToLookup(t => t.LocationId, t => t.Item, StringComparer.OrdinalIgnoreCase);
        var openPicks = picks.Where(p => p.WarehouseLocationId.Length > 0)
            .ToLookup(p => p.WarehouseLocationId, p => new OpenPick(p.WarehouseWorkId, (int)p.WorkLineNumber, p.ItemNumber ?? "",
                (double)p.RemainingWorkQuantity, p.WorkQuantityUnitSymbol ?? ""), StringComparer.OrdinalIgnoreCase);

        var locations = items.Select(g => g.Key).Concat(openPicks.Select(g => g.Key)).Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.Ordinal)
            .Select(id =>
            {
                var its = items[id].OrderByDescending(i => i.Qty).ThenBy(i => i.ItemId, StringComparer.Ordinal).ToList();
                return new LocationStock(id, its.Sum(i => i.Qty), its, openPicks[id].ToList());
            }).ToList();

        log.LogInformation("Stock {Company}/{Warehouse} desde F&O: {Locations} ubicaciones, {Picks} picks abiertos", co, warehouseId, locations.Count, picks.Count);
        return new WarehouseStock(warehouseId, DateTimeOffset.UtcNow, "AvailablePhysical", locations);
    }

    private const string HeaderSelect = "WarehouseWorkId,LoadId,WarehouseId,WarehouseWorkStatus,WarehouseWorkProcessingStartDateTime,WarehouseWorkClosedDateTime,SourceOrderNumber";

    private Task<List<WorkLineRow>> LinesAsync(string workId, string co, CancellationToken ct) =>
        fno.QueryAsync<WorkLineRow>("WarehouseWorkLines",
            $"dataAreaId eq {Lit(co)} and WarehouseWorkId eq {Lit(workId)}",
            "WorkLineNumber,WarehouseWorkType,WarehouseWorkStatus,WarehouseLocationId,ItemNumber,WorkQuantity,WorkQuantityUnitSymbol,WarehouseWorkClosedDateTime",
            "WorkLineNumber", null, ct);

    private async Task<Route?> BuildRouteAsync(WorkHeaderRow h, string co, CancellationToken ct, Task<List<WorkLineRow>>? linesTask = null)
    {
        // Plano (normalmente en caché) y líneas a la vez.
        var siteTask = GetSiteAsync(h.WarehouseId, co, ct);
        var lines = await (linesTask ?? LinesAsync(h.WarehouseWorkId, co, ct));
        var siteData = await siteTask;
        var layout = siteData?.Layout;

        // El tramo que toca: unos picks y el put que los deja (ver CurrentLeg).
        var (picks, putRow, previousPut) = CurrentLeg(lines);

        var byId = layout?.Locations.ToDictionary(l => l.LocationId, StringComparer.OrdinalIgnoreCase) ?? [];
        var products = await ProductsAsync(picks.Select(p => p.ItemNumber ?? "").Where(i => i.Length > 0).Distinct().ToList(), co, ct);

        var missing = picks.Select(p => p.WarehouseLocationId).Append(putRow?.WarehouseLocationId ?? "").Where(id => id.Length > 0 && !byId.ContainsKey(id)).Distinct().ToList();
        if (missing.Count > 0) log.LogWarning("Work {WorkId}: ubicaciones sin coordenadas {Missing}", h.WarehouseWorkId, string.Join(", ", missing));

        // Coordenadas de F&O si las tiene (las distancias son las suyas); si no, donde la ha puesto el plano.
        (double X, double Y, double Z) Point(string id)
        {
            if (siteData?.Locations.GetValueOrDefault(id) is { HasCoordinates: true } s) return (s.X, s.Y, s.Z);
            return byId.TryGetValue(id, out var loc) ? (loc.X, loc.Y, loc.Z) : (0, 0, 0);
        }

        var routeLines = picks.Select(p =>
        {
            var (x, y, z) = Point(p.WarehouseLocationId);
            var item = p.ItemNumber ?? "";
            // Sin artículo: F&O consolida la mercancía de varios picks en una línea (el pick desde STAGE-OUT).
            var name = item.Length == 0 ? "Varios artículos" : products.GetValueOrDefault(item)?.SearchName ?? item;
            return new RouteLine((int)p.WorkLineNumber, "Pick", p.WarehouseLocationId, item, name,
                (double)p.WorkQuantity, p.WorkQuantityUnitSymbol ?? "", x, y, z, 0, Date(p.WarehouseWorkClosedDateTime));
        }).ToList();

        var putId = putRow?.WarehouseLocationId ?? "";
        var (px, py, pz) = Point(putId);
        var put = new PutLocation(putId, px, py, pz);

        // Inicio del recorrido: la ubicación de inicio del almacén, si existe en F&O. Solo en el primer tramo: en los
        // siguientes, el operario ya está donde dejó el anterior.
        PutLocation? start = null;
        if (previousPut is null && siteData?.Start is { } startId)
        {
            if (byId.ContainsKey(startId) || siteData.Locations.ContainsKey(startId))
            {
                var (sx, sy, sz) = Point(startId);
                start = new PutLocation(siteData.Locations.GetValueOrDefault(startId)?.Id ?? startId, sx, sy, sz);
            }
            else log.LogWarning("Ubicación de inicio {Start} del almacén {Warehouse} no existe", startId, h.WarehouseId);
        }

        log.LogInformation("F&O work {WorkId}: {Picks} picks hacia {Put}", h.WarehouseWorkId, routeLines.Count, put.LocationId);
        return new Route(h.WarehouseWorkId, Blank(h.LoadId), h.WarehouseId, h.WarehouseWorkStatus,
            layout?.DistanceStrategy ?? "CityBlock", layout?.SortAlgorithm ?? "Fast", put, routeLines, 0, [],
            Date(h.WarehouseWorkProcessingStartDateTime), Date(h.WarehouseWorkClosedDateTime), start, previousPut, Blank(h.SourceOrderNumber));
    }

    // Un work va por tramos: picks → put (STAGE-OUT) → pick → put (BAYDOOR). La ruta es el primer tramo con líneas sin
    // hacer. Si no queda ninguna (cerrado o cancelado), el primero: lo que recogió, con sus horas, como en el histórico.
    // PreviousPut: dónde se dejó el tramo anterior, si no es el primero.
    private static (List<WorkLineRow> Picks, WorkLineRow? Put, string? PreviousPut) CurrentLeg(List<WorkLineRow> lines)
    {
        var legs = new List<(List<WorkLineRow> Picks, WorkLineRow? Put)>();
        var picks = new List<WorkLineRow>();
        foreach (var l in lines)
        {
            if (l.WarehouseWorkType == "Pick") picks.Add(l);
            else if (l.WarehouseWorkType == "Put")
            {
                legs.Add((picks, l));
                picks = [];
            }
        }
        if (picks.Count > 0) legs.Add((picks, null));
        if (legs.Count == 0) return ([], null, null);

        static bool Pending(WorkLineRow? l) => l?.WarehouseWorkStatus is "Open" or "InProcess";
        var i = legs.FindIndex(leg => leg.Picks.Count > 0 && (leg.Picks.Any(Pending) || Pending(leg.Put)));
        if (i < 0) i = 0;
        return (legs[i].Picks, legs[i].Put, i > 0 ? Blank(legs[i - 1].Put?.WarehouseLocationId) : null);
    }

    // Nombre (SearchName) y unidad de inventario de los artículos; los que no tienen nombre se quedan con el código.
    private async Task<Dictionary<string, ProductRow>> ProductsAsync(List<string> items, string co, CancellationToken ct)
    {
        if (items.Count == 0) return [];
        var filter = $"dataAreaId eq {Lit(co)} and (" + string.Join(" or ", items.Select(i => $"ItemNumber eq {Lit(i)}")) + ")";
        var rows = await fno.QueryAsync<ProductRow>("ReleasedProductsV2", filter, "ItemNumber,SearchName,InventoryUnitSymbol", null, null, ct);
        return rows.ToDictionary(r => r.ItemNumber,
            r => r with { SearchName = string.IsNullOrWhiteSpace(r.SearchName) ? null : r.SearchName }, StringComparer.OrdinalIgnoreCase);
    }

    // Sin nave ni zonas: layout a partir de las coordenadas. Pasillo = columna X (A, B, C… de izquierda a derecha),
    // rack = orden en Y dentro del pasillo, nivel = Z. Muelles/staging según los tipos de ubicación de los parámetros de WHS.
    private static Layout BuildLayout(string warehouseId, string name, string distance, string sort, List<SiteLocation> rows, LocationTypes types)
    {
        var withKind = rows.Select(r => (Loc: r, Function: ZoneFunctions.Of(r, types))).Where(t => t.Function is not null).ToList();
        var puts = withKind.Where(t => t.Function is not ZoneFunctions.Storage).Select(t => t.Loc.Id).ToList();
        var storage = withKind.Where(t => t.Function is ZoneFunctions.Storage).Select(t => t.Loc).ToList();
        var aisleByX = storage.Select(r => r.X).Distinct().Order()
            .Select((x, i) => (x, name: ((char)('A' + i)).ToString())).ToDictionary(t => t.x, t => t.name);

        var locations = withKind.Select(t =>
        {
            var r = t.Loc;
            var isPut = t.Function is not ZoneFunctions.Storage;
            var kind = t.Function switch
            {
                ZoneFunctions.Receiving or ZoneFunctions.Shipping => "DOCK",
                ZoneFunctions.Consolidation => "STAGE",
                _ => r.Z > 0 || (r.Profile ?? "").Contains("BULK", StringComparison.OrdinalIgnoreCase) ? "BULK" : "PICK",
            };
            var aisle = isPut ? "-" : aisleByX[r.X];
            var rack = isPut ? 0 : storage.Where(s => s.X == r.X).Select(s => s.Y).Distinct().Order().ToList().IndexOf(r.Y) + 1;
            var level = (int)Math.Round(r.Z);
            (double sx, double sy, double sz) size = kind switch
            {
                "DOCK" => (3, 1, 0.2),
                "STAGE" => (string.Equals(r.Type, types.Staging, StringComparison.OrdinalIgnoreCase) ? 6 : 3, 1.2, 0.2),
                _ => (1.2, 1.0, 1.0),
            };
            return new Location(r.Id, kind, aisle, rack, level, r.X, r.Y, r.Z, r.Profile ?? "", size.sx, size.sy, size.sz);
        }).ToList();

        const double margin = 3;
        var bounds = locations.Count == 0
            ? new Bounds(0, 10, 0, 10, 0)
            : new Bounds(
                Math.Floor(locations.Min(l => l.X) - margin), Math.Ceiling(locations.Max(l => l.X) + margin),
                Math.Floor(locations.Min(l => l.Y) - margin), Math.Ceiling(locations.Max(l => l.Y) + margin),
                locations.Max(l => l.Level));

        return new Layout(warehouseId, name, bounds, locations, puts, distance, sort);
    }

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s;

    // F&O devuelve 1900-01-01 para "sin fecha".
    private static DateTimeOffset? Date(DateTimeOffset? d) => d is { Year: > 1900 } ? d : null;

    private sealed record WarehouseRow(string WarehouseId, string? WarehouseName, string DistanceCalculationStrategy, string SpatialLocationSortingStrategy);

    private sealed record LocationRow(string WarehouseLocationId, string? WarehouseZoneId, string? WarehouseLocationProfileId,
        string? WarehouseAisleId, int RackId, int ShelfId, int BinId,
        decimal WarehouseLocationXCoordinate, decimal WarehouseLocationYCoordinate, decimal WarehouseLocationZCoordinate);

    private sealed record AisleRow(string AisleId, int AisleNumber);

    private sealed record ProfileRow(string ProfileId, string? WarehouseLocationTypeId,
        decimal ActualLocationHeight, decimal ActualLocationWidth, decimal ActualLocationDepth);

    private sealed record WhsParamsRow(string? DefaultFinalShippingWarehouseLocationTypeId, string? DefaultStagingWarehouseLocationTypeId,
        string? PackingWarehouseLocationType, string? DefaultUserWarehouseLocationProfileId);

    private sealed record StartRow(string? D365_UbicacionInicio);

    private sealed record BuildingRow(decimal D365_Largo, decimal D365_Ancho, decimal D365_AlturaLibre, decimal D365_AlturaEstanterias);

    private sealed record ZoneRow(int ZoneNumber, string? ZoneName, decimal Length, decimal Width, string? Function, string? ZoneFunction);

    private sealed record WorkHeaderRow(string WarehouseWorkId, string? LoadId, string WarehouseId, string WarehouseWorkStatus,
        DateTimeOffset? WarehouseWorkProcessingStartDateTime, DateTimeOffset? WarehouseWorkClosedDateTime, string? SourceOrderNumber = null);

    private sealed record LockedHeaderRow(string WarehouseWorkId, string? LoadId, string WarehouseId, string WarehouseWorkStatus,
        DateTimeOffset? WarehouseWorkProcessingStartDateTime, DateTimeOffset? WarehouseWorkClosedDateTime, string WarehouseWorkLockingWarehouseMobileDeviceUserId, string? SourceOrderNumber = null);

    private sealed record MobileUserRow(string UserId, string? UserName, string? WarehouseWorkerPersonnelNumber);

    private sealed record WorkerRow(string PersonnelNumber, string? Name, string? IdentityEmail, string? PrimaryContactEmail);

    private sealed record WorkLineRow(decimal WorkLineNumber, string WarehouseWorkType, string WarehouseLocationId, string? ItemNumber,
        decimal WorkQuantity, string? WorkQuantityUnitSymbol, DateTimeOffset? WarehouseWorkClosedDateTime, string? WarehouseWorkStatus);

    private sealed record ProductRow(string ItemNumber, string? SearchName, string? InventoryUnitSymbol);

    private sealed record OnHandRow(string ItemNumber, string LocationId, string? LicensePlateId, string? InventoryStatusId, decimal AvailPhysical);

    private sealed record OpenPickRow(string WarehouseWorkId, decimal WorkLineNumber, string WarehouseLocationId, string? ItemNumber,
        decimal RemainingWorkQuantity, string? WorkQuantityUnitSymbol);
}
