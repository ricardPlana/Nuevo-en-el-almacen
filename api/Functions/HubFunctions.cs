using System.Collections.Specialized;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Wh3d.Api.Auth;
using Wh3d.Api.Data;
using Wh3d.Api.Fno;

namespace Wh3d.Api.Functions;

// Endpoints del hub (/hub/ de la SPA), todos de solo lectura y bajo /api/hub/. No tocan los de la vista 3D.
// Listas paginadas con ?skip=&top= (top 1–100, por defecto 25). ?company= como el resto.
public sealed class HubFunctions(IHubData hub, ILogger<HubFunctions> log)
{
    [Function("HubCompanies")]
    public Task<HttpResponseData> Companies(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/companies")] HttpRequestData req) =>
        Run(req, "HubCompanies", (_, ct) => hub.ListCompaniesAsync(ct));

    [Function("HubWarehouses")]
    public Task<HttpResponseData> Warehouses(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/warehouses")] HttpRequestData req) =>
        Run(req, "HubWarehouses", (co, ct) => hub.ListWarehousesAsync(co, ct));

    [Function("HubWarehouseSummary")]
    public async Task<HttpResponseData> WarehouseSummary(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/warehouses/{warehouseId}/summary")] HttpRequestData req,
        string warehouseId) =>
        await Run(req, "HubWarehouseSummary", async (co, ct) => await hub.WarehouseSummaryAsync(warehouseId, co, ct), new { error = "WAREHOUSE_NOT_FOUND", warehouseId });

    // ?warehouseId=&status=open|closed|all&cancelled=1&q=
    [Function("HubWorks")]
    public Task<HttpResponseData> Works(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/works")] HttpRequestData req)
    {
        var q = Query(req);
        if (q["warehouseId"] is not { Length: > 0 } wh) return Http.Write(req, HttpStatusCode.BadRequest, new { error = "WAREHOUSE_REQUIRED" });
        var (skip, top) = Paging(q);
        return Run(req, "HubWorks", (co, ct) => hub.ListWorksAsync(wh, co, Status(q), q["cancelled"] == "1", q["q"], skip, top, ct));
    }

    [Function("HubLoads")]
    public Task<HttpResponseData> Loads(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/loads")] HttpRequestData req)
    {
        var q = Query(req);
        if (q["warehouseId"] is not { Length: > 0 } wh) return Http.Write(req, HttpStatusCode.BadRequest, new { error = "WAREHOUSE_REQUIRED" });
        var (skip, top) = Paging(q);
        return Run(req, "HubLoads", (co, ct) => hub.ListLoadsAsync(wh, co, Status(q), q["cancelled"] == "1", q["q"], skip, top, ct));
    }

    // La carga por dentro: pedidos y works. ?warehouseId=&cancelled=1
    [Function("HubLoadDetail")]
    public async Task<HttpResponseData> LoadDetail(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/loads/{loadId}")] HttpRequestData req,
        string loadId)
    {
        var q = Query(req);
        if (q["warehouseId"] is not { Length: > 0 } wh) return await Http.Write(req, HttpStatusCode.BadRequest, new { error = "WAREHOUSE_REQUIRED" });
        return await Run(req, "HubLoadDetail", async (co, ct) => await hub.LoadDetailAsync(loadId, wh, co, q["cancelled"] == "1", ct), new { error = "LOAD_NOT_FOUND", loadId });
    }

    // Pedidos de venta con works abiertos o en curso. ?warehouseId=&q=
    [Function("HubOrders")]
    public Task<HttpResponseData> Orders(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/orders")] HttpRequestData req)
    {
        var q = Query(req);
        if (q["warehouseId"] is not { Length: > 0 } wh) return Http.Write(req, HttpStatusCode.BadRequest, new { error = "WAREHOUSE_REQUIRED" });
        var (skip, top) = Paging(q);
        return Run(req, "HubOrders", (co, ct) => hub.ListOrdersAsync(wh, co, q["q"], skip, top, ct));
    }

    [Function("HubOrderDetail")]
    public async Task<HttpResponseData> OrderDetail(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/orders/{orderNumber}")] HttpRequestData req,
        string orderNumber)
    {
        if (Query(req)["warehouseId"] is not { Length: > 0 } wh) return await Http.Write(req, HttpStatusCode.BadRequest, new { error = "WAREHOUSE_REQUIRED" });
        return await Run(req, "HubOrderDetail", async (co, ct) => await hub.OrderDetailAsync(orderNumber, wh, co, ct), new { error = "ORDER_NOT_FOUND", orderNumber });
    }

    // Artículos liberados de la empresa con su stock en los almacenes WMS. ?stock=1: solo los que tienen stock;
    // ?warehouseId=: solo los que tienen stock en ese almacén.
    [Function("HubItems")]
    public Task<HttpResponseData> Items(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/items")] HttpRequestData req)
    {
        var q = Query(req);
        var (skip, top) = Paging(q);
        return Run(req, "HubItems", (co, ct) => hub.ListItemsAsync(Blank(q["warehouseId"]), q["stock"] == "1", co, q["q"], skip, top, ct));
    }

    [Function("HubItemStock")]
    public async Task<HttpResponseData> ItemStock(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/items/{itemId}/stock")] HttpRequestData req,
        string itemId)
    {
        var wh = Blank(Query(req)["warehouseId"]);
        return await Run(req, "HubItemStock", async (co, ct) => await hub.ItemStockAsync(itemId, wh, co, ct), new { error = "ITEM_NOT_FOUND", itemId });
    }

    // ?warehouseId=&filter=all|stock|empty|picks&zone=&aisle=&profile=&q=
    [Function("HubLocations")]
    public Task<HttpResponseData> Locations(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/locations")] HttpRequestData req)
    {
        var q = Query(req);
        if (q["warehouseId"] is not { Length: > 0 } wh) return Http.Write(req, HttpStatusCode.BadRequest, new { error = "WAREHOUSE_REQUIRED" });
        var (skip, top) = Paging(q);
        var filter = q["filter"] is "stock" or "empty" or "picks" ? q["filter"]! : "all";
        return Run(req, "HubLocations", (co, ct) => hub.ListLocationsAsync(wh, co, filter, Blank(q["zone"]), Blank(q["aisle"]), Blank(q["profile"]), q["q"], skip, top, ct));
    }

    [Function("HubOccupancy")]
    public Task<HttpResponseData> Occupancy(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/occupancy")] HttpRequestData req)
    {
        if (Query(req)["warehouseId"] is not { Length: > 0 } wh) return Http.Write(req, HttpStatusCode.BadRequest, new { error = "WAREHOUSE_REQUIRED" });
        return Run(req, "HubOccupancy", (co, ct) => hub.OccupancyAsync(wh, co, ct));
    }

    [Function("HubOperators")]
    public Task<HttpResponseData> Operators(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/operators")] HttpRequestData req) =>
        Run(req, "HubOperators", (co, ct) => hub.ListOperatorsAsync(co, ct));

    // Revisión de operarios. ?warehouseId=&from=&to=&userId= (from y to, ISO con zona: el día en la hora del navegador).
    [Function("HubPicks")]
    public Task<HttpResponseData> Picks(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/picks")] HttpRequestData req)
    {
        var q = Query(req);
        if (q["warehouseId"] is not { Length: > 0 } wh) return Http.Write(req, HttpStatusCode.BadRequest, new { error = "WAREHOUSE_REQUIRED" });
        if (!DateTimeOffset.TryParse(q["from"], System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var from) ||
            !DateTimeOffset.TryParse(q["to"], System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var to))
        {
            return Http.Write(req, HttpStatusCode.BadRequest, new { error = "INVALID_DATES" });
        }
        var (skip, top) = Paging(q);
        return Run(req, "HubPicks", (co, ct) => hub.ListPicksAsync(wh, co, from, to, Blank(q["userId"]), skip, top, ct));
    }

    [Function("HubLocationFacets")]
    public Task<HttpResponseData> LocationFacets(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/location-facets")] HttpRequestData req)
    {
        if (Query(req)["warehouseId"] is not { Length: > 0 } wh) return Http.Write(req, HttpStatusCode.BadRequest, new { error = "WAREHOUSE_REQUIRED" });
        return Run(req, "HubLocationFacets", (co, ct) => hub.LocationFacetsAsync(wh, co, ct));
    }

    [Function("HubLocation")]
    public async Task<HttpResponseData> Location(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/locations/{locationId}")] HttpRequestData req,
        string locationId)
    {
        if (Query(req)["warehouseId"] is not { Length: > 0 } wh) return await Http.Write(req, HttpStatusCode.BadRequest, new { error = "WAREHOUSE_REQUIRED" });
        return await Run(req, "HubLocation", async (co, ct) => await hub.LocationAsync(wh, locationId, co, ct), new { error = "LOCATION_NOT_FOUND", locationId });
    }

    // Buscador: ¿es un work, una carga, una ubicación o un artículo? Puede ser varias cosas a la vez.
    [Function("HubResolve")]
    public Task<HttpResponseData> Resolve(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/resolve")] HttpRequestData req)
    {
        var text = Blank(Query(req)["q"]);
        if (text is null) return Http.Ok(req, Array.Empty<object>());
        return Run(req, "HubResolve", (co, ct) => hub.ResolveAsync(text, co, ct));
    }

    // «Tu trabajo ahora»: works que el usuario del token tiene cogidos en la app móvil (Locked by → empleado → correo).
    // Con la clave del agente o AUTH_DISABLED no hay token: vale ?upn= para probar.
    [Function("HubMe")]
    public Task<HttpResponseData> Me(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "hub/me")] HttpRequestData req)
    {
        var email = UserOf(req) ?? Blank(Query(req)["upn"]);
        if (email is null) return Http.Ok(req, Array.Empty<object>());
        return Run(req, "HubMe", (co, ct) => hub.MyWorksAsync(email, co, ct));
    }

    private async Task<HttpResponseData> Run<T>(HttpRequestData req, string name, Func<string?, CancellationToken, Task<T>> load, object? notFound = null)
    {
        if (!Http.TryCompany(req, out var company)) return await Http.BadCompany(req);
        try
        {
            var result = await load(company, req.FunctionContext.CancellationToken);
            return result is null && notFound is not null ? await Http.NotFound(req, notFound) : await Http.Ok(req, result);
        }
        catch (FnoUnavailableException e)
        {
            log.LogError(e, "F&O no disponible en {Function}", name);
            return await Http.Write(req, HttpStatusCode.BadGateway, new { error = "FNO_UNAVAILABLE" });
        }
    }

    private static NameValueCollection Query(HttpRequestData req) => System.Web.HttpUtility.ParseQueryString(req.Url.Query);

    private static string Status(NameValueCollection q) => q["status"] is "open" or "closed" ? q["status"]! : "all";

    private static (int Skip, int Top) Paging(NameValueCollection q) =>
        (int.TryParse(q["skip"], out var s) ? Math.Max(0, s) : 0, int.TryParse(q["top"], out var t) ? Math.Clamp(t, 1, 100) : 25);

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    // Usuario del token de Entra (ya validado por AuthMiddleware): preferred_username, upn o email.
    private static string? UserOf(HttpRequestData req)
    {
        if (!req.Headers.TryGetValues(AuthMiddleware.TokenHeader, out var values) || values.FirstOrDefault() is not { } token) return null;
        var parts = token.Split('.');
        if (parts.Length < 2) return null;
        try
        {
            var payload = parts[1].Replace('-', '+').Replace('_', '/');
            payload += new string('=', (4 - payload.Length % 4) % 4);
            using var doc = JsonDocument.Parse(Encoding.UTF8.GetString(Convert.FromBase64String(payload)));
            foreach (var claim in new[] { "preferred_username", "upn", "email" })
            {
                if (doc.RootElement.TryGetProperty(claim, out var v) && v.GetString() is { Length: > 0 } s) return s;
            }
        }
        catch (Exception e) when (e is FormatException or JsonException)
        {
        }
        return null;
    }
}
