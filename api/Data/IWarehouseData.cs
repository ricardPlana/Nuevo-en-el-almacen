using Wh3d.Api.Models;

namespace Wh3d.Api.Data;

// Fuente de datos: mock (JSON de swa/public/mock) o F&O (Tarea 6). Devuelve null si no existe.
// company: empresa de F&O (dataAreaId) que llega en ?company=; null = la de FNO_COMPANY. El mock la ignora.
public interface IWarehouseData
{
    Task<Layout?> GetLayoutAsync(string warehouseId, string? company, CancellationToken ct);
    Task<Route?> GetRouteAsync(string workId, string? company, CancellationToken ct);
    Task<IReadOnlyList<Route>?> GetLoadRoutesAsync(string loadId, string? company, CancellationToken ct);

    // Histórico: works de venta del almacén. status: open | closed | all. Más recientes primero.
    Task<IReadOnlyList<WorkSummary>> ListWorksAsync(string warehouseId, string? company, string status, int top, CancellationToken ct);

    // Vista de almacén: stock por ubicación y picks abiertos. null si el almacén no existe.
    Task<WarehouseStock?> GetStockAsync(string warehouseId, string? company, CancellationToken ct);

    // Aviso "tu ruta": works de venta que alguien tiene cogidos en la app móvil (Locked by), con su usuario.
    // Las rutas van sin enriquecer (RouteExplanation.Enrich lo hace quien monte la tarjeta). El mock no tiene usuarios.
    Task<IReadOnlyList<(Route Route, string UserId, string? PersonnelNumber, string? WorkerName, string? Email)>> LockedWorksAsync(
        string? warehouseId, string? company, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<(Route, string, string?, string?, string?)>>([]);

    // Botón ↻ de la SPA (?refresh=1): olvida el plano en caché para volver a leerlo de la fuente. El mock no tiene caché.
    void Forget(string warehouseId, string? company) { }
}
