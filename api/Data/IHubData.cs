using Wh3d.Api.Models;

namespace Wh3d.Api.Data;

// Datos del hub (/hub/): listas paginadas de empresas, almacenes, works, cargas y artículos. Solo lectura.
// company: dataAreaId de ?company=; null = la de FNO_COMPANY. Works y cargas: status open | closed | all, y cancelled
// añade los cancelados (que no entran ni en abiertos ni en cerrados).
public interface IHubData
{
    Task<IReadOnlyList<HubCompany>> ListCompaniesAsync(CancellationToken ct);
    Task<IReadOnlyList<HubWarehouse>> ListWarehousesAsync(string? company, CancellationToken ct);
    Task<HubWarehouseSummary?> WarehouseSummaryAsync(string warehouseId, string? company, CancellationToken ct);
    Task<HubPage<HubWork>> ListWorksAsync(string warehouseId, string? company, string status, bool cancelled, string? q, int skip, int top, CancellationToken ct);
    Task<HubPage<HubLoad>> ListLoadsAsync(string warehouseId, string? company, string status, bool cancelled, string? q, int skip, int top, CancellationToken ct);
    // Artículos liberados de la empresa. withStock: solo los que tienen stock; warehouseId: solo los que tienen stock en ese almacén.
    // La carga por dentro: pedido → works, con su estado (ver HubLoadWork). Los cancelados, solo con cancelled o si está toda cancelada.
    Task<HubLoadDetail?> LoadDetailAsync(string loadId, string warehouseId, string? company, bool cancelled, CancellationToken ct);
    // Pedidos de venta con works abiertos o en curso en el almacén; q busca en el pedido y en el cliente.
    Task<HubPage<HubOrder>> ListOrdersAsync(string warehouseId, string? company, string? q, int skip, int top, CancellationToken ct);
    // Los works del pedido en el almacén (sin los cancelados).
    Task<HubOrderDetail?> OrderDetailAsync(string orderNumber, string warehouseId, string? company, CancellationToken ct);
    Task<HubPage<HubItem>> ListItemsAsync(string? warehouseId, bool withStock, string? company, string? q, int skip, int top, CancellationToken ct);
    Task<HubItemStock?> ItemStockAsync(string itemId, string? warehouseId, string? company, CancellationToken ct);
    Task<IReadOnlyList<HubMatch>> ResolveAsync(string q, string? company, CancellationToken ct);
    Task<IReadOnlyList<HubMyWork>> MyWorksAsync(string email, string? company, CancellationToken ct);

    // Ubicaciones del almacén. filter: all | stock | empty | picks; zone/aisle/profile: valores de F&O; q: código de ubicación o artículo.
    Task<HubPage<HubLocation>> ListLocationsAsync(string warehouseId, string? company, string filter, string? zone, string? aisle, string? profile, string? q,
        int skip, int top, CancellationToken ct);
    Task<HubLocationFacets> LocationFacetsAsync(string warehouseId, string? company, CancellationToken ct);
    Task<HubLocationDetail?> LocationAsync(string warehouseId, string locationId, string? company, CancellationToken ct);

    // Ubicaciones con stock, vacías y con picks pendientes, por pasillo y por zona.
    Task<HubOccupancy> OccupancyAsync(string warehouseId, string? company, CancellationToken ct);

    // Revisión de operarios: picks cerrados en [from, to), del almacén y, si se indica, de ese usuario móvil. Más recientes primero.
    Task<IReadOnlyList<HubOperator>> ListOperatorsAsync(string? company, CancellationToken ct);
    Task<HubPicks> ListPicksAsync(string warehouseId, string? company, DateTimeOffset from, DateTimeOffset to, string? userId, int skip, int top, CancellationToken ct);
}

// Con MOCK_MODE el hub no tiene de dónde sacar empresas ni artículos: listas vacías.
public sealed class MockHubData : IHubData
{
    public Task<IReadOnlyList<HubCompany>> ListCompaniesAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<HubCompany>>([]);
    public Task<IReadOnlyList<HubWarehouse>> ListWarehousesAsync(string? company, CancellationToken ct) => Task.FromResult<IReadOnlyList<HubWarehouse>>([]);
    public Task<HubWarehouseSummary?> WarehouseSummaryAsync(string warehouseId, string? company, CancellationToken ct) => Task.FromResult<HubWarehouseSummary?>(null);
    public Task<HubPage<HubWork>> ListWorksAsync(string warehouseId, string? company, string status, bool cancelled, string? q, int skip, int top, CancellationToken ct) =>
        Task.FromResult(new HubPage<HubWork>(0, []));
    public Task<HubPage<HubLoad>> ListLoadsAsync(string warehouseId, string? company, string status, bool cancelled, string? q, int skip, int top, CancellationToken ct) =>
        Task.FromResult(new HubPage<HubLoad>(0, []));
    public Task<HubLoadDetail?> LoadDetailAsync(string loadId, string warehouseId, string? company, bool cancelled, CancellationToken ct) => Task.FromResult<HubLoadDetail?>(null);
    public Task<HubPage<HubOrder>> ListOrdersAsync(string warehouseId, string? company, string? q, int skip, int top, CancellationToken ct) =>
        Task.FromResult(new HubPage<HubOrder>(0, []));
    public Task<HubOrderDetail?> OrderDetailAsync(string orderNumber, string warehouseId, string? company, CancellationToken ct) => Task.FromResult<HubOrderDetail?>(null);
    public Task<HubPage<HubItem>> ListItemsAsync(string? warehouseId, bool withStock, string? company, string? q, int skip, int top, CancellationToken ct) =>
        Task.FromResult(new HubPage<HubItem>(0, []));
    public Task<HubItemStock?> ItemStockAsync(string itemId, string? warehouseId, string? company, CancellationToken ct) => Task.FromResult<HubItemStock?>(null);
    public Task<IReadOnlyList<HubMatch>> ResolveAsync(string q, string? company, CancellationToken ct) => Task.FromResult<IReadOnlyList<HubMatch>>([]);
    public Task<IReadOnlyList<HubMyWork>> MyWorksAsync(string email, string? company, CancellationToken ct) => Task.FromResult<IReadOnlyList<HubMyWork>>([]);
    public Task<HubPage<HubLocation>> ListLocationsAsync(string warehouseId, string? company, string filter, string? zone, string? aisle, string? profile, string? q,
        int skip, int top, CancellationToken ct) => Task.FromResult(new HubPage<HubLocation>(0, []));
    public Task<HubLocationFacets> LocationFacetsAsync(string warehouseId, string? company, CancellationToken ct) => Task.FromResult(new HubLocationFacets(0, [], [], []));
    public Task<HubLocationDetail?> LocationAsync(string warehouseId, string locationId, string? company, CancellationToken ct) => Task.FromResult<HubLocationDetail?>(null);
    public Task<HubOccupancy> OccupancyAsync(string warehouseId, string? company, CancellationToken ct) =>
        Task.FromResult(new HubOccupancy(new HubOccupancyGroup(null, 0, 0, 0), [], []));
    public Task<IReadOnlyList<HubOperator>> ListOperatorsAsync(string? company, CancellationToken ct) => Task.FromResult<IReadOnlyList<HubOperator>>([]);
    public Task<HubPicks> ListPicksAsync(string warehouseId, string? company, DateTimeOffset from, DateTimeOffset to, string? userId, int skip, int top, CancellationToken ct) =>
        Task.FromResult(new HubPicks(0, 0, 0, []));
}
