using System.Globalization;
using System.Text.Json.Nodes;
using Wh3d.Api.Models;
using Wh3d.Api.Services;

namespace Wh3d.Api.AdaptiveCards;

// Adaptive Card 1.5 con la ruta de un work, para el agente de Copilot Studio (GET /api/work/{workId}/card).
// Botones: deep link a la pestaña de Teams y URL standalone. Mismo diseño que la plantilla de copilot-studio/agent.md.
public static class RouteCard
{
    private const int MaxRows = 5;

    // company: empresa de F&O para el enlace web (sin ella, la SPA busca el work en FNO_COMPANY).
    // intro: frase de arriba para los avisos de Power Automate ("Hola Julia, acabas de empezar…").
    public static JsonObject Build(Route route, string? company = null, string? intro = null)
    {
        var rows = route.Lines.Take(MaxRows).Select((l, i) => (Step: i + 1, Line: l)).ToList();
        var more = route.Lines.Count - rows.Count;

        var body = new JsonArray();
        if (intro is not null)
        {
            body.Add(new JsonObject { ["type"] = "TextBlock", ["wrap"] = true, ["text"] = intro });
        }
        body.Add(new JsonObject
        {
            ["type"] = "TextBlock",
            ["size"] = "Large",
            ["weight"] = "Bolder",
            ["wrap"] = true,
            ["text"] = $"Ruta de picking {route.WorkId}",
        });
        body.Add(new JsonObject
        {
            ["type"] = "TextBlock",
            ["isSubtle"] = true,
            ["spacing"] = "None",
            ["wrap"] = true,
            ["text"] = Summary(route),
        });
        body.Add(Table(rows));
        if (route.StartLocation is { } start)
        {
            body.Add(new JsonObject { ["type"] = "TextBlock", ["isSubtle"] = true, ["wrap"] = true, ["text"] = $"Sales de {start.LocationId}." });
        }
        if (more > 0)
        {
            body.Add(new JsonObject { ["type"] = "TextBlock", ["isSubtle"] = true, ["wrap"] = true, ["text"] = $"… y {more} más en el mapa." });
        }
        // Sin markdown: no todos los renderers lo pintan.
        body.Add(new JsonObject
        {
            ["type"] = "TextBlock",
            ["weight"] = "Bolder",
            ["wrap"] = true,
            ["text"] = $"Total: {Fmt(route.TotalDistance)} m hasta {route.PutLocation.LocationId}",
        });
        body.Add(new JsonObject
        {
            ["type"] = "TextBlock",
            ["isSubtle"] = true,
            ["spacing"] = "None",
            ["wrap"] = true,
            ["text"] = "Orden calculado por Dynamics 365.",
        });

        // Con la app de Teams publicada, el 3D se abre en su pestaña; si no, en el navegador (el de Teams en el móvil).
        var web = DeepLinks.WebRoute(route.WorkId, route.WarehouseId, company);
        var actions = DeepLinks.TeamsAppConfigured
            ? new JsonArray
            {
                new JsonObject { ["type"] = "Action.OpenUrl", ["title"] = "Ver ruta en 3D", ["url"] = DeepLinks.Teams($"work:{route.WorkId}") },
                new JsonObject { ["type"] = "Action.OpenUrl", ["title"] = "Abrir en el navegador", ["url"] = web },
            }
            : new JsonArray { new JsonObject { ["type"] = "Action.OpenUrl", ["title"] = "Ver ruta en 3D", ["url"] = web } };

        return new JsonObject
        {
            ["$schema"] = "http://adaptivecards.io/schemas/adaptive-card.json",
            ["type"] = "AdaptiveCard",
            ["version"] = "1.5",
            ["body"] = body,
            ["actions"] = actions,
        };
    }

    private static string Summary(Route r)
    {
        var load = string.IsNullOrEmpty(r.LoadId) ? "" : $"Carga {r.LoadId} · ";
        return $"{load}{r.Lines.Count} ubicaciones · {Fmt(r.TotalDistance)} m · destino {r.PutLocation.LocationId}";
    }

    // Table (1.5) con fallback a FactSet para clientes que no pintan tablas.
    private static JsonObject Table(List<(int Step, RouteLine Line)> rows)
    {
        var tableRows = new JsonArray { Row(true, "#", "Ubicación", "Artículo", "Cant.") };
        foreach (var (step, l) in rows)
        {
            tableRows.Add(Row(false, step.ToString(CultureInfo.InvariantCulture), l.LocationId, l.ItemName, $"{Fmt(l.Qty)} {l.Unit}"));
        }

        var facts = new JsonArray();
        foreach (var (step, l) in rows)
        {
            facts.Add(new JsonObject { ["title"] = $"{step}.", ["value"] = $"{l.LocationId} · {l.ItemName} · {Fmt(l.Qty)} {l.Unit}" });
        }

        return new JsonObject
        {
            ["type"] = "Table",
            ["firstRowAsHeader"] = true,
            ["showGridLines"] = false,
            ["columns"] = new JsonArray
            {
                new JsonObject { ["width"] = 1 },
                new JsonObject { ["width"] = 3 },
                new JsonObject { ["width"] = 6 },
                new JsonObject { ["width"] = 2 },
            },
            ["rows"] = tableRows,
            ["fallback"] = new JsonObject { ["type"] = "FactSet", ["facts"] = facts },
        };
    }

    private static JsonObject Row(bool header, params string[] cells)
    {
        var arr = new JsonArray();
        foreach (var c in cells)
        {
            arr.Add(new JsonObject
            {
                ["type"] = "TableCell",
                ["items"] = new JsonArray
                {
                    new JsonObject { ["type"] = "TextBlock", ["wrap"] = true, ["text"] = c, ["weight"] = header ? "Bolder" : "Default" },
                },
            });
        }
        return new JsonObject { ["type"] = "TableRow", ["cells"] = arr };
    }

    private static string Fmt(double n) => n.ToString("0.###", CultureInfo.InvariantCulture).Replace('.', ',');
}
