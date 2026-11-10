namespace Wh3d.Api.Models;

// Tipos del contrato (docs/api-contract.md). Se serializan en camelCase.

public sealed record Location(
    string LocationId,
    string Zone,
    string Aisle,
    int Rack,
    int Level,
    double X,
    double Y,
    double Z,
    string Profile,
    double? SizeX = null,
    double? SizeY = null,
    double? SizeZ = null,
    double? BaseZ = null, // metros desde el suelo donde empieza el hueco (alturas del perfil apiladas); sin él, nivel × levelHeight
    FnoLocation? Fno = null); // la ubicación tal cual está en F&O; Zone/Aisle/Rack/Level/X de arriba son los del dibujo

// Campos de la ubicación en F&O (WarehouseLocations), sin tocar: zona de WHS, pasillo, rack, estante, hueco y coordenadas.
public sealed record FnoLocation(string? Zone, string? Aisle, int Rack, int Shelf, int Bin, double X, double Y, double Z);

public sealed record Bounds(double MinX, double MaxX, double MinY, double MaxY, int MaxLevel);

public sealed record Layout(
    string WarehouseId,
    string Name,
    Bounds Bounds,
    IReadOnlyList<Location> Locations,
    IReadOnlyList<string> PutLocations,
    string DistanceStrategy,
    string SortAlgorithm,
    Building? Building = null,
    IReadOnlyList<LayoutZone>? Zones = null,
    IReadOnlyList<LayoutAisle>? Aisles = null,
    double? LevelHeight = null); // metros por nivel de estantería; sin él, el 3D usa su valor por defecto

// Nave (campos D365_* del almacén en F&O), en metros. Origen (0, 0) en la esquina de la zona 1; X = largo, Y = ancho.
public sealed record Building(double Length, double Width, double ClearHeight, double RackHeight);

// Zona física (tabla D365_InventLocationZones), en el orden de Number a lo largo de la nave.
// Function: Receiving | PutAway | Storage | Consolidation | Shipping.
public sealed record LayoutZone(int Number, string Name, string Function, double X, double Length, double Width);

// Pasillo de doble cara: X es el centro del pasillo (por donde se camina); las estanterías quedan a cada lado.
public sealed record LayoutAisle(string AisleId, string Name, double X, double MinY, double MaxY);

public sealed record RouteLine(
    int LineNum,
    string WorkType,
    string LocationId,
    string ItemId,
    string ItemName,
    double Qty,
    string Unit,
    double X,
    double Y,
    double Z,
    double DistanceToNext,
    DateTimeOffset? PickedAt = null); // hora real del pick (works en curso o cerrados)

public sealed record PutLocation(string LocationId, double X, double Y, double Z);

public sealed record Route(
    string WorkId,
    string? LoadId,
    string WarehouseId,
    string WorkStatus,
    string Strategy,
    string Algorithm,
    PutLocation PutLocation,
    IReadOnlyList<RouteLine> Lines,
    double TotalDistance,
    IReadOnlyList<string> Explanation,
    DateTimeOffset? StartedAt = null,
    DateTimeOffset? ClosedAt = null,
    PutLocation? StartLocation = null, // de dónde sale el picker (D365_UbicacionInicio del almacén); F&O no lo usa al ordenar
    string? PreviousPut = null, // la ruta es un tramo posterior del work: dónde se dejó la mercancía en el anterior (STAGE-OUT)
    string? OrderNumber = null); // pedido del work (SourceOrderNumber)

// Fila del histórico de works (GET /warehouses/{wh}/works).
public sealed record WorkSummary(
    string WorkId,
    string? LoadId,
    string WarehouseId,
    string WorkStatus,
    DateTimeOffset? StartedAt,
    DateTimeOffset? ClosedAt);

// Aviso "tu ruta" (GET /works/started): work que un operario acaba de coger en la app móvil de almacén
// (Locked by de F&O), con a quién avisar y la tarjeta ya montada. Email: el de Entra del empleado
// (Workers.IdentityEmail) o, si no tiene usuario, su correo de contacto. CardJson: Adaptive Card como texto,
// lista para el campo "Adaptive Card" de la acción de Teams en Power Automate.
public sealed record StartedWork(
    string WorkId,
    string WarehouseId,
    string? LoadId,
    string WorkStatus,
    DateTimeOffset? StartedAt,
    string UserId,
    string? PersonnelNumber,
    string? WorkerName,
    string? Email,
    int Picks,
    double TotalDistance,
    string CardJson);

// Vista de almacén (GET /warehouses/{wh}/stock): qué hay en cada ubicación y qué picks tiene pendientes.
// Solo vienen las ubicaciones con stock o con picks abiertos. QtyBasis dice qué cantidad es (AvailablePhysical en F&O).
public sealed record StockItem(string ItemId, string ItemName, double Qty, string Unit, string? LicensePlate, string? InventoryStatus);

public sealed record OpenPick(string WorkId, int LineNum, string ItemId, double Qty, string Unit);

public sealed record LocationStock(string LocationId, double Qty, IReadOnlyList<StockItem> Items, IReadOnlyList<OpenPick> OpenPicks);

public sealed record WarehouseStock(string WarehouseId, DateTimeOffset AsOf, string QtyBasis, IReadOnlyList<LocationStock> Locations);

public sealed record LocationDetail(
    string LocationId,
    string Zone,
    string Aisle,
    int Rack,
    int Level,
    double X,
    double Y,
    double Z,
    string Profile,
    double? SizeX,
    double? SizeY,
    double? SizeZ,
    string DeepLinkTeams,
    string DeepLinkWeb,
    IReadOnlyList<string> Neighbours,
    FnoLocation? Fno = null);
