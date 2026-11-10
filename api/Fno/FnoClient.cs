using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Wh3d.Api.Fno;

// Lee Finance por OData estándar (/data/...) con client credentials. Sin X++.
// App settings: ENTRA_TENANT_ID, FNO_URL, FNO_CLIENT_ID, FNO_CLIENT_SECRET (y FNO_TOKEN_URL solo para pruebas).
public sealed class FnoClient(HttpClient http, ILogger<FnoClient> log)
{
    private readonly string fnoUrl = Setting("FNO_URL").TrimEnd('/');
    private readonly SemaphoreSlim tokenLock = new(1, 1);
    private string? token;
    private DateTimeOffset tokenExpires;

    // GET /data/{entitySet}?$filter=...&$select=...&$orderby=...&$top=...&cross-company=true
    public async Task<List<T>> QueryAsync<T>(string entitySet, string filter, string select, string? orderBy, int? top, CancellationToken ct)
    {
        var query = new List<string>
        {
            "cross-company=true",
            "$filter=" + Uri.EscapeDataString(filter),
            "$select=" + Uri.EscapeDataString(select),
        };
        if (orderBy is not null) query.Add("$orderby=" + Uri.EscapeDataString(orderBy));
        if (top is not null) query.Add("$top=" + top);
        return (await GetAsync<T>(entitySet, query, ct)).Value;
    }

    // Una página y el total que cumple el filtro ($skip, $top y $count=true): para listas paginadas.
    public async Task<(List<T> Rows, long Total)> QueryPageAsync<T>(string entitySet, string filter, string select, string orderBy, int skip, int top, CancellationToken ct)
    {
        var query = new List<string>
        {
            "cross-company=true",
            "$filter=" + Uri.EscapeDataString(filter),
            "$select=" + Uri.EscapeDataString(select),
            "$orderby=" + Uri.EscapeDataString(orderBy),
            "$skip=" + skip,
            "$top=" + top,
            "$count=true",
        };
        var page = await GetAsync<T>(entitySet, query, ct);
        return (page.Value, page.Count ?? page.Value.Count);
    }

    private async Task<ODataList<T>> GetAsync<T>(string entitySet, List<string> query, CancellationToken ct)
    {
        var url = $"{fnoUrl}/data/{entitySet}?{string.Join('&', query)}";

        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await GetTokenAsync(ct));
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var watch = System.Diagnostics.Stopwatch.StartNew();
        HttpResponseMessage res;
        try
        {
            res = await http.SendAsync(req, ct);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            throw new FnoUnavailableException($"No llego a F&O: {e.Message}", e);
        }

        using (res)
        {
            var text = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                log.LogError("F&O {EntitySet} respondió {Status}: {Body}", entitySet, (int)res.StatusCode, Truncate(text));
                throw new FnoUnavailableException($"F&O {entitySet} respondió {(int)res.StatusCode}");
            }
            var list = JsonSerializer.Deserialize<ODataList<T>>(text, Json.Options) ?? new ODataList<T>([]);
            // Para saber qué entidad tarda (en un Tier-1 recién arrancado, decenas de segundos).
            log.LogInformation("F&O {EntitySet}: {Rows} filas, {Bytes} B en {Ms} ms", entitySet, list.Value.Count, text.Length, watch.ElapsedMilliseconds);
            return list;
        }
    }

    // Literal OData de texto: 'abc' con las comillas simples duplicadas.
    public static string Lit(string value) => "'" + value.Replace("'", "''") + "'";

    private async Task<string> GetTokenAsync(CancellationToken ct)
    {
        if (token is not null && DateTimeOffset.UtcNow < tokenExpires) return token;
        await tokenLock.WaitAsync(ct);
        try
        {
            if (token is not null && DateTimeOffset.UtcNow < tokenExpires) return token;

            var tokenUrl = Environment.GetEnvironmentVariable("FNO_TOKEN_URL") is { Length: > 0 } custom
                ? custom
                : $"https://login.microsoftonline.com/{Setting("ENTRA_TENANT_ID")}/oauth2/v2.0/token";
            using var res = await http.PostAsync(tokenUrl, new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = Setting("FNO_CLIENT_ID"),
                ["client_secret"] = Setting("FNO_CLIENT_SECRET"),
                ["scope"] = $"{fnoUrl}/.default",
            }), ct);
            if (!res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync(ct);
                log.LogError("Token de F&O denegado {Status}: {Body}", (int)res.StatusCode, Truncate(body));
                throw new FnoUnavailableException("No consigo token para F&O");
            }
            var payload = await res.Content.ReadFromJsonAsync<TokenResponse>(ct)
                          ?? throw new FnoUnavailableException("Respuesta de token vacía");
            token = payload.access_token;
            tokenExpires = DateTimeOffset.UtcNow.AddSeconds(Math.Max(60, payload.expires_in - 300));
            log.LogInformation("Token de F&O renovado; caduca {Expires:t}", tokenExpires);
            return token;
        }
        catch (HttpRequestException e)
        {
            throw new FnoUnavailableException($"No llego al servidor de tokens: {e.Message}", e);
        }
        finally
        {
            tokenLock.Release();
        }
    }

    private static string Setting(string name) =>
        Environment.GetEnvironmentVariable(name) is { Length: > 0 } v ? v : throw new InvalidOperationException($"Falta el app setting {name}");

    private static string Truncate(string s) => s.Length <= 400 ? s : s[..400] + "…";

    private sealed record ODataList<T>(List<T> Value)
    {
        [System.Text.Json.Serialization.JsonPropertyName("@odata.count")] public long? Count { get; init; }
    }

    private sealed record TokenResponse(string access_token, int expires_in);
}

public sealed class FnoUnavailableException(string message, Exception? inner = null) : Exception(message, inner);
