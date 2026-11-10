using Wh3d.Api.Models;

namespace Wh3d.Api.Services;

// LocationDetail a partir del layout: sirve para cualquier ubicación, tenga o no fichero mock.
public static class LocationDetails
{
    public static LocationDetail? Build(Layout layout, string locationId)
    {
        var loc = layout.Locations.FirstOrDefault(l => string.Equals(l.LocationId, locationId, StringComparison.OrdinalIgnoreCase));
        if (loc is null) return null;

        var neighbours = layout.Locations
            .Where(o => o.LocationId != loc.LocationId)
            .OrderBy(o => Distance.CityBlock(loc.X, loc.Y, loc.Z, o.X, o.Y, o.Z))
            .ThenBy(o => o.LocationId, StringComparer.Ordinal)
            .Take(4)
            .Select(o => o.LocationId)
            .ToList();

        return new LocationDetail(
            loc.LocationId, loc.Zone, loc.Aisle, loc.Rack, loc.Level, loc.X, loc.Y, loc.Z, loc.Profile,
            loc.SizeX, loc.SizeY, loc.SizeZ,
            DeepLinkTeams: DeepLinks.Teams($"loc:{loc.LocationId}"),
            DeepLinkWeb: DeepLinks.Web("locationId", loc.LocationId),
            Neighbours: neighbours,
            Fno: loc.Fno);
    }
}
