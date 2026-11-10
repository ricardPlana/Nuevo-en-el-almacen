namespace Wh3d.Api.Models;

// Tipos del hub (/hub/, docs/api-contract.md § Hub). Solo lectura, como el resto de la API.

// Empresa con almacenes de gestión avanzada (WMS): las demás no tienen nada que enseñar en el hub.
public sealed record HubCompany(string Company, string Name, int Warehouses);

public sealed record HubWarehouse(string WarehouseId, string Name);

// Resumen para la tarjeta del almacén. Locations = 0: sin plano (ni nave ni ubicaciones).
public sealed record HubWarehouseSummary(
    string WarehouseId,
    string Name,
    int Locations,
    int LocationsWithStock,
    int Aisles,
    int OpenWorks,
    Building? Building,
    string DistanceStrategy,
    string SortAlgorithm,
    string? StartLocation);

public sealed record HubPage<T>(long Total, IReadOnlyList<T> Items);

// Quién tiene cogido el work en la app móvil (Locked by): usuario móvil y nombre del empleado.
public sealed record HubWorker(string UserId, string? Name);

public sealed record HubWork(
    string WorkId,
    string WarehouseId,
    string Status,
    string OrderType,
    string? OrderNumber,
    string? LoadId,
    int Lines,
    DateTimeOffset? StartedAt,
    DateTimeOffset? ClosedAt,
    HubWorker? LockedBy);

// Carga vista desde sus works en el almacén. Status: Open (algún work abierto) | Closed | Cancelled (todos cancelados).
public sealed record HubLoad(string LoadId, string WarehouseId, string Status, int Works, int OpenWorks, string? LoadStatus);

// Una carga por dentro: sus pedidos y, en cada uno, sus works.
// Stage: Picking (quedan picks o el put del primer tramo) | Staged (mercancía en StageLocation, p. ej. STAGE-OUT) | Loaded | Cancelled.
public sealed record HubLoadPick(int LineNum, string LocationId, string? ItemId, string? ItemName, double Qty, string? Unit, bool Done);

public sealed record HubLoadWork(string WorkId, string Status, string Stage, string? StageLocation, HubWorker? LockedBy, IReadOnlyList<HubLoadPick> Picks, string? LoadId = null);

public sealed record HubLoadOrder(string? OrderNumber, IReadOnlyList<HubLoadWork> Works);

public sealed record HubLoadDetail(string LoadId, string WarehouseId, string? LoadStatus, IReadOnlyList<HubLoadOrder> Orders);

// Pedido de venta con works abiertos o en curso en el almacén. Works: los abiertos o en curso; InProcess: los en curso.
public sealed record HubOrder(
    string OrderNumber,
    string? CustomerAccount,
    string? CustomerName,
    string? Status,
    DateTimeOffset? RequestedShipping,
    int Works,
    int InProcess,
    IReadOnlyList<string> Loads);

public sealed record HubOrderDetail(string OrderNumber, string WarehouseId, IReadOnlyList<HubLoadWork> Works);

public sealed record HubItem(string ItemId, string Name, string Unit, double Qty, int Locations, int Warehouses);

public sealed record HubItemLocation(
    string WarehouseId,
    string LocationId,
    double Qty,
    string? LicensePlate,
    string? InventoryStatus,
    FnoLocation? Fno);

public sealed record HubItemStock(
    string ItemId,
    string Name,
    string Unit,
    double Qty,
    int OpenPicks,
    double OpenPickQty,
    IReadOnlyList<HubItemLocation> Locations);

// Ubicación (WarehouseLocations) con lo que tiene: disponible físico, artículos distintos y picks pendientes.
public sealed record HubLocation(
    string LocationId,
    string? Zone,
    string? Aisle,
    int Rack,
    int Shelf,
    int Bin,
    string? Profile,
    double X,
    double Y,
    double Z,
    double Qty,
    int Items,
    IReadOnlyList<string> ItemIds,
    int OpenPicks);

public sealed record HubLocationDetail(HubLocation Location, IReadOnlyList<StockItem> Contents, IReadOnlyList<OpenPick> Picks);

// Valores para los desplegables de la lista de ubicaciones.
public sealed record HubLocationFacets(int Total, IReadOnlyList<string> Zones, IReadOnlyList<string> Aisles, IReadOnlyList<string> Profiles);

// Ocupación de un grupo de ubicaciones (un pasillo, una zona o el almacén entero). Key null: sin pasillo / sin zona.
public sealed record HubOccupancyGroup(string? Key, int Total, int WithStock, int WithPicks);

public sealed record HubOccupancy(HubOccupancyGroup Warehouse, IReadOnlyList<HubOccupancyGroup> Aisles, IReadOnlyList<HubOccupancyGroup> Zones);

// Revisión de operarios: usuarios de la app móvil y los picks que han completado.
public sealed record HubOperator(string UserId, string? Name);

public sealed record HubPick(
    string WorkId,
    int LineNum,
    string? UserId,
    string? UserName,
    DateTimeOffset? ClosedAt,
    string LocationId,
    string? ItemId,
    string? ItemName,
    double Qty,
    string? Unit,
    double Seconds,
    string? OrderNumber,
    string? LoadId);

// Total: picks que cumplen el filtro; Works y Seconds, de todos ellos, no solo de la página.
public sealed record HubPicks(long Total, int Works, double Seconds, IReadOnlyList<HubPick> Items);

// Resultado del buscador: Kind = work | load | location | item.
public sealed record HubMatch(string Kind, string Id, string? WarehouseId, string Label);

// «Tu trabajo ahora»: el work que el usuario tiene cogido en la app móvil.
public sealed record HubMyWork(string WorkId, string WarehouseId, int Picks, double TotalDistance, string? FirstLocation);
