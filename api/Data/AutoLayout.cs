using System.Text.RegularExpressions;
using Wh3d.Api.Models;

namespace Wh3d.Api.Data;

// Datos de F&O que necesita el plano, ya leídos (FnoWarehouseData hace las consultas).
public sealed record SiteLocation(string Id, string? WhsZone, string? Profile, string? Type, string? AisleId,
    int Rack, int Shelf, int Bin, double X, double Y, double Z, ProfileSize? Size = null)
{
    public bool HasCoordinates => X != 0 || Y != 0;
}

// Medidas reales del perfil de ubicación (Actual location height / width / depth), en metros. 0 = sin dato.
// Ancho: a lo largo del pasillo; fondo: hacia dentro de la estantería.
public sealed record ProfileSize(double Height, double Width, double Depth);

public sealed record SiteZone(int Number, string Name, string? Function, double Length, double Width);

public sealed record SiteAisle(string AisleId, int Number);

// Tipos de ubicación de los parámetros de WHS: expedición final, staging y packing; y el perfil de las ubicaciones de usuario.
public sealed record LocationTypes(string? Shipping, string? Staging, string? Packing, string? UserProfile);

public static partial class ZoneFunctions
{
    public const string Receiving = "Receiving";
    public const string PutAway = "PutAway";
    public const string Storage = "Storage";
    public const string Consolidation = "Consolidation";
    public const string Shipping = "Shipping";

    // A qué función pertenece una ubicación. null = no se pinta (ubicaciones de usuario de WHS).
    // Primero los parámetros de WHS (tipo de ubicación del perfil); recepción no tiene parámetro y,
    // si el almacén no usa perfiles, se mira el nombre (In_01 / Out_01, RECV, BAYDOOR…).
    public static string? Of(SiteLocation l, LocationTypes t)
    {
        if (Same(l.Profile, t.UserProfile)) return null;
        if (Same(l.Type, t.Shipping)) return Shipping;
        if (Same(l.Type, t.Staging) || Same(l.Type, t.Packing)) return Consolidation;
        var text = $"{l.Type} {l.Profile} {l.Id}";
        if (ReceivingName().IsMatch(text)) return Receiving;
        if (ShippingName().IsMatch(text)) return Shipping;
        if (ConsolidationName().IsMatch(text)) return Consolidation;
        return Storage;
    }

    // Lo que guarda la zona en F&O (enum ZoneFunction) o, si no viene, lo que dice su nombre.
    public static string? Parse(string? value) => Normalize(value) switch
    {
        "receiving" or "recepcion" => Receiving,
        "putaway" or "ubicacion" => PutAway,
        "storage" or "almacenaje" or "stock" => Storage,
        "consolidation" or "consolidacion" or "preparacion" => Consolidation,
        "shipping" or "expedicion" => Shipping,
        _ => null,
    };

    public static string? FromName(string name)
    {
        var n = Normalize(name);
        if (n.Contains("recep") || n.Contains("receiv")) return Receiving;
        if (n.Contains("put") || n.Contains("ubicac")) return PutAway;
        if (n.Contains("exped") || n.Contains("muelle") || n.Contains("ship")) return Shipping;
        if (n.Contains("consol") || n.Contains("prepar") || n.Contains("pack")) return Consolidation;
        if (n.Contains("stock") || n.Contains("almac") || n.Contains("picking") || n.Contains("storage")) return Storage;
        return null;
    }

    private static bool Same(string? a, string? b) => !string.IsNullOrEmpty(a) && string.Equals(a, b, StringComparison.OrdinalIgnoreCase);

    private static string Normalize(string? s) => (s ?? "").ToLowerInvariant()
        .Replace("á", "a").Replace("é", "e").Replace("í", "i").Replace("ó", "o").Replace("ú", "u").Replace("-", "").Replace(" ", "");

    [GeneratedRegex(@"RECV|RECEI|RECEP|^IN[_-]|\sIN[_-]", RegexOptions.IgnoreCase)]
    private static partial Regex ReceivingName();

    [GeneratedRegex(@"DOOR|DOCK|SHIP|EXPED|MUELLE|^OUT[_-]|\sOUT[_-]", RegexOptions.IgnoreCase)]
    private static partial Regex ShippingName();

    [GeneratedRegex(@"STAG|PACK|CONSOL", RegexOptions.IgnoreCase)]
    private static partial Regex ConsolidationName();
}

// Plano a partir de la nave y sus zonas (campos D365_* y tabla de zonas en F&O):
//  - Las zonas son bandas a lo largo de X, en el orden de Number, cada una con su largo.
//  - Muelles de recepción y expedición, contra la pared de su zona; staging/packing en la de consolidación.
//  - Almacenaje: un pasillo de F&O = un pasillo de doble cara. Rack impar a la izquierda y par a la derecha,
//    enfrentados por parejas (posición = ceil(rack / 2)); estante = nivel; hueco = posición dentro del rack.
//    Sin estructura (rack 0), se agrupa por zona de WHS y se reparte en orden por las dos caras.
//  - Si una ubicación tiene coordenadas XYZ (feature Warehouse spatial location), mandan las coordenadas. En las de
//    almacenaje, la X es la cara de picking y las caras enfrentadas a ≤ 2,6 m son una estantería de doble fondo.
//  - Medidas de cada hueco: las del perfil de ubicación (alto, ancho, fondo reales). Cada ubicación empieza donde
//    acaban las de debajo en su columna (BaseZ), así un mismo rack puede tener niveles de cajas y de palés.
public static class AutoLayout
{
    private const double RackDepth = 1.1;        // fondo de cada estantería
    private const double BackToBack = 0.3;       // hueco entre estanterías de pasillos vecinos
    private const double MaxPitch = 5.4;         // estantería + pasillo + estantería
    private const double MinCorridor = 1.2;
    private const double CrossAisle = 2.5;       // pasillo transversal delante y detrás de las estanterías
    private const double MaxSlot = 1.2;          // ancho de un hueco a lo largo del pasillo
    private const double WallGap = 0.6;
    private const double PairGap = 2.6;          // dos caras con XYZ a esta distancia o menos = una estantería de doble fondo
    private const double HalfAisle = 1.6;        // medio pasillo, cuando no hay estantería enfrente
    private const double DefaultWidth = 30;

    public static Layout Build(string warehouseId, string name, string distanceStrategy, string sortAlgorithm,
        Building? building, IReadOnlyList<SiteZone> siteZones, IReadOnlyList<SiteLocation> siteLocations,
        IReadOnlyList<SiteAisle> siteAisles, LocationTypes types)
    {
        var ordered = siteZones.OrderBy(z => z.Number).ToList();
        var length = building is { Length: > 0 } ? building.Length : ordered.Sum(z => z.Length);
        var width = building is { Width: > 0 } ? building.Width : ordered.Select(z => z.Width).DefaultIfEmpty(DefaultWidth).Max();
        if (width <= 0) width = DefaultWidth;

        var zones = BuildZones(ordered, length, width);
        if (length <= 0) length = zones.Sum(z => z.Length);

        var locations = new List<Location>();
        var puts = new List<string>();
        var aisles = new List<LayoutAisle>();

        var classified = siteLocations
            .Select(l => (Loc: l, Function: ZoneFunctions.Of(l, types)))
            .Where(t => t.Function is not null)
            .ToList();

        foreach (var (l, f) in classified.Where(t => t.Loc.HasCoordinates && t.Function != ZoneFunctions.Storage))
        {
            puts.Add(l.Id);
            locations.Add(new Location(l.Id, KindOf(f!, l.Z), "-", 0, 0, l.X, l.Y, l.Z, l.Profile ?? "", 3.0, 1.2, 0.2));
        }
        PlaceRacksAtCoordinates(classified.Where(t => t.Loc.HasCoordinates && t.Function == ZoneFunctions.Storage).Select(t => t.Loc).ToList(),
            locations, aisles);

        var pending = classified.Where(t => !t.Loc.HasCoordinates).ToLookup(t => t.Function!, t => t.Loc);
        var storageZone = ZoneFor(zones, ZoneFunctions.Storage) ?? zones.OrderByDescending(z => z.Length * z.Width).FirstOrDefault();

        PlaceDocks(pending[ZoneFunctions.Receiving], ZoneFor(zones, ZoneFunctions.Receiving), atStart: true, length, width, locations, puts);
        PlaceDocks(pending[ZoneFunctions.Shipping], ZoneFor(zones, ZoneFunctions.Shipping), atStart: false, length, width, locations, puts);
        PlaceAreas(pending[ZoneFunctions.Consolidation], ZoneFor(zones, ZoneFunctions.Consolidation) ?? ZoneFor(zones, ZoneFunctions.Shipping) ?? storageZone,
            length, width, locations, puts);
        if (storageZone is not null)
            PlaceStorage(pending[ZoneFunctions.Storage].ToList(), storageZone, width, siteAisles, locations, aisles);

        // Altura de nivel (para las ubicaciones cuyo perfil no tiene altura): la de las estanterías de la nave
        // repartida entre los niveles que hay.
        var levels = locations.Where(l => l.Zone is "PICK" or "BULK").Select(l => l.Level).DefaultIfEmpty(0).Max() + 1;
        double? levelHeight = building is { RackHeight: > 0 } ? Round(Math.Clamp(building.RackHeight / levels, 1.0, 3.0)) : null;
        if (levelHeight is { } lh)
            locations = [.. locations.Select(l => l.Zone is "PICK" or "BULK" && l.BaseZ is null ? l with { SizeZ = Round(lh * 0.7) } : l)];

        var bounds = new Bounds(0, Math.Max(length, 1), 0, width, locations.Count == 0 ? 0 : locations.Max(l => l.Level));
        return new Layout(warehouseId, name, bounds, locations, puts, distanceStrategy, sortAlgorithm,
            building ?? new Building(length, width, 0, 0), zones, aisles, levelHeight);
    }

    private static List<LayoutZone> BuildZones(List<SiteZone> ordered, double length, double width)
    {
        if (ordered.Count == 0)
            return length > 0 ? [new LayoutZone(1, "Almacén", ZoneFunctions.Storage, 0, length, width)] : [];

        var largest = ordered.MaxBy(z => z.Length * Math.Max(z.Width, 1))!;
        var storageIndex = ordered.IndexOf(largest);
        var zones = new List<LayoutZone>();
        double x = 0;
        for (var i = 0; i < ordered.Count; i++)
        {
            var z = ordered[i];
            var function = ZoneFunctions.Parse(z.Function) ?? ZoneFunctions.FromName(z.Name) ?? ByPosition(i, ordered.Count, storageIndex);
            var len = z.Length > 0 ? z.Length : 0;
            zones.Add(new LayoutZone(z.Number, string.IsNullOrWhiteSpace(z.Name) ? $"Zona {z.Number}" : z.Name, function, x, len, z.Width > 0 ? z.Width : width));
            x += len;
        }
        return zones;
    }

    // Orden habitual de una nave: recepción → put-away → almacenaje → consolidación → expedición.
    private static string ByPosition(int index, int count, int storageIndex)
    {
        if (index == storageIndex) return ZoneFunctions.Storage;
        if (index == 0) return ZoneFunctions.Receiving;
        if (index == count - 1) return ZoneFunctions.Shipping;
        return index < storageIndex ? ZoneFunctions.PutAway : ZoneFunctions.Consolidation;
    }

    private static LayoutZone? ZoneFor(List<LayoutZone> zones, string function) => zones.FirstOrDefault(z => z.Function == function);

    private static string KindOf(string function, double level) => function switch
    {
        ZoneFunctions.Receiving or ZoneFunctions.Shipping => "DOCK",
        ZoneFunctions.Consolidation => "STAGE",
        _ => level > 0 ? "BULK" : "PICK",
    };

    // Muelles contra la pared exterior de su zona: la de la izquierda (X = 0) o la del fondo (X = largo) si la zona
    // toca ese extremo; si no, en la pared delantera (Y = 0). Sin zona: recepción a la izquierda, expedición al fondo.
    private static void PlaceDocks(IEnumerable<SiteLocation> source, LayoutZone? zone, bool atStart, double length, double width,
        List<Location> locations, List<string> puts)
    {
        var docks = source.OrderBy(l => l.Id, StringComparer.OrdinalIgnoreCase).ToList();
        if (docks.Count == 0) return;
        var n = docks.Count;
        var onLeft = zone is null ? atStart : zone.X <= 0.01;
        var onRight = zone is null ? !atStart : zone.X + zone.Length >= length - 0.01;
        for (var i = 0; i < n; i++)
        {
            var l = docks[i];
            double x, y, sx, sy;
            if (onLeft || onRight)
            {
                var step = width / n;
                (sx, sy) = (1.0, Math.Min(3.0, step * 0.8));
                x = onLeft ? WallGap : length - WallGap;
                y = step * (i + 0.5);
            }
            else
            {
                var step = zone!.Length / n;
                (sx, sy) = (Math.Min(3.0, step * 0.8), 1.0);
                x = zone.X + step * (i + 0.5);
                y = WallGap;
            }
            puts.Add(l.Id);
            locations.Add(new Location(l.Id, "DOCK", "-", 0, 0, Round(x), Round(y), 0, l.Profile ?? "", Round(sx), Round(sy), 0.2));
        }
    }

    // Staging y packing: zonas pintadas en el suelo, en cuadrícula dentro de la zona.
    private static void PlaceAreas(IEnumerable<SiteLocation> source, LayoutZone? zone, double length, double width,
        List<Location> locations, List<string> puts)
    {
        var areas = source.OrderBy(l => l.Id, StringComparer.OrdinalIgnoreCase).ToList();
        if (areas.Count == 0) return;
        var x0 = zone?.X ?? 0;
        var len = zone?.Length is > 0 ? zone.Length : Math.Max(length, 4);
        var cols = Math.Max(1, Math.Min(areas.Count, (int)Math.Floor(len / 3.5)));
        var rows = (int)Math.Ceiling(areas.Count / (double)cols);
        var cellX = len / cols;
        var cellY = Math.Min(5, (width - 2 * CrossAisle) / rows);
        var top = width / 2 + cellY * rows / 2;
        for (var i = 0; i < areas.Count; i++)
        {
            var l = areas[i];
            var (c, r) = (i % cols, i / cols);
            puts.Add(l.Id);
            locations.Add(new Location(l.Id, "STAGE", "-", 0, 0, Round(x0 + cellX * (c + 0.5)), Round(top - cellY * (r + 0.5)), 0, l.Profile ?? "",
                Round(Math.Min(3, cellX * 0.8)), Round(Math.Min(3, cellY * 0.8)), 0.2));
        }
    }

    private sealed record Slot(SiteLocation Loc, bool Left, int Bay, int Level, int Bin);

    // Pasillos de doble cara en la zona de almacenaje, perpendiculares al largo de la nave.
    private static void PlaceStorage(List<SiteLocation> storage, LayoutZone zone, double width, IReadOnlyList<SiteAisle> siteAisles,
        List<Location> locations, List<LayoutAisle> aisles)
    {
        if (storage.Count == 0) return;
        var numbers = siteAisles.ToDictionary(a => a.AisleId, a => a.Number, StringComparer.OrdinalIgnoreCase);
        var groups = storage
            .GroupBy(l => Structured(l) ? l.AisleId! : string.IsNullOrWhiteSpace(l.WhsZone) ? "—" : l.WhsZone!, StringComparer.OrdinalIgnoreCase)
            .OrderBy(g => numbers.TryGetValue(g.Key, out var n) ? n : int.MaxValue)
            .ThenBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
            .ToList();

        const double margin = 0.5;
        var pitch = Math.Min(MaxPitch, (zone.Length - 2 * margin) / groups.Count);
        var profileDepth = MaxOf(storage, s => s.Depth);
        var rackDepth = profileDepth > 0 ? profileDepth : RackDepth;
        var corridor = Math.Max(MinCorridor, pitch - 2 * rackDepth - BackToBack);
        var depth = Math.Min(rackDepth, Math.Max(0.4, (pitch - corridor - BackToBack) / 2));
        var usable = width - 2 * CrossAisle;

        for (var a = 0; a < groups.Count; a++)
        {
            var group = groups[a].ToList();
            var slots = SlotsOf(group);
            var bays = slots.Max(s => s.Bay);
            var bins = slots.Max(s => s.Bin);
            // Ancho de cada hueco a lo largo del pasillo: el del perfil, si cabe en la nave; si no, 1,2 m como mucho.
            var profileWidth = MaxOf(group, s => s.Width);
            var slot = Math.Min(profileWidth > 0 ? profileWidth : MaxSlot, usable / (bays * bins));
            var y0 = Math.Max(CrossAisle, (width - bays * bins * slot) / 2); // estanterías centradas en el ancho de la nave
            var xc = zone.X + margin + pitch * (a + 0.5);
            var bases = Elevations(slots.Select(s => (s.Loc, $"{s.Left}|{s.Bay}|{s.Bin}", s.Level)));
            foreach (var s in slots)
            {
                var x = xc + (s.Left ? -1 : 1) * (corridor / 2 + depth / 2);
                var y = y0 + ((s.Bay - 1) * bins + (s.Bin - 1)) * slot + slot / 2;
                var baseZ = bases.TryGetValue(s.Loc.Id, out var b) ? b : (double?)null;
                locations.Add(new Location(s.Loc.Id, s.Level > 0 ? "BULK" : "PICK", groups[a].Key, s.Loc.Rack > 0 ? s.Loc.Rack : s.Bay, s.Level,
                    Round(x), Round(y), s.Level, s.Loc.Profile ?? "", Round(depth), Round(slot * 0.95), baseZ is null ? 1.0 : s.Loc.Size!.Height, baseZ));
            }
            aisles.Add(new LayoutAisle(groups[a].Key, groups[a].Key, Round(xc), Round(y0), Round(y0 + bays * bins * slot)));
        }
    }

    private sealed record Row(double X, List<SiteLocation> Locs)
    {
        public double MinY => Locs.Min(l => l.Y);
        public double MaxY => Locs.Max(l => l.Y);
    }

    // Estanterías con coordenadas XYZ. La X es la cara de picking (el borde del pasillo por donde se coge), así que la
    // estantería queda detrás de ella. Dos filas a ≤ PairGap y solapadas en Y son una estantería de doble fondo: la de la
    // izquierda se coge desde el pasillo de su izquierda y la de la derecha desde el de su derecha. Una fila suelta abre
    // hacia el lado con más sitio. Nivel = orden de la Z dentro de la fila (la Z puede venir en metros).
    private static void PlaceRacksAtCoordinates(List<SiteLocation> storage, List<Location> locations, List<LayoutAisle> aisles)
    {
        if (storage.Count == 0) return;
        var rows = storage.GroupBy(l => Round(l.X)).OrderBy(g => g.Key).Select(g => new Row(g.Key, g.ToList())).ToList();
        var n = rows.Count;
        var facing = new int[n]; // -1: se coge desde la izquierda; +1: desde la derecha
        var depth = new double[n];
        // Fondo: el del perfil (Actual location depth); en una pareja, nunca más de media separación entre caras.
        double ProfileDepth(Row r, double otherwise) => MaxOf(r.Locs, s => s.Depth) is > 0 and var d ? d : otherwise;
        for (var i = 0; i < n; i++)
        {
            if (i + 1 < n && rows[i + 1].X - rows[i].X <= PairGap && rows[i].MinY <= rows[i + 1].MaxY && rows[i + 1].MinY <= rows[i].MaxY)
            {
                (facing[i], facing[i + 1]) = (-1, 1);
                var half = (rows[i + 1].X - rows[i].X) / 2;
                depth[i] = Math.Min(ProfileDepth(rows[i], Math.Clamp(half, 0.6, RackDepth + 0.2)), half);
                depth[i + 1] = Math.Min(ProfileDepth(rows[i + 1], Math.Clamp(half, 0.6, RackDepth + 0.2)), half);
                i++;
                continue;
            }
            var left = i > 0 ? rows[i].X - rows[i - 1].X : double.MaxValue;
            var right = i + 1 < n ? rows[i + 1].X - rows[i].X : double.MaxValue;
            facing[i] = left >= right ? -1 : 1;
            depth[i] = ProfileDepth(rows[i], RackDepth);
        }

        // Pasillo de cada fila: compartido con la fila de enfrente si también abre hacia él; si no, medio pasillo hacia fuera.
        var walk = new double[n];
        for (var i = 0; i < n; i++)
        {
            var j = i + facing[i];
            walk[i] = j >= 0 && j < n && facing[j] == -facing[i] && Math.Abs(rows[j].X - rows[i].X) <= 4 * HalfAisle
                ? Round((rows[i].X + rows[j].X) / 2)
                : Round(rows[i].X + facing[i] * HalfAisle);
        }
        // Nombre del pasillo: el pasillo de F&O (aisleId) si todas las caras que dan a él lo comparten; si no, 1, 2… de izquierda a derecha.
        var names = walk.Distinct().Order().Select((x, k) =>
        {
            var ids = rows.Where((_, i) => walk[i] == x).SelectMany(r => r.Locs).Select(l => Structured(l) ? l.AisleId!.Trim() : null).Distinct().ToList();
            return (x, name: ids is [{ } only] ? only : (k + 1).ToString());
        }).ToDictionary(t => t.x, t => t.name);

        for (var i = 0; i < n; i++)
        {
            var ys = rows[i].Locs.Select(l => l.Y).Distinct().Order().ToList();
            var spacing = ys.Count > 1 ? ys.Zip(ys.Skip(1), (a, b) => b - a).Min() : MaxSlot;
            // Ancho a lo largo del pasillo: el del perfil (Actual location width), sin pasar de la separación entre posiciones.
            var profileWidth = MaxOf(rows[i].Locs, s => s.Width);
            var sizeY = Round(Math.Min(profileWidth > 0 ? profileWidth : 2.8, spacing) * 0.95);
            // Nivel: el estante de F&O (level) si toda la fila lo tiene; si no, el orden de la Z.
            var byShelf = rows[i].Locs.All(l => l.Shelf > 0);
            double Key(SiteLocation l) => byShelf ? l.Shelf : Round(l.Z);
            var keys = rows[i].Locs.Select(Key).Distinct().Order().ToList();
            var bases = Elevations(rows[i].Locs.Select(l => (l, l.Y.ToString(System.Globalization.CultureInfo.InvariantCulture), keys.IndexOf(Key(l)))));
            var cx = Round(rows[i].X - facing[i] * depth[i] / 2);
            foreach (var l in rows[i].Locs)
            {
                var level = keys.IndexOf(Key(l));
                var baseZ = bases.TryGetValue(l.Id, out var b) ? b : (double?)null;
                locations.Add(new Location(l.Id, level > 0 ? "BULK" : "PICK", names[walk[i]], ys.IndexOf(l.Y) + 1, level,
                    cx, l.Y, l.Z, l.Profile ?? "", Round(depth[i]), sizeY, baseZ is null ? 1.0 : l.Size!.Height, baseZ));
            }
        }
        foreach (var (x, name) in names.OrderBy(kv => kv.Key).Select(kv => (kv.Key, kv.Value)))
        {
            var served = rows.Where((_, i) => walk[i] == x).ToList();
            var half = MaxSlot / 2;
            aisles.Add(new LayoutAisle(name, name, x, Round(served.Min(r => r.MinY) - half), Round(served.Max(r => r.MaxY) + half)));
        }
    }

    // Altura a la que empieza cada ubicación: la suma de las alturas reales (perfil) de las que tiene debajo en su columna.
    // Solo para columnas en las que todas tienen altura en el perfil; las demás se quedan sin BaseZ (nivel × altura de nivel).
    private static Dictionary<string, double> Elevations(IEnumerable<(SiteLocation Loc, string Column, int Level)> slots)
    {
        var result = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        foreach (var column in slots.GroupBy(s => s.Column))
        {
            if (column.Any(s => s.Loc.Size is not { Height: > 0 })) continue;
            double z = 0;
            foreach (var s in column.OrderBy(s => s.Level))
            {
                result[s.Loc.Id] = Round(z);
                z += s.Loc.Size!.Height;
            }
        }
        return result;
    }

    private static double MaxOf(IEnumerable<SiteLocation> locs, Func<ProfileSize, double> measure) =>
        locs.Select(l => l.Size is { } s ? measure(s) : 0).DefaultIfEmpty(0).Max();

    private static bool Structured(SiteLocation l) => l.Rack > 0 && !string.IsNullOrWhiteSpace(l.AisleId) && l.AisleId.Trim('-').Length > 0;

    private static List<Slot> SlotsOf(List<SiteLocation> group)
    {
        if (group.All(Structured))
        {
            return group.Select(l => new Slot(l, l.Rack % 2 == 1, (l.Rack + 1) / 2, Math.Max(l.Shelf - 1, 0), Math.Max(l.Bin, 1))).ToList();
        }
        // Sin estructura: en orden de ID, alternando caras; el nivel sale de la Z si la hay.
        return group.OrderBy(l => l.Id, StringComparer.OrdinalIgnoreCase)
            .Select((l, i) => new Slot(l, i % 2 == 0, i / 2 + 1, Math.Max((int)Math.Round(l.Z), 0), 1))
            .ToList();
    }

    private static double Round(double v) => Math.Round(v, 2);
}
