namespace Wh3d.Api.Services;

// Deep links a la SPA (standalone/F&O) y a la pestaña de Teams. App settings: SWA_URL, TEAMS_APP_ID, TEAMS_ENTITY_ID.
public static class DeepLinks
{
    public static string Web(string param, string id) =>
        $"{Setting("SWA_URL", "https://REPLACE-swa.azurestaticapps.net").TrimEnd('/')}/?{param}={Uri.EscapeDataString(id)}&present=1";

    // Ruta de un work en la SWA con su almacén y empresa: sin company la SPA pediría el work en la empresa por defecto
    // (FNO_COMPANY) y un work de otra empresa saldría como "no encontrado".
    public static string WebRoute(string workId, string warehouseId, string? company)
    {
        var url = $"{Setting("SWA_URL", "https://REPLACE-swa.azurestaticapps.net").TrimEnd('/')}/?workId={Uri.EscapeDataString(workId)}" +
                  $"&warehouseId={Uri.EscapeDataString(warehouseId)}";
        if (!string.IsNullOrEmpty(company)) url += $"&company={Uri.EscapeDataString(company)}";
        return url + "&present=1";
    }

    // La app de Teams está publicada si hay TEAMS_APP_ID; si no, el botón de Teams no se pone.
    public static bool TeamsAppConfigured => !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TEAMS_APP_ID"));

    // subEntityId: "work:W-1203" | "load:LD-0042" | "loc:A-05-1" → en la SPA llega como subPageId.
    public static string Teams(string subEntityId)
    {
        var appId = Setting("TEAMS_APP_ID", "REPLACE-TEAMS-APP-ID");
        var entityId = Setting("TEAMS_ENTITY_ID", "mapa3d");
        var context = Uri.EscapeDataString($"{{\"subEntityId\":\"{subEntityId}\"}}");
        return $"https://teams.microsoft.com/l/entity/{appId}/{entityId}?context={context}";
    }

    private static string Setting(string name, string fallback) =>
        Environment.GetEnvironmentVariable(name) is { Length: > 0 } v ? v : fallback;
}
