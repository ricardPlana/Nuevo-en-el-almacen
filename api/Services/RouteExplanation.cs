using System.Globalization;
using Wh3d.Api.Models;

namespace Wh3d.Api.Services;

// Completa una Route que viene de F&O (o del mock) SIN tocar el orden de las líneas:
//  - distanceToNext / totalDistance: aritmética con la fórmula de F&O.
//  - explanation[]: frases que describen cómo ha construido F&O ese orden.
// Mismo texto que gen_mock.py; si cambias uno, cambia el otro.
public static class RouteExplanation
{
    public static Route Enrich(Route route)
    {
        var put = route.PutLocation;
        if (put is null || route.Lines.Count == 0) return route;

        var lines = route.Lines.Select((l, i) =>
        {
            var (nx, ny, nz) = i + 1 < route.Lines.Count
                ? (route.Lines[i + 1].X, route.Lines[i + 1].Y, route.Lines[i + 1].Z)
                : (put.X, put.Y, put.Z);
            return l with { DistanceToNext = Math.Round(Distance.For(route.Strategy, l.X, l.Y, l.Z, nx, ny, nz), 2) };
        }).ToList();
        var total = Math.Round(lines.Sum(l => l.DistanceToNext), 2);

        return route with { Lines = lines, TotalDistance = total, Explanation = Explain(route with { Lines = lines }, total) };
    }

    private static List<string> Explain(Route route, double total)
    {
        var put = route.PutLocation;
        var lines = route.Lines;
        // Tramo posterior del work: F&O solo ordena los picks anteriores al primer put, así que aquí no hay orden que explicar.
        if (route.PreviousPut is { } previous)
        {
            return
            [
                $"La parte anterior del work ya está hecha: la mercancía se dejó en {previous}.",
                $"Queda este tramo: se coge en {string.Join(", ", lines.Select(l => l.LocationId).Distinct())} y se deja en {put.LocationId}. F&O no reordena estas líneas.",
                $"Recorrido total: {Fmt(total)} m.",
            ];
        }
        var fast = route.Algorithm == "Fast";
        var (order, trace) = FastSort(route);
        var sameAsFno = fast && order.SequenceEqual(lines.Select(l => l.LocationId));

        var expl = new List<string>();
        if (lines.Count < 2)
        {
            // F&O no ordena works con menos de 2 picks: no hay nada que explicar del orden.
            expl.Add($"Este work tiene un solo pick: se coge en {lines[0].LocationId} y se deja en {put.LocationId}. No hay orden que calcular.");
            if (Approach(route, total) is { } one) expl.Add(one);
            expl.Add($"Recorrido total: {Fmt(total)} m.");
            return expl;
        }
        // El algoritmo y el tipo de distancia ya van en la cabecera del panel: aquí solo cómo se construye el orden.
        if (fast)
        {
            var s = $"F&O construye la ruta de las {lines.Count} líneas desde el muelle {put.LocationId} hacia atrás, " +
                    "eligiendo cada vez la ubicación más cercana, y después la invierte.";
            if (sameAsFno) s += $" Por eso el último pick ({lines[^1].LocationId}) es el más cercano al muelle.";
            expl.Add(s);
        }
        else
        {
            expl.Add($"F&O parte del cálculo rápido desde el muelle {put.LocationId} (la más cercana cada vez, y se invierte) " +
                     "y después mejora el orden cambiando tramos si así se anda menos.");
        }
        expl.Add(Heights(lines));

        // La traza solo si coincide con lo que ha devuelto F&O: nunca explicamos un orden que no es el suyo.
        if (sameAsFno) expl.Add("Construcción desde el muelle: " + string.Join("; ", trace) + ".");
        if (Approach(route, total) is { } approach) expl.Add(approach);
        expl.Add($"Recorrido total: {Fmt(total)} m hasta dejarlo todo en {put.LocationId}.");
        return expl;
    }

    // Cómo cuenta la altura, con un ejemplo real del work. La Z de F&O puede ser el número de nivel (almacenes 22 y 24)
    // o metros (CH01: 0,6, 2,2…): si alguna Z tiene decimales, son metros.
    private static string Heights(IReadOnlyList<RouteLine> lines)
    {
        var top = lines.MaxBy(l => Math.Abs(l.Z))!;
        if (Math.Abs(top.Z) < 1e-9) return "Todas las ubicaciones del work están a ras de suelo: la altura no cambia nada en este orden.";
        var metres = lines.Any(l => Math.Abs(l.Z - Math.Round(l.Z)) > 1e-9);
        return metres
            ? $"La altura cuenta al subir y al bajar: se suma la altura de origen y la de destino. {top.LocationId} está a {Fmt(top.Z)} m, así que añade {Fmt(top.Z)} m a cada tramo que llega o sale de ella."
            : $"La altura cuenta al subir y al bajar: se suma el nivel de origen y el de destino. {top.LocationId} está en el nivel {Fmt(top.Z)}, así que añade {Fmt(top.Z)} a cada tramo que llega o sale de ella.";
    }

    // Tramo desde la ubicación de inicio del almacén hasta el primer pick: se dibuja, pero F&O no lo usa al ordenar
    // y no entra en el total.
    private static string? Approach(Route route, double total)
    {
        if (route.StartLocation is not { } s || route.Lines.Count == 0) return null;
        var first = route.Lines[0];
        var d = Distance.For(route.Strategy, s.X, s.Y, s.Z, first.X, first.Y, first.Z);
        return $"El picker sale de {s.LocationId} y anda {Fmt(Math.Round(d, 2))} m hasta el primer pick ({first.LocationId}). " +
               $"F&O no tiene en cuenta este tramo al ordenar (parte del muelle), así que no entra en el total de {Fmt(total)} m.";
    }

    // Fast calculation de F&O: desde el put, siempre la más cercana sin visitar; luego se invierte.
    private static (List<string> Order, List<string> Trace) FastSort(Route route)
    {
        var byId = route.Lines.GroupBy(l => l.LocationId).ToDictionary(g => g.Key, g => g.First());
        var left = byId.Keys.ToList();
        var built = new List<string>();
        var trace = new List<string>();
        var (cx, cy, cz, cid) = (route.PutLocation.X, route.PutLocation.Y, route.PutLocation.Z, route.PutLocation.LocationId);

        while (left.Count > 0)
        {
            double D(string id, bool levels = true)
            {
                var l = byId[id];
                return levels
                    ? Distance.For(route.Strategy, cx, cy, cz, l.X, l.Y, l.Z)
                    : Distance.For(route.Strategy, cx, cy, 0, l.X, l.Y, 0);
            }
            var ranked = left.OrderBy(id => D(id)).ThenBy(id => id, StringComparer.Ordinal).ToList();
            var chosen = ranked[0];
            var step = $"desde {cid} lo más cercano era {chosen} ({Fmt(D(chosen))} m)";
            if (ranked.Count > 1)
            {
                var second = ranked[1];
                step += $"; {second} quedaba a {Fmt(D(second))} m";
                if (D(chosen, levels: false) > D(second, levels: false)) step += $" (sin contar la altura habría ganado {second})";
            }
            trace.Add(step);
            built.Add(chosen);
            left.Remove(chosen);
            var c = byId[chosen];
            (cx, cy, cz, cid) = (c.X, c.Y, c.Z, c.LocationId);
        }
        built.Reverse();
        return (built, trace);
    }

    private static string Fmt(double n) => n.ToString("0.###", CultureInfo.InvariantCulture).Replace('.', ',');
}
