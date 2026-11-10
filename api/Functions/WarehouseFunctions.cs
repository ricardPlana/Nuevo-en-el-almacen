using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Wh3d.Api.AdaptiveCards;
using Wh3d.Api.Data;
using Wh3d.Api.Fno;
using Wh3d.Api.Services;

namespace Wh3d.Api.Functions;

// Endpoints de solo lectura (api/openapi.yaml). El orden de las rutas es el de la fuente (F&O); aquí no se reordena nada:
// RouteExplanation.Enrich solo recalcula distancias y explanation[] sobre ese orden.
// Todas aceptan ?company=<dataAreaId> (la extensión X++ pasa curExt()); sin él, la empresa de FNO_COMPANY.
public sealed class WarehouseFunctions(IWarehouseData data, ILogger<WarehouseFunctions> log)
{
    [Function("GetLayout")]
    public async Task<HttpResponseData> GetLayout(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "warehouses/{warehouseId}/layout")] HttpRequestData req,
        string warehouseId)
    {
        if (!Http.TryCompany(req, out var company)) return await Http.BadCompany(req);
        // ?refresh=1: el botón ↻ de la SPA; se vuelve a leer de F&O en vez de usar la caché (5 min).
        if (System.Web.HttpUtility.ParseQueryString(req.Url.Query)["refresh"] == "1") data.Forget(warehouseId, company);
        try
        {
            var layout = await data.GetLayoutAsync(warehouseId, company, req.FunctionContext.CancellationToken);
            return layout is null
                ? await Http.NotFound(req, new { error = "WAREHOUSE_NOT_FOUND", warehouseId })
                : await Http.Ok(req, layout);
        }
        catch (FnoUnavailableException e)
        {
            log.LogError(e, "F&O no disponible en GetLayout {Warehouse}", warehouseId);
            return await Http.Write(req, HttpStatusCode.BadGateway, new { error = "FNO_UNAVAILABLE" });
        }
    }

    [Function("GetLocation")]
    public async Task<HttpResponseData> GetLocation(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "warehouses/{warehouseId}/locations/{locationId}")] HttpRequestData req,
        string warehouseId,
        string locationId)
    {
        if (!Http.TryCompany(req, out var company)) return await Http.BadCompany(req);
        try
        {
            var layout = await data.GetLayoutAsync(warehouseId, company, req.FunctionContext.CancellationToken);
            if (layout is null) return await Http.NotFound(req, new { error = "WAREHOUSE_NOT_FOUND", warehouseId });
            var detail = LocationDetails.Build(layout, locationId);
            return detail is null
                ? await Http.NotFound(req, new { error = "LOCATION_NOT_FOUND", locationId })
                : await Http.Ok(req, detail);
        }
        catch (FnoUnavailableException e)
        {
            log.LogError(e, "F&O no disponible en GetLocation {Warehouse}/{Location}", warehouseId, locationId);
            return await Http.Write(req, HttpStatusCode.BadGateway, new { error = "FNO_UNAVAILABLE" });
        }
    }

    // Histórico: works de venta del almacén (open | closed | all), más recientes primero.
    [Function("ListWorks")]
    public async Task<HttpResponseData> ListWorks(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "warehouses/{warehouseId}/works")] HttpRequestData req,
        string warehouseId)
    {
        if (!Http.TryCompany(req, out var company)) return await Http.BadCompany(req);
        var q = System.Web.HttpUtility.ParseQueryString(req.Url.Query);
        var status = q["status"] is "open" or "closed" ? q["status"]! : "all";
        var top = int.TryParse(q["top"], out var t) ? Math.Clamp(t, 1, 200) : 50;
        try
        {
            return await Http.Ok(req, await data.ListWorksAsync(warehouseId, company, status, top, req.FunctionContext.CancellationToken));
        }
        catch (FnoUnavailableException e)
        {
            log.LogError(e, "F&O no disponible en ListWorks {Warehouse}", warehouseId);
            return await Http.Write(req, HttpStatusCode.BadGateway, new { error = "FNO_UNAVAILABLE" });
        }
    }

    // Vista de almacén: stock por ubicación y picks abiertos (sin rutas).
    [Function("GetStock")]
    public async Task<HttpResponseData> GetStock(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "warehouses/{warehouseId}/stock")] HttpRequestData req,
        string warehouseId)
    {
        if (!Http.TryCompany(req, out var company)) return await Http.BadCompany(req);
        try
        {
            var stock = await data.GetStockAsync(warehouseId, company, req.FunctionContext.CancellationToken);
            return stock is null
                ? await Http.NotFound(req, new { error = "WAREHOUSE_NOT_FOUND", warehouseId })
                : await Http.Ok(req, stock);
        }
        catch (FnoUnavailableException e)
        {
            log.LogError(e, "F&O no disponible en GetStock {Warehouse}", warehouseId);
            return await Http.Write(req, HttpStatusCode.BadGateway, new { error = "FNO_UNAVAILABLE" });
        }
    }

    [Function("GetRoute")]
    public async Task<HttpResponseData> GetRoute(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "work/{workId}/route")] HttpRequestData req,
        string workId)
    {
        if (!Http.TryCompany(req, out var company)) return await Http.BadCompany(req);
        log.LogInformation("GetRoute {WorkId}", workId);
        try
        {
            var route = await data.GetRouteAsync(workId, company, req.FunctionContext.CancellationToken);
            return route is null
                ? await Http.NotFound(req, new { error = "WORK_NOT_FOUND", workId })
                : await Http.Ok(req, RouteExplanation.Enrich(route));
        }
        catch (FnoUnavailableException e)
        {
            log.LogError(e, "F&O no disponible en GetRoute {WorkId}", workId);
            return await Http.Write(req, HttpStatusCode.BadGateway, new { error = "FNO_UNAVAILABLE" });
        }
    }

    [Function("GetRouteCard")]
    public async Task<HttpResponseData> GetRouteCard(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "work/{workId}/card")] HttpRequestData req,
        string workId)
    {
        if (!Http.TryCompany(req, out var company)) return await Http.BadCompany(req);
        log.LogInformation("GetRouteCard {WorkId}", workId);
        try
        {
            var route = await data.GetRouteAsync(workId, company, req.FunctionContext.CancellationToken);
            return route is null
                ? await Http.NotFound(req, new { error = "WORK_NOT_FOUND", workId })
                : await Http.Ok(req, RouteCard.Build(RouteExplanation.Enrich(route), company));
        }
        catch (FnoUnavailableException e)
        {
            log.LogError(e, "F&O no disponible en GetRouteCard {WorkId}", workId);
            return await Http.Write(req, HttpStatusCode.BadGateway, new { error = "FNO_UNAVAILABLE" });
        }
    }

    // Aviso "tu ruta" (Power Automate cada pocos minutos): works que alguien ha cogido en la app móvil de almacén
    // en los últimos ?minutes= (por defecto 5; 0 = todos los que están cogidos ahora), con su correo y la tarjeta.
    // "Cogido" = Locked by relleno. La ventana se mide con la hora de inicio del work en F&O: sin ella no se avisa (si no,
    // el flujo lo mandaría en cada pasada). Con minutes=0 salen todos los cogidos, tengan hora o no (para probar).
    [Function("ListStartedWorks")]
    public async Task<HttpResponseData> ListStartedWorks(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "works/started")] HttpRequestData req)
    {
        if (!Http.TryCompany(req, out var company)) return await Http.BadCompany(req);
        var q = System.Web.HttpUtility.ParseQueryString(req.Url.Query);
        var minutes = int.TryParse(q["minutes"], out var m) ? Math.Clamp(m, 0, 1440) : 5;
        var warehouseId = q["warehouseId"] is { Length: > 0 } w ? w : null;
        var since = DateTimeOffset.UtcNow.AddMinutes(-minutes);
        try
        {
            var locked = await data.LockedWorksAsync(warehouseId, company, req.FunctionContext.CancellationToken);
            var started = locked
                .Where(x => minutes == 0 || x.Route.StartedAt >= since)
                .Select(x =>
                {
                    var route = RouteExplanation.Enrich(x.Route);
                    var hello = x.WorkerName is { Length: > 0 } n ? $"Hola {n.Split(' ')[0]}, " : "Hola, ";
                    var intro = $"{hello}acabas de empezar el trabajo {route.WorkId} en {route.WarehouseId}. Así es tu recorrido:";
                    var card = RouteCard.Build(route, company, intro);
                    return new Models.StartedWork(route.WorkId, route.WarehouseId, route.LoadId, route.WorkStatus, route.StartedAt,
                        x.UserId, x.PersonnelNumber, x.WorkerName, x.Email, route.Lines.Count, route.TotalDistance, card.ToJsonString());
                })
                .ToList();
            log.LogInformation("ListStartedWorks {Company}/{Warehouse}: {Locked} cogidos, {Started} en los últimos {Minutes} min",
                company, warehouseId, locked.Count, started.Count, minutes);
            return await Http.Ok(req, started);
        }
        catch (FnoUnavailableException e)
        {
            log.LogError(e, "F&O no disponible en ListStartedWorks");
            return await Http.Write(req, HttpStatusCode.BadGateway, new { error = "FNO_UNAVAILABLE" });
        }
    }

    [Function("GetLoadRoute")]
    public async Task<HttpResponseData> GetLoadRoute(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "loads/{loadId}/route")] HttpRequestData req,
        string loadId)
    {
        if (!Http.TryCompany(req, out var company)) return await Http.BadCompany(req);
        log.LogInformation("GetLoadRoute {LoadId}", loadId);
        try
        {
            var routes = await data.GetLoadRoutesAsync(loadId, company, req.FunctionContext.CancellationToken);
            return routes is null || routes.Count == 0
                ? await Http.NotFound(req, new { error = "LOAD_NOT_FOUND", loadId })
                : await Http.Ok(req, routes.Select(RouteExplanation.Enrich).ToList());
        }
        catch (FnoUnavailableException e)
        {
            log.LogError(e, "F&O no disponible en GetLoadRoute {LoadId}", loadId);
            return await Http.Write(req, HttpStatusCode.BadGateway, new { error = "FNO_UNAVAILABLE" });
        }
    }
}

internal static partial class Http
{
    // ?company= es un dataAreaId de F&O: hasta 4 letras o números. Ausente → null (empresa por defecto).
    public static bool TryCompany(HttpRequestData req, out string? company)
    {
        company = System.Web.HttpUtility.ParseQueryString(req.Url.Query)["company"];
        if (string.IsNullOrEmpty(company)) { company = null; return true; }
        return CompanyId().IsMatch(company);
    }

    public static Task<HttpResponseData> BadCompany(HttpRequestData req) =>
        Write(req, HttpStatusCode.BadRequest, new { error = "INVALID_COMPANY" });

    [System.Text.RegularExpressions.GeneratedRegex(@"^[A-Za-z0-9]{1,4}$")]
    private static partial System.Text.RegularExpressions.Regex CompanyId();

    public static Task<HttpResponseData> Ok<T>(HttpRequestData req, T body) => Write(req, HttpStatusCode.OK, body);

    public static Task<HttpResponseData> NotFound<T>(HttpRequestData req, T body) => Write(req, HttpStatusCode.NotFound, body);

    public static async Task<HttpResponseData> Write<T>(HttpRequestData req, HttpStatusCode status, T body)
    {
        var res = req.CreateResponse();
        await res.WriteAsJsonAsync(body);
        res.StatusCode = status; // WriteAsJsonAsync pone 200; se envía al salir de la función
        return res;
    }
}
