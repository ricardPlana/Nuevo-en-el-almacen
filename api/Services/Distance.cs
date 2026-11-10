namespace Wh3d.Api.Services;

// Fórmulas de F&O (Warehouse spatial location). La altura se suma entera en origen y destino.
public static class Distance
{
    public static double CityBlock(double x1, double y1, double z1, double x2, double y2, double z2) =>
        Math.Abs(x2 - x1) + Math.Abs(y2 - y1) + Math.Abs(z1) + Math.Abs(z2);

    public static double StraightLine(double x1, double y1, double z1, double x2, double y2, double z2)
    {
        var dz = Math.Abs(z1) + Math.Abs(z2);
        return Math.Sqrt(Math.Pow(x2 - x1, 2) + Math.Pow(y2 - y1, 2) + dz * dz);
    }

    public static double For(string strategy, double x1, double y1, double z1, double x2, double y2, double z2) =>
        strategy == "StraightLine" ? StraightLine(x1, y1, z1, x2, y2, z2) : CityBlock(x1, y1, z1, x2, y2, z2);
}
